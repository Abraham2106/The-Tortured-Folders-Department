import { processInstruction } from '../logic/instruction-engine.js';
import { calculateDiff } from '../logic/diff-engine.js';
import * as settingsService from '../database/settings.js';
import { buildDirectoryTree, collectDirectoryPaths } from './directory-scanner.js';
import { createHitlProposal } from './hitl-manager.js';

export const buildDiffSummary = (plan, diffs, baseMessage = '') => {
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

export const enrichAssistantMessage = (message, plan, diffs) => {
  const baseMessage = typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Plan generado.';
  const summary = buildDiffSummary(plan, diffs, baseMessage);

  if (!summary) return baseMessage;
  if (baseMessage.includes(summary)) return baseMessage;
  return `${baseMessage} ${summary}`;
};

export const handleChatSend = async ({ profileId, message, history, targetDir }) => {
  const settings = settingsService.getSettings();
  let directoryTree = '';
  let knownDirectories = [];

  if (targetDir) {
    const isThorough = /fondo|profundo|exhaustivo|detallado|todo/i.test(message);
    const depth = isThorough ? 5 : 4;

    try {
      directoryTree = await buildDirectoryTree(targetDir, targetDir, 0, depth);
      knownDirectories = await collectDirectoryPaths(targetDir, targetDir, 0, depth);
    } catch (error) {
      console.error('Error scanning targetDir:', error);
    }
  }

  const { message: assistantMessage, plan } = await processInstruction(message, history, directoryTree, {
    apiKey: settings.anthropic_api_key,
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
};
