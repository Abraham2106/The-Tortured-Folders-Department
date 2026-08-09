import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db = null;

export const setupDatabase = () => {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'database.sqlite');
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar_path TEXT,
      theme_id TEXT DEFAULT 'brisa',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permitted_paths (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      path TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      profile_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      operations JSON,
      status TEXT DEFAULT 'completed',
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_folders (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      path TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS truth_sources (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      structure_map JSON,
      last_scanned INTEGER,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS intake_queue (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      status TEXT,
      watch_folder_id TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      error TEXT,
      FOREIGN KEY (watch_folder_id) REFERENCES watch_folders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      level TEXT,
      message TEXT,
      stack TEXT
    );

    CREATE TABLE IF NOT EXISTS hitl_logs (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      proposal_id TEXT,
      timestamp INTEGER NOT NULL,
      action_type TEXT,
      source_path TEXT,
      target_path TEXT,
      user_decision TEXT,
      ai_confidence REAL,
      metadata TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
  `);

  // Configuración inicial por defecto
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('anthropic_api_key', '');
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('ai_model', 'claude-opus-5');

  return db;
};

export const getDb = () => {
  if (!db) {
    throw new Error('Database has not been initialized. Call setupDatabase() first.');
  }
  return db;
};
