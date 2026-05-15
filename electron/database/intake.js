import { getDb } from './connection.js';
import crypto from 'crypto';

export const addToQueue = (filePath, watchFolderId = null) => {
  const db = getDb();
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO intake_queue (id, file_path, status, watch_folder_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, filePath, 'processing', watchFolderId, Date.now());
  return id;
};

export const updateQueueStatus = (id, status, error = null) => {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE intake_queue 
    SET status = ?, error = ?, resolved_at = ?
    WHERE id = ?
  `);
  const resolvedAt = (status === 'classified' || status === 'unidentified') ? Date.now() : null;
  stmt.run(status, error, resolvedAt, id);
};

export const getPendingQueue = (profileId) => {
  const db = getDb();
  // We need to join with watch_folders to filter by profile
  const stmt = db.prepare(`
    SELECT q.* FROM intake_queue q
    JOIN watch_folders w ON q.watch_folder_id = w.id
    WHERE w.profile_id = ? AND q.status IN ('processing', 'pending', 'queued_offline', 'pending_review')
  `);
  return stmt.all(profileId);
};
