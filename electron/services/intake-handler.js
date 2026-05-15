import path from 'path';
import process from 'node:process';
import { Worker } from 'worker_threads';
import * as profilesService from '../database/profiles.js';
import * as intakeDb from '../database/intake.js';
import * as intakeService from '../logic/intake-service.js';
import * as settingsService from '../database/settings.js';
import * as hitlLogService from '../database/hitl.js';
import { executeMoves } from '../logic/executor.js';
import {
  buildHitlLogEntries,
  buildHitlProposal,
  cloneDiffs,
  determineRiskLevel,
  validateProposalCollisions
} from '../logic/hitl-utils.js';
import { applyCollisionSuggestions, syncIntakeAfterDecision } from './hitl-manager.js';
import { getRecentClassificationExamples, normalizeRelativePath } from './directory-scanner.js';
import { broadcastToAllWindows, getMainWindow } from '../window/window-manager.js';

const activeWorkers = new Map();
const workerPath = new URL('../workers/intake-worker.js', import.meta.url);

const emitIntakeStatus = (mainWindow, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('intake:status', payload);
    return;
  }

  broadcastToAllWindows('intake:status', payload);
};

export const buildIntakeProposalDiffs = (rootPath, filePath, relativePath, foldersToCreate = [], newFolderName = null) => {
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

export const autoExecuteIntakeClassification = async ({
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

export const startIntakeWorker = (profileId, watchFolders, mainWindow = null) => {
  const currentWorker = activeWorkers.get(profileId);
  if (currentWorker) {
    currentWorker.terminate();
  }

  if (!watchFolders || watchFolders.length === 0) return;

  const settings = settingsService.getSettings();
  const worker = new Worker(workerPath, {
    workerData: {
      profileId,
      watchFolders,
      proxyUrl: settings.proxy_url || process.env.GEMINI_PROXY_URL,
      model: settings.ai_model || process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    }
  });

  activeWorkers.set(profileId, worker);
  const queueMap = new Map();

  worker.on('message', async (msg) => {
    const { event, filePath } = msg;

    if (event === 'file_detected') {
      const queueId = intakeDb.addToQueue(filePath);
      queueMap.set(filePath, queueId);
      emitIntakeStatus(mainWindow, { event: 'processing', filePath });
      return;
    }

    if (event === 'request_truth_source') {
      const source = await intakeService.getTruthSource(profileId);
      const recentClassifications = getRecentClassificationExamples(profileId, source);
      worker.postMessage({
        event: 'truth_source',
        structureMap: source?.structure_map,
        recentClassifications
      });
      return;
    }

    if (event === 'text_extracted') {
      emitIntakeStatus(mainWindow, { event: 'classifying', filePath });
      return;
    }

    if (event === 'execute_move') {
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
      } catch (error) {
        console.error('Auto-move error:', error);
        settingsService.logError('error', `Auto-move failed: ${error.message}`, error.stack);
        if (queueId) intakeDb.updateQueueStatus(queueId, 'error', error.message);
        queueMap.delete(filePath);
        broadcastToAllWindows('intake:status', { event: 'error', filePath, message: error.message });
      }
      return;
    }

    if (event === 'low_confidence') {
      const queueId = queueMap.get(filePath);
      settingsService.logError('warning', `Low confidence classification: ${msg.message}`);
      if (queueId) intakeDb.updateQueueStatus(queueId, 'unidentified', msg.message);
      queueMap.delete(filePath);
      broadcastToAllWindows('intake:status', {
        event: 'error',
        filePath,
        message: msg.message,
        alternatives: msg.alternatives
      });
      return;
    }

    if (event === 'error') {
      const queueId = queueMap.get(filePath);
      settingsService.logError('error', `Worker Error: ${msg.message}`);
      if (queueId) intakeDb.updateQueueStatus(queueId, 'unidentified', msg.message);
      queueMap.delete(filePath);
      broadcastToAllWindows('intake:status', { event: 'error', filePath, message: msg.message });
    }
  });

  worker.on('error', (error) => {
    console.error('Worker thread error:', error);
  });

  worker.on('exit', (code) => {
    if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
    if (activeWorkers.get(profileId) === worker) activeWorkers.delete(profileId);
  });
};

export const startConfiguredIntakeWorkers = () => {
  const mainWindow = getMainWindow();
  const profiles = profilesService.listProfiles();

  for (const profile of profiles) {
    const watchFolders = intakeService.listWatchFolders(profile.id);
    if (!Array.isArray(watchFolders) || watchFolders.length === 0) continue;
    startIntakeWorker(profile.id, watchFolders, mainWindow);
  }
};
