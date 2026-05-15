import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
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

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const indent = '  '.repeat(depth);
  let tree = depth === 0 ? `${baseDir}/\n` : '';

  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
  const files = entries.filter(e => e.isFile() && !e.name.startsWith('.'));

  for (const dir of dirs) {
    tree += `${indent}├── 📁 ${dir.name}/\n`;
    tree += await buildDirectoryTree(baseDir, `${currentDir}/${dir.name}`, depth + 1, maxDepth);
  }

  if (files.length > 30) {
    // Smart pattern analysis for large directories
    tree += `${indent}└── 📊 [${files.length} archivos — Análisis de patrones:]\n`;
    tree += analyzeFilePatterns(files.map(f => f.name)).split('\n').map(l => `${indent}   ${l}`).join('\n') + '\n';
  } else {
    for (const file of files) {
      tree += `${indent}├── 📄 ${file.name}\n`;
    }
  }

  return tree;
};

let activeWorker = null;

const startIntakeWorker = (profileId, watchFolders, mainWindow) => {
  if (activeWorker) {
    activeWorker.terminate();
  }

  if (!watchFolders || watchFolders.length === 0) return;

  const workerPath = path.join(__dirname, 'workers', 'intake-worker.js');
  const worker = new Worker(workerPath, {
    workerData: {
      profileId,
      watchFolders,
      proxyUrl: process.env.GEMINI_PROXY_URL,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    }
  });

  activeWorker = worker;
  const queueMap = new Map();

  worker.on('message', async (msg) => {
    const { event, filePath, text, message, destinationPath, reason } = msg;

    if (event === 'file_detected') {
      const queueId = intakeDb.addToQueue(filePath);
      queueMap.set(filePath, queueId);
      mainWindow.webContents.send('intake:status', { event: 'processing', filePath });
    } else if (event === 'request_truth_source') {
      const source = await intakeService.getTruthSource(profileId);
      worker.postMessage({ event: 'truth_source', structureMap: source?.structure_map });
    } else if (event === 'text_extracted') {
      // Worker will request truth source next
      mainWindow.webContents.send('intake:status', { event: 'classifying', filePath });
    } else if (event === 'execute_move') {
      const queueId = queueMap.get(filePath);
      const { relativePath, newFolderName, reason } = msg;

      try {
        const source = await intakeService.getTruthSource(profileId);
        if (!source) throw new Error('Truth source not found');

        const fileName = path.basename(filePath);
        let finalDestination = path.join(source.root_path, relativePath || '');
        const operations = [];

        // If AI suggested a new folder and it's NOT already at the end of the relative path
        if (newFolderName && !finalDestination.endsWith(newFolderName)) {
          const newFolderPath = path.join(finalDestination, newFolderName);
          operations.push({
            action: 'mkdir',
            destination: newFolderPath
          });
          finalDestination = newFolderPath;
        }

        const targetPath = path.join(finalDestination, fileName);
        operations.push({
          action: 'move',
          source: filePath,
          target: targetPath,
          fileName: fileName
        });

        await executeMoves(profileId, operations);

        if (queueId) intakeDb.updateQueueStatus(queueId, 'classified');
        mainWindow.webContents.send('intake:status', {
          event: 'classified',
          filePath,
          destination: finalDestination,
          reason
        });
      } catch (err) {
        console.error('Auto-move error:', err);
        if (queueId) intakeDb.updateQueueStatus(queueId, 'error', err.message);
        mainWindow.webContents.send('intake:status', { event: 'error', filePath, message: err.message });
      }
    } else if (event === 'error') {
      const queueId = queueMap.get(filePath);
      if (queueId) intakeDb.updateQueueStatus(queueId, 'unidentified', message);
      mainWindow.webContents.send('intake:status', { event: 'error', filePath, message });
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

  ipcMain.handle('chat:send', async (_, { message, history, targetDir }) => {
    try {
      let directoryTree = '';
      if (targetDir) {
        try {
          directoryTree = await buildDirectoryTree(targetDir, targetDir, 0, 3);
        } catch (e) {
          console.error('Error scanning targetDir:', e);
        }
      }

      const { message: assistantMessage, plan } = await processInstruction(message, history, directoryTree);

      let diffs = [];
      if (plan && plan.operations && plan.operations.length > 0 && targetDir) {
        diffs = await calculateDiff(targetDir, plan.operations);
      }

      return {
        message: assistantMessage,
        diffs
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
