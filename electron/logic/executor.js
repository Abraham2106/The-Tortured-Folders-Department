import fs from 'fs/promises';
import path from 'path';
import { saveTransaction } from '../database/transactions.js';
import crypto from 'crypto';

/**
 * Executes a list of file operations.
 * 
 * @param {string} profileId - The ID of the profile performing the action.
 * @param {Array} diffs - Array of diff objects { source, target, action, fileName }
 * @returns {Promise<Object>} Result summary
 */
export const executeMoves = async (profileId, diffs) => {
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const diff of diffs) {
    try {
      // 1. Check if source exists (only for moves and move-dir)
      if (diff.action === 'move' || diff.action === 'move-dir') {
        try {
          await fs.access(diff.source);
        } catch (e) {
          results.push({ ...diff, status: 'failed', error: 'Source not found' });
          failCount++;
          continue;
        }
      }

      // 2. Check if target already exists — skip for mkdir (it's idempotent)
      if (diff.action !== 'mkdir') {
        try {
          await fs.access(diff.target);
          results.push({ ...diff, status: 'skipped', error: 'Target already exists' });
          skipCount++;
          continue;
        } catch (e) {
          // Target doesn't exist — good
        }
      }

      // 3. Ensure target parent directory exists (for file moves)
      if (diff.action === 'move') {
        const targetDir = path.dirname(diff.target);
        await fs.mkdir(targetDir, { recursive: true });
      }

      // 4. Perform action
      if (diff.action === 'move') {
        await fs.rename(diff.source, diff.target);
      } else if (diff.action === 'move-dir') {
        // For directory moves, ensure parent of target exists, then rename
        const targetParent = path.dirname(diff.target);
        await fs.mkdir(targetParent, { recursive: true });
        await fs.rename(diff.source, diff.target);
      } else if (diff.action === 'mkdir') {
        await fs.mkdir(diff.target, { recursive: true });
      }
      
      results.push({ ...diff, status: 'success' });
      successCount++;
    } catch (error) {
      console.error(`Error moving ${diff.fileName}:`, error);
      results.push({ ...diff, status: 'failed', error: error.message });
      failCount++;
    }
  }

  // Log to database
  const status = failCount > 0 ? (successCount > 0 ? 'partial' : 'failed') : 'completed';
  
  saveTransaction({
    id: crypto.randomUUID(),
    profile_id: profileId,
    timestamp: Date.now(),
    operations: results,
    status: status,
    session_id: null
  });

  return {
    status,
    summary: {
      total: diffs.length,
      success: successCount,
      failed: failCount,
      skipped: skipCount
    },
    details: results
  };
};
