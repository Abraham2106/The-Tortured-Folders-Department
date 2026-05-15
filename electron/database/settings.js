import { getDb } from './connection.js';

export const getSettings = () => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM app_settings').all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
};

export const updateSetting = (key, value) => {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
  return { success: true };
};

export const logError = (level, message, stack = null) => {
  const db = getDb();
  db.prepare('INSERT INTO error_logs (timestamp, level, message, stack) VALUES (?, ?, ?, ?)')
    .run(Date.now(), level, message, stack);
};

export const getErrorLogs = (limit = 50) => {
  const db = getDb();
  return db.prepare('SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
};
