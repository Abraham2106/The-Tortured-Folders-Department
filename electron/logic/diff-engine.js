import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';

/**
 * Calculates a list of proposed file movements based on a set of operations.
 * 
 * @param {string} targetDir - The base directory to scan.
 * @param {Array} operations - Array of objects like { type: 'move', pattern: '*.pdf', destination: 'Docs/' }
 * @returns {Promise<Array>} Array of diff objects { sourcePath, targetPath, action, id }
 */
export const calculateDiff = async (targetDir, operations) => {
  const diffs = [];
  
  try {
    // Read all files in the target directory (shallow for now to be safe)
    const files = await fs.readdir(targetDir, { withFileTypes: true });
    
    // We only process files, not directories, for moving
    const fileNames = files.filter(f => f.isFile()).map(f => f.name);

    for (const file of fileNames) {
      // Find the first operation that matches this file
      for (const op of operations) {
        if (op.type === 'move' && minimatch(file, op.pattern, { matchBase: true, nocase: true })) {
          const sourcePath = path.join(targetDir, file);
          const targetPath = path.join(targetDir, op.destination, file);
          
          // Generate a unique id for this operation
          const id = Math.random().toString(36).substring(2, 9);
          
          diffs.push({
            id,
            action: 'move',
            source: sourcePath,
            target: targetPath,
            fileName: file,
            targetDir: op.destination
          });
          
          // Once matched, don't apply subsequent operations to the same file
          break;
        }
      }
    }
    
    // 2. Handle move-dir operations (moving entire directories)
    for (const op of operations) {
      if (op.type === 'move-dir' && op.source && op.destination) {
        const id = Math.random().toString(36).substring(2, 9);
        const sourcePath = path.join(targetDir, op.source);
        const destPath = path.join(targetDir, op.destination);
        diffs.push({
          id,
          action: 'move-dir',
          source: sourcePath,
          target: destPath,
          fileName: op.source,
          targetDir: op.destination
        });
      }
    }

    // 3. Handle mkdir operations (creating empty folders)
    for (const op of operations) {
      if (op.type === 'mkdir') {
        const id = Math.random().toString(36).substring(2, 9);
        diffs.push({
          id,
          action: 'mkdir',
          source: null,
          target: path.join(targetDir, op.destination),
          fileName: op.destination,
          targetDir: op.destination
        });
      }
    }

    return diffs;
  } catch (error) {
    console.error('Error calculating diff:', error);
    throw new Error(`Failed to calculate diff for directory ${targetDir}`);
  }
};
