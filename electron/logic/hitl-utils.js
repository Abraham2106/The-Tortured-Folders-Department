import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LOW_RISK_PATTERN = /(screenshot|screen\s?shot|captura|snip|recorte|img[_ -]?\d{3,}|capture)/i;

export const cloneDiffs = (diffs = []) => JSON.parse(JSON.stringify(diffs ?? []));

export const confidenceToScore = (confidence) => {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) return confidence;
  if (confidence === 'high') return 0.92;
  if (confidence === 'medium') return 0.66;
  if (confidence === 'low') return 0.35;
  return 0.75;
};

export const getActionTypeFromDiff = (diff) => {
  if (diff?.action === 'move-dir') return 'MOVE_DIR';
  if (diff?.action === 'mkdir') return 'MKDIR';
  if (diff?.action === 'rmdir') return 'RMDIR';
  return 'MOVE';
};

export const areDiffsDifferent = (left = [], right = []) => JSON.stringify(left ?? []) !== JSON.stringify(right ?? []);

export const determineRiskLevel = ({ diffs = [], summary = '', source = '' }) => {
  if (!Array.isArray(diffs) || diffs.length === 0) return 'standard';

  const allLowImpactActions = diffs.every((diff) => diff.action === 'move' || diff.action === 'mkdir');
  const allScreenshotLike = diffs
    .filter((diff) => diff.action === 'move')
    .every((diff) => LOW_RISK_PATTERN.test(`${diff.fileName || ''} ${diff.source || ''} ${summary} ${source}`));

  if (allLowImpactActions && allScreenshotLike) return 'low';
  return 'standard';
};

export const buildHitlProposal = ({
  profileId,
  source,
  title,
  summary,
  diffs,
  aiConfidence,
  riskLevel,
  metadata = {}
}) => ({
  id: crypto.randomUUID(),
  profileId,
  source,
  title,
  summary,
  status: 'awaiting_approval',
  aiConfidence: confidenceToScore(aiConfidence),
  riskLevel: riskLevel || 'standard',
  diffs: cloneDiffs(diffs),
  metadata,
  collisions: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  resolvedAt: null,
  executionResult: null
});

const targetExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const buildCandidateTarget = (targetPath, index) => {
  const parsed = path.parse(targetPath);
  if (!parsed.ext && parsed.base && parsed.base === parsed.name) {
    return path.join(parsed.dir, `${parsed.name} (${index})`);
  }
  return path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
};

const findAvailableTarget = async (targetPath, reservedTargets = new Set()) => {
  let index = 1;
  let candidate = targetPath;

  while (reservedTargets.has(path.normalize(candidate)) || await targetExists(candidate)) {
    candidate = buildCandidateTarget(targetPath, index);
    index += 1;
  }

  return candidate;
};

export const validateProposalCollisions = async (diffs = []) => {
  const collisions = [];
  const reservedTargets = new Set();

  for (const diff of diffs) {
    if (!diff?.target || diff.action === 'mkdir' || diff.action === 'rmdir') continue;

    const normalizedTarget = path.normalize(diff.target);

    if (reservedTargets.has(normalizedTarget) && diff.overwrite !== true) {
      collisions.push({
        diffId: diff.id,
        type: 'duplicate_target',
        targetPath: diff.target,
        suggestedTarget: await findAvailableTarget(diff.target, reservedTargets),
        canOverwrite: diff.action === 'move'
      });
      continue;
    }

    reservedTargets.add(normalizedTarget);

    if (diff.overwrite === true) continue;

    if (await targetExists(diff.target)) {
      collisions.push({
        diffId: diff.id,
        type: 'existing_target',
        targetPath: diff.target,
        suggestedTarget: await findAvailableTarget(diff.target, reservedTargets),
        canOverwrite: diff.action === 'move'
      });
    }
  }

  return collisions;
};

export const buildHitlLogEntries = (proposal, decision, diffs = proposal?.diffs || []) => {
  return (Array.isArray(diffs) ? diffs : []).map((diff) => ({
    profile_id: proposal.profileId,
    proposal_id: proposal.id,
    timestamp: Date.now(),
    action_type: getActionTypeFromDiff(diff),
    source_path: diff.source || null,
    target_path: diff.target || null,
    user_decision: decision,
    ai_confidence: proposal.aiConfidence,
    metadata: {
      source: proposal.source,
      risk_level: proposal.riskLevel,
      diff_id: diff.id,
      file_name: diff.fileName || null
    }
  }));
};
