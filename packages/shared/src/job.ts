import { z } from 'zod';

/**
 * M1 精简任务状态机（相对 readme.md 第6章去掉了 awaiting_glossary / reviewing / awaiting_review，
 * 这些是 M2/M3 的术语确认与审校轮功能）：
 *
 *   queued → parsing → translating → done
 *                                  ↘ paused ↗   ↘ failed / canceled
 */
export const JobStatus = z.enum([
  'queued',
  'parsing',
  'translating',
  'done',
  'failed',
  'paused',
  'canceled',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobOrigin = z.enum(['web', 'api', 'watch']);
export type JobOrigin = z.infer<typeof JobOrigin>;

/**
 * 翻译方案的可配置项，对应 readme.md 第11章。M1 内嵌存储于 jobs.options_json，
 * 未建立独立的 profiles 表（见 apps/server/src/db/schema.ts 顶部注释的 M2 扩展说明）。
 */
export const JobOptions = z.object({
  batchSize: z.number().int().min(20).max(60).default(40),
  contextBefore: z.number().int().min(0).default(5),
  contextAfter: z.number().int().min(0).default(3),
  mode: z.enum(['standard', 'fine']).default('standard'), // fine（精翻/顺序模式）是 M2 功能，M1 只实现 standard
  maxRetries: z.number().int().min(0).max(5).default(2),
  temperature: z.number().min(0).max(2).default(0.3),
  maxCharsPerLine: z.number().int().min(1).default(16),
  maxCharsPerSecond: z.number().min(1).default(9),
  outputMode: z.enum(['zh']).default('zh'), // zh-top / src-top 是 M2 双语输出功能
  outputEncoding: z.string().default('utf-8-bom'),
});
export type JobOptions = z.infer<typeof JobOptions>;

export const JobProgress = z.object({
  totalCues: z.number().int().nonnegative(),
  translatableCues: z.number().int().nonnegative(),
  doneCues: z.number().int().nonnegative(),
  failedCues: z.number().int().nonnegative(),
});
export type JobProgress = z.infer<typeof JobProgress>;

export const JobSummary = z.object({
  id: z.string(),
  fileName: z.string(),
  format: z.enum(['srt', 'vtt', 'ass', 'ssa']),
  encoding: z.string().nullable(),
  srcLang: z.string().nullable(),
  tgtLang: z.string(),
  status: JobStatus,
  progress: JobProgress,
  origin: JobOrigin,
  serviceInstanceId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobSummary = z.infer<typeof JobSummary>;
