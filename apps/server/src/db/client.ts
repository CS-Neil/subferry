import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema>;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_instances (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  secret_enc TEXT,
  rpm INTEGER NOT NULL DEFAULT 60,
  max_concurrency INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  file_name TEXT NOT NULL,
  format TEXT NOT NULL,
  encoding TEXT,
  eol TEXT,
  src_lang TEXT,
  tgt_lang TEXT NOT NULL DEFAULT 'zh_cn',
  status TEXT NOT NULL,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  progress_failed INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'web',
  source_path TEXT,
  output_path TEXT,
  service_instance_id TEXT,
  options_json TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS cues (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  raw_time TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  speaker TEXT,
  meta_json TEXT NOT NULL,
  leading_tags TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  placeholders_json TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL,
  flags_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_cues_job_id ON cues(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cues_job_idx ON cues(job_id, idx);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  id_from INTEGER NOT NULL,
  id_to INTEGER NOT NULL,
  service_instance TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  duration_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_job_id ON batches(job_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export interface OpenDbOptions {
  file: string; // 数据库文件路径，传 ':memory:' 用于测试
}

export function openDb(opts: OpenDbOptions): { db: DB; sqlite: Database.Database } {
  if (opts.file !== ':memory:') {
    mkdirSync(dirname(opts.file), { recursive: true });
  }
  const sqlite = new Database(opts.file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(CREATE_TABLES_SQL);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
