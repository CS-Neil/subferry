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
  proxy_url TEXT,
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
  header TEXT NOT NULL DEFAULT '',
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
  profile_id TEXT,
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

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  synopsis TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  note TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_glossary_project_id ON glossary_entries(project_id);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_instance_id TEXT,
  src_lang TEXT,
  tgt_lang TEXT NOT NULL DEFAULT 'zh_cn',
  options_json TEXT NOT NULL,
  review_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);
`;

/**
 * 给已有安装（M1 建的库，没有下面这些列）做最小化迁移：`CREATE TABLE IF NOT EXISTS` 只在表
 * 不存在时生效，不会给已存在的表补列。新安装走 CREATE_TABLES_SQL 时这些列已经在建表语句里，
 * 这里的 ADD COLUMN 会因为列已存在而被 tableHasColumn 提前跳过，不会重复执行。
 * readme.md 10.6："数据库迁移会在启动时自动执行"，这就是当前阶段的迁移实现——够用但简单，
 * 后续如果字段变更更频繁，值得换成 drizzle-kit 的正式迁移文件。
 */
function tableHasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const rows = sqlite.pragma(`table_info(${table})`) as { name: string }[];
  return rows.some((r) => r.name === column);
}

function migrateAddColumns(sqlite: Database.Database): void {
  const additions: { table: string; column: string; ddl: string }[] = [
    { table: 'jobs', column: 'header', ddl: "ALTER TABLE jobs ADD COLUMN header TEXT NOT NULL DEFAULT ''" },
    { table: 'jobs', column: 'profile_id', ddl: 'ALTER TABLE jobs ADD COLUMN profile_id TEXT' },
    { table: 'service_instances', column: 'proxy_url', ddl: 'ALTER TABLE service_instances ADD COLUMN proxy_url TEXT' },
  ];
  for (const { table, column, ddl } of additions) {
    if (!tableHasColumn(sqlite, table, column)) sqlite.exec(ddl);
  }
}

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
  migrateAddColumns(sqlite);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
