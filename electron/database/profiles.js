import { getDb } from './connection.js';

export const listProfiles = () => {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM profiles ORDER BY created_at DESC');
  return stmt.all();
};

export const createProfile = (name, avatarPath = null, themeId = 'brisa') => {
  console.log('profilesService.createProfile called with:', { name, avatarPath, themeId });
  const db = getDb();
  console.log('Generating ID...');
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const createdAt = Date.now();
  
  console.log('Preparing statement...');
  const stmt = db.prepare(`
    INSERT INTO profiles (id, name, avatar_path, theme_id, created_at)
    VALUES (@id, @name, @avatarPath, @themeId, @createdAt)
  `);
  
  console.log('Running statement with id:', id);
  stmt.run({ id, name, avatarPath, themeId, createdAt });
  
  console.log('Fetching new profile...');
  const profile = getProfile(id);
  console.log('Returning profile:', profile);
  return profile;
};

export const getProfile = (id) => {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM profiles WHERE id = ?');
  return stmt.get(id);
};

export const deleteProfile = (id) => {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM profiles WHERE id = ?');
  stmt.run(id);
  return { success: true };
};
