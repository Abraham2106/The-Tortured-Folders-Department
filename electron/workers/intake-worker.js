import { parentPort, workerData } from 'worker_threads';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { createClassificationPrompt } from './classifier-prompt.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const PDFParser = require('pdf2json');

const { profileId, watchFolders, proxyUrl, model } = workerData;
let watcher = null;

const classifyFile = async (extractedText, structureMap) => {
  if (!proxyUrl) throw new Error('Proxy URL not configured');
  const prompt = createClassificationPrompt(structureMap, extractedText);
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
};

console.log('Intake Worker started (ESM with pdf2json)...');

// -- Global error shields --
process.on('uncaughtException', (err) => {
  console.error('CRITICAL WORKER ERROR (Caught):', err.message);
  parentPort.postMessage({ event: 'error', message: `Internal processing error: ${err.message}` });
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION (Caught):', reason);
});

// -- PDF extraction logic --
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
      } catch (e) { reject(e); }
    });

    try { pdfParser.loadPDF(filePath); } 
    catch (err) { clearTimeout(timeout); reject(err); }
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

// -- Watcher --
const initWatcher = () => {
  if (watcher) watcher.close();
  if (!watchFolders || watchFolders.length === 0) return;

  const paths = watchFolders.map(f => f.path);
  console.log(`Watching: ${paths.join(', ')}`);

  watcher = chokidar.watch(paths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
  });

  watcher.on('add', async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.pdf', '.docx', '.md', '.txt'].includes(ext)) return;

    console.log(`New file detected: ${filePath}`);
    parentPort.postMessage({ event: 'file_detected', profileId, filePath });

    let text = await extractText(filePath);
    if (!text) {
      console.log(`Fallback to filename for: ${path.basename(filePath)}`);
      text = `[Contenido ilegible. Clasificar solo por nombre de archivo: ${path.basename(filePath)}]`;
    }

    parentPort.postMessage({ event: 'text_extracted', profileId, filePath, text });
    parentPort.postMessage({ event: 'request_truth_source', profileId });

    const onStructure = async (msg) => {
      if (msg.event === 'truth_source') {
        parentPort.off('message', onStructure);
        try {
          const decision = await classifyFile(text, msg.structureMap);
          console.log(`AI Decision for ${path.basename(filePath)}:`, decision);
          
          if (decision.confidence === 'high' && decision.relative_path) {
            parentPort.postMessage({
              event: 'execute_move',
              profileId,
              filePath,
              relativePath: decision.relative_path,
              newFolderName: decision.new_folder_name,
              reason: decision.reason
            });
          } else {
            parentPort.postMessage({ event: 'error', profileId, filePath, message: 'Low confidence' });
          }
        } catch (err) {
          parentPort.postMessage({ event: 'error', profileId, filePath, message: 'AI Classification failed' });
        }
      }
    };
    parentPort.on('message', onStructure);
  });
};

initWatcher();

parentPort.on('message', (msg) => {
  if (msg.event === 'update_folders') {
    // Logic to reload watcher can be added here
  }
});
