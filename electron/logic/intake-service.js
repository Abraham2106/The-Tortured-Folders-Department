import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getDb } from '../database/connection.js';

/**
 * Generates a JSON map of a directory structure up to a given depth.
 */
export const generateStructureMap = async (rootPath, maxDepth = 3) => {
  const scan = async (currentPath, depth) => {
    if (depth > maxDepth) return null;
    
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
      
      const results = [];
      for (const dir of dirs) {
        const fullPath = path.join(currentPath, dir.name);
        const children = await scan(fullPath, depth + 1);
        results.push({
          name: dir.name,
          path: fullPath,
          children: children // Ahora es el objeto completo anidado
        });
      }
      return results;
    } catch (error) {
      console.error(`Error scanning ${currentPath}:`, error);
      return [];
    }
  };

  const destinations = await scan(rootPath, 1);
  return {
    root: rootPath,
    destinations
  };
};

// Database operations for Intake
export const addWatchFolder = (profileId, folderPath, label) => {
  const db = getDb();
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO watch_folders (id, profile_id, path, label, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, profileId, folderPath, label || path.basename(folderPath), Date.now());
  return { id, path: folderPath, label };
};

export const listWatchFolders = (profileId) => {
  const db = getDb();
  return db.prepare('SELECT * FROM watch_folders WHERE profile_id = ?').all(profileId);
};

export const setTruthSource = async (profileId, rootPath) => {
  const db = getDb();
  const structureMap = await generateStructureMap(rootPath);
  
  // Upsert truth source for this profile
  const existing = db.prepare('SELECT id FROM truth_sources WHERE profile_id = ?').get(profileId);
  
  if (existing) {
    db.prepare(`
      UPDATE truth_sources 
      SET root_path = ?, structure_map = ?, last_scanned = ? 
      WHERE id = ?
    `).run(rootPath, JSON.stringify(structureMap), Date.now(), existing.id);
  } else {
    db.prepare(`
      INSERT INTO truth_sources (id, profile_id, root_path, structure_map, last_scanned)
      VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), profileId, rootPath, JSON.stringify(structureMap), Date.now());
  }
  
  return structureMap;
};

export const getTruthSource = (profileId) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM truth_sources WHERE profile_id = ?').get(profileId);
  if (row) {
    row.structure_map = JSON.parse(row.structure_map);
  }
  return row;
};
