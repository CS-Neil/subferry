import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * 表设计沿革（相对 readme.md 第6章）：
 *
 * - M1：users / service_instances / jobs / cues / batches / settings。
 * - M2（本次新增）：projects / glossary_entries / profiles / api_tokens；jobs 表补上
 *   profileId 列（projectId 列 M1 就已预留）。
 * - 仍跳过（M3 再建）：watch_rules（监控目录）。
 *
 * 所有关联都是"软引用"（存 id 字符串，不声明 SQL 外键约束）——SQLite 支持声明式外键，
 * 但这里为了让新增表/列不需要迁移已有安装就能生效（CREATE TABLE IF NOT EXISTS 天然幂等，
 * 加外键约束则要求被引用表在同一批 DDL 里已存在，会强制规定建表顺序），继续沿用 M1 的
 * 轻量做法：约束交给应用层（repo 函数）保证。
 *
 * 建表方式：用 db/client.ts 中的幂等 `CREATE TABLE IF NOT EXISTS` 语句（而不是 drizzle-kit
 * 生成的迁移文件），两者需要手工保持字段一致——这是为了减少工具链复杂度的权宜之计，
 * 后续可以切换到正式的 drizzle-kit migrations。
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
  proxyUrl: text('proxy_url'), // 只对这个实例生效的代理地址（readme.md 7.6），留空则走全局代理/直连
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), // uuid
  projectId: text('project_id'), // 预留给 M2 projects 表，暂无外键约束
  fileName: text('file_name').notNull(),
  format: text('format').notNull(), // srt | vtt | ass | ssa
  encoding: text('encoding'),
  eol: text('eol'),
  header: text('header').notNull().default(''), // ASS 的 [Script Info]/[V4+ Styles]、VTT 头等，写出时原样使用
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
  profileId: text('profile_id'), // 创建时应用的翻译方案（可为空，即临时/一次性设置）
  optionsJson: text('options_json').notNull(), // JobOptions 快照：无论是否来自方案，创建时都会拍平存一份
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

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), // uuid
  name: text('name').notNull(),
  synopsis: text('synopsis'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const glossaryEntries = sqliteTable('glossary_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull(),
  source: text('source').notNull(),
  target: text('target').notNull(),
  type: text('type').notNull().default('other'), // person | place | organization | term | other
  note: text('note'),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), // 用户指定的短 id，例如 "default"、"fast-korean"
  name: text('name').notNull(),
  serviceInstanceId: text('service_instance_id'),
  srcLang: text('src_lang'),
  tgtLang: text('tgt_lang').notNull().default('zh_cn'),
  optionsJson: text('options_json').notNull(), // JobOptions（部分覆盖默认值）
  reviewEnabled: integer('review_enabled', { mode: 'boolean' }).notNull().default(false), // M3 LLM 审校轮开关，暂未接入逻辑
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const apiTokens = sqliteTable('api_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(), // 只存哈希，明文只在创建时返回一次
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
});
