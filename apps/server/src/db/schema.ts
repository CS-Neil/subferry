import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * M1 精简表设计（相对 readme.md 第6章的取舍，见 /home/neil/.claude/plans 中记录的实现计划）：
 *
 * - 保留：users / service_instances / jobs / cues / batches / settings。
 * - 跳过（M2/M3 再建）：api_tokens（M1 只做 Cookie 会话）、profiles（内嵌进 jobs.optionsJson）、
 *   projects、glossary_entries、watch_rules。
 * - jobs 表预留了无外键约束的 projectId 列，供 M2 建 projects 表后通过迁移补上外键，
 *   不需要改动 jobs 表已有结构。
 *
 * 建表方式：M1 使用 db/client.ts 中的幂等 `CREATE TABLE IF NOT EXISTS` 语句（而不是
 * drizzle-kit 生成的迁移文件），两者需要手工保持字段一致——这是為了在这个阶段减少工具链
 * 复杂度的权宜之计，M2 可以切换到正式的 drizzle-kit migrations。
 */

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: text('created_at').notNull(),
});

export const serviceInstances = sqliteTable('service_instances', {
  id: text('id').primaryKey(), // name@id，例如 openai@default
  serviceName: text('service_name').notNull(),
  displayName: text('display_name').notNull(),
  configJson: text('config_json').notNull(), // 非密字段，JSON 字符串
  secretEnc: text('secret_enc'), // 密钥字段加密后的密文（AES-256-GCM），可为空
  rpm: integer('rpm').notNull().default(60),
  maxConcurrency: integer('max_concurrency').notNull().default(3),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), // uuid
  projectId: text('project_id'), // 预留给 M2 projects 表，暂无外键约束
  fileName: text('file_name').notNull(),
  format: text('format').notNull(), // srt | vtt | ass | ssa（M1 只会是 srt）
  encoding: text('encoding'),
  eol: text('eol'),
  srcLang: text('src_lang'),
  tgtLang: text('tgt_lang').notNull().default('zh_cn'),
  status: text('status').notNull(), // JobStatus（见 @subferry/shared）
  progressDone: integer('progress_done').notNull().default(0),
  progressTotal: integer('progress_total').notNull().default(0),
  progressFailed: integer('progress_failed').notNull().default(0),
  origin: text('origin').notNull().default('web'), // web | api | watch
  sourcePath: text('source_path'),
  outputPath: text('output_path'),
  serviceInstanceId: text('service_instance_id'),
  optionsJson: text('options_json').notNull(), // JobOptions 快照（取代完整 profiles 表）
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
});

export const cues = sqliteTable('cues', {
  rowId: integer('row_id').primaryKey({ autoIncrement: true }),
  jobId: text('job_id').notNull(),
  idx: integer('idx').notNull(), // 对应 core 里的 Cue.id（发给模型的编号）
  rawTime: text('raw_time').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  speaker: text('speaker'),
  metaJson: text('meta_json').notNull(),
  leadingTags: text('leading_tags').notNull().default(''),
  source: text('source').notNull(),
  placeholdersJson: text('placeholders_json').notNull(),
  target: text('target'),
  status: text('status').notNull(),
  flagsJson: text('flags_json').notNull().default('[]'),
});

export const batches = sqliteTable('batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: text('job_id').notNull(),
  idFrom: integer('id_from').notNull(),
  idTo: integer('id_to').notNull(),
  serviceInstance: text('service_instance').notNull(),
  attempt: integer('attempt').notNull().default(0),
  status: text('status').notNull(), // done | failed
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
