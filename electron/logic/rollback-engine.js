import { getTransactionById, saveTransaction } from '../database/transactions.js';
import { executeMoves } from './executor.js';
import crypto from 'crypto';

export const performRollback = async (transactionId) => {
  const original = getTransactionById(transactionId);
  if (!original) throw new Error('Transaction not found');
  if (original.status === 'rolled_back') throw new Error('Already rolled back');

  // Inverse operations: Swap source and target
  // Only reverse those that were successful
  const inverseDiffs = original.operations
    .filter(op => op.status === 'success')
    .map(op => ({
      id: crypto.randomUUID(),
      action: op.action === 'mkdir' ? 'rmdir' : (op.action === 'move-dir' ? 'move-dir' : 'move'),
      source: op.target, // Old target is now the source
      target: op.source, // Old source is now the target
      fileName: op.fileName,
      targetDir: 'Original Location'
    }));

  // Note: For now, we only handle 'move' and 'move-dir' reversals. 
  // 'mkdir' reversal would mean deleting folders, which we want to avoid for safety unless explicit.
  // We'll skip 'rmdir' for now to keep it conservative.
  const reversibleDiffs = inverseDiffs.filter(d => d.action !== 'rmdir');

  const result = await executeMoves(original.profile_id, reversibleDiffs);

  // Log the rollback as its own transaction
  const rollbackLog = {
    id: crypto.randomUUID(),
    profile_id: original.profile_id,
    timestamp: Date.now(),
    operations: result.results,
    status: result.failCount === 0 ? 'completed' : 'partial',
    session_id: `rollback_${transactionId}`
  };
  
  saveTransaction(rollbackLog);

  return result;
};
