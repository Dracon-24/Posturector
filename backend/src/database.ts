import Database from 'better-sqlite3';

const db = new Database('posture.db');

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    monitored_duration INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    actual_sampling_rate REAL NOT NULL,
    session_data TEXT NOT NULL
  );
`);

export default db;