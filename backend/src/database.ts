import Database from 'better-sqlite3';
import path from 'path';

const databasePath =
  process.env.PJT_I_DATABASE_PATH ??
  path.resolve(
    __dirname,
    '..',
    'posture.db'
  );

const db = new Database(databasePath);

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
