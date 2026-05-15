import { getDb } from './connection.js';

export const listTransactions = (profileId) => {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM transactions 
    WHERE profile_id = ? 
    ORDER BY timestamp DESC
  `);
  return stmt.all(profileId).map(t => ({
    ...t,
    operations: JSON.parse(t.operations)
  }));
};

export const getTransactionById = (id) => {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
  const t = stmt.get(id);
  if (t) {
    t.operations = JSON.parse(t.operations);
  }
  return t;
};

export const saveTransaction = (transaction) => {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO transactions (id, profile_id, timestamp, operations, status, session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    transaction.id ? String(transaction.id) : null,
    transaction.profile_id ? String(transaction.profile_id) : null,
    transaction.timestamp ? Number(transaction.timestamp) : null,
    JSON.stringify(transaction.operations ?? []),
    transaction.status ? String(transaction.status) : null,
    transaction.session_id ? String(transaction.session_id) : null
  );
};
