import crypto from 'crypto';
import { getDb } from './connection.js';

const toNumericConfidence = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (value === 'high') return 0.92;
  if (value === 'medium') return 0.66;
  if (value === 'low') return 0.35;
  return 0.75;
};

export const saveHitlLogs = (entries = []) => {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO hitl_logs (
      id,
      profile_id,
      proposal_id,
      timestamp,
      action_type,
      source_path,
      target_path,
      user_decision,
      ai_confidence,
      metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((logs) => {
    for (const entry of logs) {
      stmt.run(
        crypto.randomUUID(),
        entry.profile_id ? String(entry.profile_id) : null,
        entry.proposal_id ? String(entry.proposal_id) : null,
        entry.timestamp ? Number(entry.timestamp) : Date.now(),
        entry.action_type ? String(entry.action_type) : null,
        entry.source_path ? String(entry.source_path) : null,
        entry.target_path ? String(entry.target_path) : null,
        entry.user_decision ? String(entry.user_decision) : null,
        toNumericConfidence(entry.ai_confidence),
        entry.metadata ? JSON.stringify(entry.metadata) : null
      );
    }
  });

  insertMany(entries);
};

export const listHitlLogs = (profileId, limit = 100) => {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM hitl_logs
    WHERE profile_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(profileId, limit).map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));
};
