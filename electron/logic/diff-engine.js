import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';

/**
 * Recursively gets all files in a directory.
 */
const getAllFiles = async (dirPath, baseDir) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  let files = [];
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      files = [...files, ...(await getAllFiles(fullPath, baseDir))];
    } else {
      // Return relative path from baseDir to make matching easier
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files;
};

/**
 * Calculates a list of proposed file movements based on a set of operations.
 */
export const calculateDiff = async (targetDir, operations) => {
  const diffs = [];
  
  try {
    // 1. Get ALL files recursively
    const relativeFilePaths = await getAllFiles(targetDir, targetDir);

    for (const relPath of relativeFilePaths) {
      const fileName = path.basename(relPath);
      
      for (const op of operations) {
        // matchBase: true allows matching just the filename if pattern is e.g. "*.pdf"
        if (op.type === 'move' && minimatch(relPath, op.pattern, { matchBase: true, nocase: true })) {
          const sourcePath = path.join(targetDir, relPath);
          const targetPath = path.join(targetDir, op.destination, fileName);
          
          // Skip if file is already in the destination
          if (path.normalize(sourcePath) === path.normalize(targetPath)) continue;

          const id = Math.random().toString(36).substring(2, 9);
          diffs.push({
            id,
            action: 'move',
            source: sourcePath,
            target: targetPath,
            fileName: fileName,
            targetDir: op.destination
          });
          break;
        }
      }
    }
    
    // 2. Handle move-dir operations (directories at root level for now)
    for (const op of operations) {
      if (op.type === 'move-dir' && op.source && op.destination) {
        const id = Math.random().toString(36).substring(2, 9);
        diffs.push({
          id,
          action: 'move-dir',
          source: path.join(targetDir, op.source),
          target: path.join(targetDir, op.destination),
          fileName: op.source,
          targetDir: op.destination
        });
      }
    }

    // 3. Handle mkdir operations
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

    // 4. Handle rmdir operations (deleting empty folders)
    for (const op of operations) {
      if (op.type === 'rmdir' && op.source) {
        const id = Math.random().toString(36).substring(2, 9);
        diffs.push({
          id,
          action: 'rmdir',
          source: path.join(targetDir, op.source),
          target: null,
          fileName: op.source,
          targetDir: 'DELETE (If Empty)'
        });
      }
    }

    return diffs;
  } catch (error) {
    console.error('Error calculating diff:', error);
    throw new Error(`Failed to calculate diff for directory ${targetDir}`);
  }
};
