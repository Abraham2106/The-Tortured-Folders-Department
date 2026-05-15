import path from 'path';
import * as intakeDb from '../database/intake.js';
import * as hitlLogService from '../database/hitl.js';
import { executeMoves } from '../logic/executor.js';
import {
  buildHitlLogEntries,
  buildHitlProposal,
  cloneDiffs,
  determineRiskLevel,
  validateProposalCollisions,
  areDiffsDifferent
} from '../logic/hitl-utils.js';
import { normalizeRelativePath } from './directory-scanner.js';
import { broadcastToAllWindows } from '../window/window-manager.js';

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

const buildProposalSummary = (origin, message, diffs) => {
  if (message && message.trim()) return message.trim();

  const actionCount = Array.isArray(diffs) ? diffs.length : 0;
  if (origin === 'intake') {
    return `La mesa de ingreso propone ${actionCount} acciones para archivar el documento.`;
  }

  return `La IA propone ${actionCount} acciones para reorganizar el directorio.`;
};

const buildRejectedIntakeMessage = (proposal) => ({
  event: 'rejected',
  filePath: proposal.metadata?.filePath,
  message: 'La propuesta fue descartada por el usuario.'
});

export const createHitlProposal = ({
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

export const listPendingHitlProposals = (profileId) => {
  const pendingStatuses = getPendingStatuses();

  return [...hitlProposals.values()]
    .filter((proposal) => proposal.profileId === profileId && pendingStatuses.has(proposal.status))
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((proposal) => serializeProposal(proposal));
};

export const updateHitlProposalDraft = (proposalId, nextDiffs) => {
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

export const syncIntakeAfterDecision = (proposal, decision) => {
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

export const applyCollisionSuggestions = (rootPath, diffs = [], collisions = []) => {
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

export const approveHitlProposal = async (proposalId, draftDiffs = null) => {
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

export const rejectHitlProposal = (proposalId) => {
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
