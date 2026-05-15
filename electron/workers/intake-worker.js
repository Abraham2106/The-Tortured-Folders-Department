import { parentPort, workerData } from 'worker_threads';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import process from 'node:process';
import { createRequire } from 'module';
import { createClassificationPrompt } from './classifier-prompt.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const PDFParser = require('pdf2json');

const { profileId, watchFolders, proxyUrl, model } = workerData;
let watcher = null;

const normalizeRelativePath = (value) => {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');

  return normalized || null;
};

const normalizeAlternatives = (alternatives, primaryPath) => {
  if (!Array.isArray(alternatives)) return [];

  return [...new Set(
    alternatives
      .map((value) => normalizeRelativePath(value))
      .filter((value) => value && value !== primaryPath)
  )].slice(0, 3);
};

const normalizeFoldersToCreate = (folders, primaryPath) => {
  if (!Array.isArray(folders)) return [];

  return [...new Set(
    folders
      .map((value) => normalizeRelativePath(value))
      .filter(Boolean)
  )]
    .sort((left, right) => left.split('/').length - right.split('/').length)
    .filter((folder) => !primaryPath || primaryPath === folder || primaryPath.startsWith(`${folder}/`));
};

const normalizeDecision = (decision = {}) => {
  const confidence = ['high', 'medium', 'low'].includes(decision.confidence)
    ? decision.confidence
    : 'low';
  const relativePath = normalizeRelativePath(decision.relative_path);

  return {
    thinking: typeof decision.thinking === 'string' ? decision.thinking.trim() : '',
    subject_name: typeof decision.subject_name === 'string' ? decision.subject_name.trim() : '',
    document_type: typeof decision.document_type === 'string' ? decision.document_type.trim() : 'otro',
    academic_period: typeof decision.academic_period === 'string' ? decision.academic_period.trim() : null,
    confidence,
    relative_path: relativePath,
    folders_to_create: normalizeFoldersToCreate(decision.folders_to_create, relativePath),
    new_folder_name: typeof decision.new_folder_name === 'string' && decision.new_folder_name.trim()
      ? decision.new_folder_name.trim()
      : null,
    reason: typeof decision.reason === 'string' && decision.reason.trim()
      ? decision.reason.trim()
      : 'La clasificacion no incluyo una justificacion clara.',
    suggested_alternatives: normalizeAlternatives(decision.suggested_alternatives, relativePath)
  };
};

const chooseBestRelativePath = (decision) => (
  decision.relative_path || decision.suggested_alternatives[0] || null
);

const classifyFile = async (extractedText, structureMap, fileName, recentClassifications = []) => {
  if (!proxyUrl) throw new Error('Proxy URL no configurada');

  const prompt = createClassificationPrompt(
    structureMap,
    extractedText,
    fileName,
    recentClassifications
  );

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const rawContent = data.choices[0].message.content;

  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    return normalizeDecision(parsed);
  } catch {
    throw new Error(`Respuesta del clasificador no es JSON valido: ${rawContent}`);
  }
};

console.log('Intake Worker started (ESM with pdf2json)...');

process.on('uncaughtException', (err) => {
  console.error('CRITICAL WORKER ERROR (Caught):', err.message);
  parentPort.postMessage({ event: 'error', message: `Internal processing error: ${err.message}` });
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION (Caught):', reason);
});

const extractPdfText = (filePath) => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    const timeout = setTimeout(() => {
      pdfParser.removeAllListeners();
      reject(new Error('PDF Extraction Timeout'));
    }, 10000);

    pdfParser.on('pdfParser_dataError', (err) => {
      clearTimeout(timeout);
      reject(err.parserError || err);
    });

    pdfParser.on('pdfParser_dataReady', () => {
      clearTimeout(timeout);
      try {
        const raw = pdfParser.getRawTextContent()
          .replace(/\r\n|\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();
        resolve(raw.slice(0, 1500));
      } catch (error) {
        reject(error);
      }
    });

    try {
      pdfParser.loadPDF(filePath);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
};

const extractText = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.pdf') return await extractPdfText(filePath);
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value.slice(0, 1500);
    }
    if (ext === '.md' || ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8').slice(0, 1500);
    }
  } catch (err) {
    console.error(`Extraction error for ${filePath}:`, err);
    return null;
  }

  return null;
};

const initWatcher = () => {
  if (watcher) watcher.close();
  if (!watchFolders || watchFolders.length === 0) return;

  const paths = watchFolders.map((folder) => folder.path);
  console.log(`Watching: ${paths.join(', ')}`);

  watcher = chokidar.watch(paths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
  });

  watcher.on('add', async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.pdf', '.docx', '.md', '.txt'].includes(ext)) return;

    const fileName = path.basename(filePath);
    console.log(`New file detected: ${filePath}`);
    parentPort.postMessage({ event: 'file_detected', profileId, filePath });

    let text = await extractText(filePath);
    if (!text) {
      console.log(`Fallback to filename for: ${fileName}`);
      text = `[Sin texto extraible. Clasifica usando solo el nombre del archivo: "${fileName}"]`;
    }

    parentPort.postMessage({ event: 'text_extracted', profileId, filePath, text });
    parentPort.postMessage({ event: 'request_truth_source', profileId });

    const onStructure = async (msg) => {
      if (msg.event !== 'truth_source') return;

      parentPort.off('message', onStructure);

      try {
        const decision = await classifyFile(
          text,
          msg.structureMap,
          fileName,
          msg.recentClassifications
        );

        console.log(`AI Decision for ${fileName}:`, decision);

        const bestRelativePath = chooseBestRelativePath(decision);
        const autoReason = bestRelativePath && bestRelativePath !== decision.relative_path
          ? `${decision.reason} Ruta alternativa seleccionada automaticamente: ${bestRelativePath}.`
          : decision.reason;

        if (bestRelativePath) {
          parentPort.postMessage({
            event: 'execute_move',
            profileId,
            filePath,
            relativePath: bestRelativePath,
            foldersToCreate: decision.folders_to_create,
            newFolderName: decision.new_folder_name,
            reason: autoReason,
            confidence: decision.confidence,
            alternatives: decision.suggested_alternatives,
            documentType: decision.document_type,
            subjectName: decision.subject_name
          });
          return;
        }

        const reason = decision.confidence !== 'high'
          ? `Low confidence (${decision.confidence}): ${decision.reason}`
          : 'No destination path was determined';

        parentPort.postMessage({
          event: 'low_confidence',
          profileId,
          filePath,
          message: reason,
          alternatives: decision.suggested_alternatives
        });
      } catch (err) {
        console.error('Classification error:', err);
        parentPort.postMessage({
          event: 'error',
          profileId,
          filePath,
          message: `AI Error: ${err.message}`
        });
      }
    };

    parentPort.on('message', onStructure);
  });
};

initWatcher();

parentPort.on('message', (msg) => {
  if (msg.event === 'update_folders') {
    // Logic to reload watcher can be added here.
  }
});
