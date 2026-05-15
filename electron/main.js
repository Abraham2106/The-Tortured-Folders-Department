import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';
import { setupDatabase } from './database/connection.js';
import * as profilesService from './database/profiles.js';
import * as transactionsService from './database/transactions.js';
import * as intakeDb from './database/intake.js';
import { processInstruction } from './logic/instruction-engine.js';
import { calculateDiff } from './logic/diff-engine.js';
import { executeMoves } from './logic/executor.js';
import { performRollback } from './logic/rollback-engine.js';
import * as intakeService from './logic/intake-service.js';
import * as settingsService from './database/settings.js';
import * as hitlLogService from './database/hitl.js';
import {
  buildHitlLogEntries,
  buildHitlProposal,
  cloneDiffs,
  determineRiskLevel,
  validateProposalCollisions,
  areDiffsDifferent
} from './logic/hitl-utils.js';
import fs from 'fs/promises';
import { Worker } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Analyzes filenames to detect date patterns and build smart summaries
const analyzeFilePatterns = (filenames) => {
  const datePattern = /^(.+?)[\s_-](\d{4})[-_](\d{2})[-_](\d{2})/;
  const numberedPattern = /^(.+?)\s*\((\d+)\)(\.\w+)?$/;

  const byDatePrefix = {}; // { "Screenshot": { "2024": Set["04","05",...], "2025": ... } }
  const numbered = [];
  const other = [];

  for (const name of filenames) {
    const dateMatch = name.match(datePattern);
    if (dateMatch) {
      const [, prefix, year, month] = dateMatch;
      const key = prefix.trim();
      if (!byDatePrefix[key]) byDatePrefix[key] = {};
      if (!byDatePrefix[key][year]) byDatePrefix[key][year] = new Set();
      byDatePrefix[key][year].add(month);
      continue;
    }
    const numMatch = name.match(numberedPattern);
    if (numMatch) { numbered.push(name); continue; }
    other.push(name);
  }

  let summary = '';
  for (const [prefix, years] of Object.entries(byDatePrefix)) {
    summary += `  Patrón detectado: "${prefix} YYYY-MM-DD..." → Años disponibles:\n`;
    for (const [year, months] of Object.entries(years).sort()) {
      const monthList = [...months].sort().join(', ');
      summary += `    - ${year}: meses [${monthList}] → Usar patrón glob: "${prefix} ${year}-*."\n`;
    }
  }
  if (numbered.length) summary += `  ${numbered.length} archivos con numeración (ej: "${numbered[0]}", "${numbered[Math.floor(numbered.length / 2)]}")\n`;
  if (other.length > 0 && other.length <= 10) summary += `  Otros archivos: ${other.join(', ')}\n`;
  else if (other.length > 10) summary += `  ${other.length} archivos sin patrón reconocible.\n`;
  return summary || '  (sin archivos)\n';
};

// Recursively builds a directory tree with smart pattern analysis for large dirs
const buildDirectoryTree = async (baseDir, currentDir, depth, maxDepth) => {
  if (depth > maxDepth) return '  '.repeat(depth) + '...\n';

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const indent = '  '.repeat(depth);
    let tree = depth === 0 ? `${currentDir}${path.sep}\n` : '';

    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
    const files = entries.filter(e => e.isFile() && !e.name.startsWith('.'));

    for (const dir of dirs) {
      const fullPath = path.join(currentDir, dir.name);
      tree += `${indent}├── 📁 ${dir.name}${path.sep}\n`;
      tree += await buildDirectoryTree(baseDir, fullPath, depth + 1, maxDepth);
    }

    if (files.length > 30) {
      tree += `${indent}└── 📊 [${files.length} archivos — Análisis de patrones:]\n`;
      tree += analyzeFilePatterns(files.map(f => f.name)).split('\n').map(l => `${indent}   ${l}`).join('\n') + '\n';
    } else {
      for (const file of files) {
        tree += `${indent}├── 📄 ${file.name}\n`;
      }
    }

    return tree;
  } catch (err) {
    return '  '.repeat(depth) + `[Error leyendo carpeta: ${err.message}]\n`;
  }
};

const collectDirectoryPaths = async (baseDir, currentDir, depth, maxDepth) => {
  if (depth > maxDepth) return [];

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const directories = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      directories.push(relativePath);
      directories.push(...await collectDirectoryPaths(baseDir, fullPath, depth + 1, maxDepth));
    }

    return directories;
  } catch {
    return [];
  }
};

const normalizeRelativePath = (value) => {
  if (!value) return '';

  return String(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
};

const getRecentClassificationExamples = (profileId, truthSource, limit = 6) => {
  if (!truthSource?.root_path) return [];

  const transactions = transactionsService.listTransactions(profileId).slice(0, 25);
  const seen = new Set();
  const examples = [];

  for (const transaction of transactions) {
    for (const operation of transaction.operations || []) {
      if (operation.action !== 'move' || operation.status !== 'success') continue;
      if (!operation.source || !operation.target) continue;

      const targetDirectory = path.dirname(operation.target);
      const relativePath = normalizeRelativePath(path.relative(truthSource.root_path, targetDirectory));
      if (relativePath.startsWith('..')) continue;

      const fileName = path.basename(operation.source);
      const destination = relativePath || '(root)';
      const key = `${fileName}->${destination}`;
      if (seen.has(key)) continue;

      seen.add(key);
      examples.push({
        file_name: fileName,
        relative_path: destination
      });

      if (examples.length >= limit) return examples;
    }
  }

  return examples;
};

const buildDiffSummary = (plan, diffs, baseMessage = '') => {
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];
  if (operations.length === 0) return '';

  const globOperations = operations.filter(
    (operation) => operation.type === 'move' && /[*?{[]/.test(operation.pattern || '')
  ).length;
  const moveCount = diffs.filter((diff) => diff.action === 'move' || diff.action === 'move-dir').length;
  const mkdirCount = diffs.filter((diff) => diff.action === 'mkdir').length;

  const summary = [];
  if (!/plan con \d+ operaciones/i.test(baseMessage)) {
    summary.push(`Plan con ${operations.length} operaciones.`);
  }
  if (globOperations > 0) {
    summary.push(`${globOperations} usan glob y afectaran a todos los archivos coincidentes.`);
  }
  if (diffs.length === 0) {
    summary.push('El diff no encontro coincidencias con el directorio actual.');
  } else {
    summary.push(`El diff detecto ${moveCount} movimientos${mkdirCount > 0 ? ` y ${mkdirCount} carpetas por crear` : ''}.`);
  }

  return summary.join(' ');
};

const enrichAssistantMessage = (message, plan, diffs) => {
  const baseMessage = typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Plan generado.';
  const summary = buildDiffSummary(plan, diffs, baseMessage);

  if (!summary) return baseMessage;
  if (baseMessage.includes(summary)) return baseMessage;
  return `${baseMessage} ${summary}`;
};

const broadcastToAllWindows = (channel, payload) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
};

const hitlProposals = new Map();

const serializeProposal = (proposal) => JSON.parse(JSON.stringify(proposal));

const getPendingStatuses = () => new Set(['awaiting_approval', 'modified']);

const upsertHitlProposal = (proposal, type = 'upsert') => {
  hitlProposals.set(proposal.id, proposal);
  broadcastToAllWindows('hitl:proposal', {
    type,
    proposal: serializeProposal(proposal)
  });
  return serializeProposal(proposal);
};

const listPendingHitlProposals = (profileId) => {
  const pendingStatuses = getPendingStatuses();

  return [...hitlProposals.values()]
    .filter((proposal) => proposal.profileId === profileId && pendingStatuses.has(proposal.status))
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((proposal) => serializeProposal(proposal));
};

const buildProposalSummary = (origin, message, diffs) => {
  if (message && message.trim()) return message.trim();

  const actionCount = Array.isArray(diffs) ? diffs.length : 0;
  if (origin === 'intake') {
    return `La mesa de ingreso propone ${actionCount} acciones para archivar el documento.`;
  }

  return `La IA propone ${actionCount} acciones para reorganizar el directorio.`;
};

const createHitlProposal = ({
  profileId,
  source,
  title,
  summary,
  diffs,
  aiConfidence,
  metadata = {}
}) => {
  const proposal = buildHitlProposal({
    profileId,
    source,
    title,
    summary: buildProposalSummary(source, summary, diffs),
    diffs,
    aiConfidence,
    riskLevel: determineRiskLevel({ diffs, summary, source }),
    metadata
  });

  return upsertHitlProposal(proposal, 'created');
};

const updateHitlProposalDraft = (proposalId, nextDiffs) => {
  const proposal = hitlProposals.get(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found.');
  }

  const candidateDiffs = cloneDiffs(nextDiffs);
  if (!areDiffsDifferent(candidateDiffs, proposal.diffs)) {
    return serializeProposal(proposal);
  }

  proposal.diffs = candidateDiffs;
  proposal.status = 'modified';
  proposal.collisions = [];
  proposal.updatedAt = Date.now();

  hitlLogService.saveHitlLogs(buildHitlLogEntries(proposal, 'EDITED', candidateDiffs));
  return upsertHitlProposal(proposal, 'updated');
};

const buildRejectedIntakeMessage = (proposal) => ({
  event: 'rejected',
  filePath: proposal.metadata?.filePath,
  message: 'La propuesta fue descartada por el usuario.'
});

const syncIntakeAfterDecision = (proposal, decision) => {
  const queueId = proposal.metadata?.queueId;
  const filePath = proposal.metadata?.filePath;
  if (!queueId || !filePath) return;

  if (decision === 'APPROVED') {
    intakeDb.updateQueueStatus(queueId, 'classified');
    broadcastToAllWindows('intake:status', {
      event: 'classified',
      filePath,
      destination: proposal.metadata?.destinationPath || null,
      reason: proposal.summary
    });
    return;
  }

  if (decision === 'REJECTED') {
    intakeDb.updateQueueStatus(queueId, 'unidentified', 'Rejected by user');
    broadcastToAllWindows('intake:status', buildRejectedIntakeMessage(proposal));
  }
};

const applyCollisionSuggestions = (rootPath, diffs = [], collisions = []) => {
  if (!Array.isArray(diffs) || !Array.isArray(collisions) || collisions.length === 0) {
    return cloneDiffs(diffs);
  }

  const suggestionsByDiffId = new Map(
    collisions
      .filter((collision) => collision?.diffId && collision?.suggestedTarget)
      .map((collision) => [collision.diffId, collision.suggestedTarget])
  );

  return cloneDiffs(diffs).map((diff) => {
    const suggestedTarget = suggestionsByDiffId.get(diff.id);
    if (!suggestedTarget) return diff;

    return {
      ...diff,
      target: suggestedTarget,
      targetDir: diff.action === 'move'
        ? normalizeRelativePath(path.relative(rootPath, path.dirname(suggestedTarget)))
        : diff.targetDir
    };
  });
};

const autoExecuteIntakeClassification = async ({
  profileId,
  rootPath,
  queueId,
  filePath,
  diffs,
  finalDestination,
  reason,
  confidence,
  alternatives,
  documentType,
  subjectName
}) => {
  const initialDestinationLabel = normalizeRelativePath(path.relative(rootPath, finalDestination)) || '(root)';
  const proposal = buildHitlProposal({
    profileId,
    source: 'intake',
    title: 'Clasificacion automatica de Intake Desk',
    summary: `La IA archivo "${path.basename(filePath)}" en "${initialDestinationLabel}". ${reason || ''}`.trim(),
    diffs,
    aiConfidence: confidence || 'medium',
    riskLevel: determineRiskLevel({ diffs, summary: reason, source: 'intake' }),
    metadata: {
      queueId,
      filePath,
      destinationPath: finalDestination,
      reason,
      alternatives,
      documentType,
      subjectName,
      automated: true
    }
  });

  const initialDiffs = cloneDiffs(proposal.diffs);
  const collisions = await validateProposalCollisions(initialDiffs);
  const executableDiffs = collisions.length > 0
    ? applyCollisionSuggestions(rootPath, initialDiffs, collisions)
    : initialDiffs;
  const moveDiff = executableDiffs.find((diff) => diff.action === 'move');
  const resolvedDestinationPath = moveDiff ? path.dirname(moveDiff.target) : finalDestination;
  const resolvedDestinationLabel = normalizeRelativePath(path.relative(rootPath, resolvedDestinationPath)) || '(root)';
  const collisionNote = collisions.length > 0
    ? ` Ajustes automaticos por colision: ${collisions.length}.`
    : '';

  proposal.collisions = collisions;
  proposal.diffs = executableDiffs;
  proposal.summary = `La IA archivo "${path.basename(filePath)}" en "${resolvedDestinationLabel}". ${reason || ''}${collisionNote}`.trim();
  proposal.metadata.destinationPath = moveDiff?.target || finalDestination;

  const result = await executeMoves(profileId, executableDiffs);
  if (result.status !== 'completed') {
    const failedDetails = (result.details || [])
      .filter((detail) => detail.status === 'failed')
      .map((detail) => detail.error)
      .filter(Boolean);
    throw new Error(failedDetails[0] || 'Automatic intake execution failed');
  }

  proposal.status = 'approved';
  proposal.executionResult = result;
  proposal.resolvedAt = Date.now();
  proposal.updatedAt = Date.now();

  hitlLogService.saveHitlLogs(buildHitlLogEntries(proposal, 'AUTO_APPROVED', executableDiffs));
  syncIntakeAfterDecision(proposal, 'APPROVED');

  return {
    proposal,
    result,
    collisions
  };
};

const approveHitlProposal = async (proposalId, draftDiffs = null) => {
  const proposal = hitlProposals.get(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found.');
  }

  const candidateDiffs = draftDiffs ? cloneDiffs(draftDiffs) : cloneDiffs(proposal.diffs);

  if (areDiffsDifferent(candidateDiffs, proposal.diffs)) {
    proposal.diffs = candidateDiffs;
    proposal.status = 'modified';
    proposal.updatedAt = Date.now();
    hitlLogService.saveHitlLogs(buildHitlLogEntries(proposal, 'EDITED', candidateDiffs));
    upsertHitlProposal(proposal, 'updated');
  }

  const collisions = await validateProposalCollisions(candidateDiffs);
  if (collisions.length > 0) {
    proposal.collisions = collisions;
    proposal.status = 'modified';
    proposal.updatedAt = Date.now();

    const serialized = upsertHitlProposal(proposal, 'updated');
    return {
      status: 'collision',
      proposal: serialized,
      collisions
    };
  }

  proposal.collisions = [];
  proposal.diffs = candidateDiffs;

  const result = await executeMoves(proposal.profileId, candidateDiffs);
  proposal.status = 'approved';
  proposal.executionResult = result;
  proposal.resolvedAt = Date.now();
  proposal.updatedAt = Date.now();

  hitlLogService.saveHitlLogs(buildHitlLogEntries(proposal, 'APPROVED', candidateDiffs));
  if (proposal.source === 'intake') {
    syncIntakeAfterDecision(proposal, 'APPROVED');
  }

  const serialized = upsertHitlProposal(proposal, 'updated');
  return {
    status: 'executed',
    proposal: serialized,
    result
  };
};

const rejectHitlProposal = (proposalId) => {
  const proposal = hitlProposals.get(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found.');
  }

  proposal.status = 'rejected';
  proposal.resolvedAt = Date.now();
  proposal.updatedAt = Date.now();
  proposal.collisions = [];

  hitlLogService.saveHitlLogs(buildHitlLogEntries(proposal, 'REJECTED', proposal.diffs));
  if (proposal.source === 'intake') {
    syncIntakeAfterDecision(proposal, 'REJECTED');
  }

  return upsertHitlProposal(proposal, 'updated');
};

const buildIntakeProposalDiffs = (rootPath, filePath, relativePath, foldersToCreate = [], newFolderName = null) => {
  const fileName = path.basename(filePath);
  let finalDestination = path.join(rootPath, relativePath || '');
  const diffs = [];

  if (Array.isArray(foldersToCreate) && foldersToCreate.length > 0) {
    const normalizedFolders = [...new Set(
      foldersToCreate
        .map((folder) => normalizeRelativePath(folder))
        .filter((folder) => folder && !folder.startsWith('..'))
    )].sort((left, right) => left.split('/').length - right.split('/').length);

    for (const folder of normalizedFolders) {
      diffs.push({
        id: `${fileName}-mkdir-${folder}`,
        action: 'mkdir',
        target: path.join(rootPath, folder),
        fileName: folder,
        targetDir: folder
      });
    }
  }

  if (newFolderName && (!Array.isArray(foldersToCreate) || foldersToCreate.length === 0) && !finalDestination.endsWith(newFolderName)) {
    finalDestination = path.join(finalDestination, newFolderName);
    diffs.push({
      id: `${fileName}-mkdir-${newFolderName}`,
      action: 'mkdir',
      target: finalDestination,
      fileName: newFolderName,
      targetDir: normalizeRelativePath(path.relative(rootPath, finalDestination))
    });
  }

  const targetPath = path.join(finalDestination, fileName);
  diffs.push({
    id: `${fileName}-move-${Date.now()}`,
    action: 'move',
    source: filePath,
    target: targetPath,
    fileName,
    targetDir: normalizeRelativePath(path.relative(rootPath, finalDestination))
  });

  return {
    diffs,
    finalDestination
  };
};

let activeWorker = null;

const startIntakeWorker = (profileId, watchFolders, mainWindow) => {
  if (activeWorker) {
    activeWorker.terminate();
  }

  if (!watchFolders || watchFolders.length === 0) return;

  const settings = settingsService.getSettings();
  const workerPath = path.join(__dirname, 'workers', 'intake-worker.js');
  const worker = new Worker(workerPath, {
    workerData: {
      profileId,
      watchFolders,
      proxyUrl: settings.proxy_url || process.env.GEMINI_PROXY_URL,
      model: settings.ai_model || process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    }
  });

  activeWorker = worker;
  const queueMap = new Map();

  worker.on('message', async (msg) => {
    const { event, filePath } = msg;

    if (event === 'file_detected') {
      const queueId = intakeDb.addToQueue(filePath);
      queueMap.set(filePath, queueId);
      mainWindow.webContents.send('intake:status', { event: 'processing', filePath });
    } else if (event === 'request_truth_source') {
      const source = await intakeService.getTruthSource(profileId);
      const recentClassifications = getRecentClassificationExamples(profileId, source);
      worker.postMessage({
        event: 'truth_source',
        structureMap: source?.structure_map,
        recentClassifications
      });
    } else if (event === 'text_extracted') {
      // Worker will request truth source next
      mainWindow.webContents.send('intake:status', { event: 'classifying', filePath });
    } else if (event === 'execute_move') {
      const queueId = queueMap.get(filePath);
      const {
        relativePath,
        foldersToCreate,
        newFolderName,
        reason,
        confidence,
        alternatives,
        documentType,
        subjectName
      } = msg;

      try {
        const source = await intakeService.getTruthSource(profileId);
        if (!source) throw new Error('Truth source not found');

        const { diffs, finalDestination } = buildIntakeProposalDiffs(
          source.root_path,
          filePath,
          relativePath,
          foldersToCreate,
          newFolderName
        );

        await autoExecuteIntakeClassification({
          profileId,
          rootPath: source.root_path,
          diffs,
          queueId,
          filePath,
          finalDestination,
          reason,
          confidence,
          alternatives,
          documentType,
          subjectName
        });
        queueMap.delete(filePath);
      } catch (err) {
        console.error('Auto-move error:', err);
        settingsService.logError('error', `Auto-move failed: ${err.message}`, err.stack);
        if (queueId) intakeDb.updateQueueStatus(queueId, 'error', err.message);
        queueMap.delete(filePath);
        mainWindow.webContents.send('intake:status', { event: 'error', filePath, message: err.message });
      }
    } else if (event === 'low_confidence') {
      const queueId = queueMap.get(filePath);
      settingsService.logError('warning', `Low confidence classification: ${msg.message}`);
      if (queueId) intakeDb.updateQueueStatus(queueId, 'unidentified', msg.message);
      queueMap.delete(filePath);
      mainWindow.webContents.send('intake:status', {
        event: 'error',
        filePath,
        message: msg.message,
        alternatives: msg.alternatives
      });
    } else if (event === 'error') {
      const queueId = queueMap.get(filePath);
      settingsService.logError('error', `Worker Error: ${msg.message}`);
      if (queueId) intakeDb.updateQueueStatus(queueId, 'unidentified', msg.message);
      queueMap.delete(filePath);
      mainWindow.webContents.send('intake:status', { event: 'error', filePath, message: msg.message });
    }
  });

  worker.on('error', (err) => {
    console.error('Worker thread error:', err);
  });

  worker.on('exit', (code) => {
    if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
    if (activeWorker === worker) activeWorker = null;
  });
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'The Tortured Folders Department',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

app.whenReady().then(() => {
  // Initialize Database
  setupDatabase();

  // IPC Handlers
  ipcMain.handle('profiles:list', async () => {
    try {
      return await profilesService.listProfiles();
    } catch (error) {
      console.error('Error in profiles:list:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:create', async (_, data) => {
    try {
      console.log('Creating profile with data:', data);
      return await profilesService.createProfile(data.name, data.avatarPath, data.themeId);
    } catch (error) {
      console.error('Error in profiles:create:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:get', async (_, id) => {
    try {
      return await profilesService.getProfile(id);
    } catch (error) {
      console.error('Error in profiles:get:', error);
      throw error;
    }
  });

  ipcMain.handle('profiles:delete', async (_, id) => {
    try {
      return await profilesService.deleteProfile(id);
    } catch (error) {
      console.error('Error in profiles:delete:', error);
      throw error;
    }
  });

  ipcMain.handle('settings:get', async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle('settings:update', async (_, { key, value }) => {
    return settingsService.updateSetting(key, value);
  });

  ipcMain.handle('logs:get', async (_, limit) => {
    return settingsService.getErrorLogs(limit);
  });

  ipcMain.handle('chat:send', async (_, { profileId, message, history, targetDir }) => {
    try {
      const settings = settingsService.getSettings();
      let directoryTree = '';
      let knownDirectories = [];
      
      if (targetDir) {
        // Dynamic Depth: Detect keywords for thorough search
        const isThorough = /fondo|profundo|exhaustivo|detallado|todo/i.test(message);
        const depth = isThorough ? 5 : 4;
        
        console.log(`Scanning workspace with depth ${depth} (Thorough: ${isThorough})`);
        
        try {
          directoryTree = await buildDirectoryTree(targetDir, targetDir, 0, depth);
          knownDirectories = await collectDirectoryPaths(targetDir, targetDir, 0, depth);
        } catch (e) {
          console.error('Error scanning targetDir:', e);
        }
      }

      const { message: assistantMessage, plan } = await processInstruction(message, history, directoryTree, {
        proxyUrl: settings.proxy_url,
        model: settings.ai_model,
        knownDirectories
      });

      let diffs = [];
      let proposal = null;
      if (plan && plan.operations && plan.operations.length > 0 && targetDir) {
        diffs = await calculateDiff(targetDir, plan.operations);
        if (diffs.length > 0 && profileId) {
          proposal = createHitlProposal({
            profileId,
            source: 'chat',
            title: 'Sugerencia de reorganizacion en espera',
            summary: enrichAssistantMessage(assistantMessage, plan, diffs),
            diffs,
            aiConfidence: 0.82,
            metadata: {
              targetDir,
              instruction: message
            }
          });
        }
      }

      return {
        message: enrichAssistantMessage(assistantMessage, plan, diffs),
        diffs,
        proposal
      };
    } catch (error) {
      console.error('Error in chat:send:', error);
      throw error;
    }
  });

  ipcMain.handle('dialog:open-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  ipcMain.handle('fs:execute', async (_, { profileId, diffs }) => {
    try {
      return await executeMoves(profileId, diffs);
    } catch (error) {
      console.error('Error in fs:execute:', error);
      throw error;
    }
  });

  ipcMain.handle('hitl:list-pending', async (_, profileId) => {
    return listPendingHitlProposals(profileId);
  });

  ipcMain.handle('hitl:update-proposal', async (_, { proposalId, diffs }) => {
    return updateHitlProposalDraft(proposalId, diffs);
  });

  ipcMain.handle('hitl:approve', async (_, { proposalId, diffs }) => {
    return await approveHitlProposal(proposalId, diffs);
  });

  ipcMain.handle('hitl:reject', async (_, proposalId) => {
    return rejectHitlProposal(proposalId);
  });

  ipcMain.handle('transactions:list', async (_, profileId) => {
    return transactionsService.listTransactions(profileId);
  });

  ipcMain.handle('transactions:rollback', async (_, transactionId) => {
    return await performRollback(transactionId);
  });

  // Intake Desk Handlers
  ipcMain.handle('intake:add-watch-folder', async (_, { profileId, path, label }) => {
    return intakeService.addWatchFolder(profileId, path, label);
  });

  ipcMain.handle('intake:list-watch-folders', async (_, profileId) => {
    return intakeService.listWatchFolders(profileId);
  });

  ipcMain.handle('intake:set-truth-source', async (_, { profileId, path }) => {
    return await intakeService.setTruthSource(profileId, path);
  });

  ipcMain.handle('intake:get-truth-source', async (_, profileId) => {
    return intakeService.getTruthSource(profileId);
  });

  ipcMain.handle('intake:start-watcher', async (_, profileId) => {
    const watchFolders = intakeService.listWatchFolders(profileId);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      startIntakeWorker(profileId, watchFolders, mainWindow);
    }
    return { success: true };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
