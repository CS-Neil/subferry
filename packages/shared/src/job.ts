import { z } from 'zod';

/**
 * 任务状态机（readme.md 第6章）。M2 加回了 awaiting_glossary（术语确认，见 4.7）和
 * awaiting_review（人工确认完成，由 JobOptions.skipReview 控制是否跳过）。
 * `reviewing`（LLM 审校轮）是 M3 范围，暂不加入。
 *
 *   queued → parsing → awaiting_glossary → translating → awaiting_review → done
 *                                                       ↘ paused ↗              ↘ failed / canceled
 */
export const JobStatus = z.enum([
  'queued',
  'parsing',
  'awaiting_glossary',
  'translating',
  'awaiting_review',
  'done',
  'failed',
  'paused',
  'canceled',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobOrigin = z.enum(['web', 'api', 'watch']);
export type JobOrigin = z.infer<typeof JobOrigin>;

/**
 * 翻译方案的可配置项，对应 readme.md 第11章。存储方式：既可以内嵌于 jobs.options_json
 * （M1 起的做法），也可以作为一份"翻译方案"（profiles 表，M2 新增）被多个任务复用——
 * 创建任务时把当时的方案内容拍平成快照写进 jobs.options_json，之后修改方案不影响
 * 进行中的任务（见 db/schema.ts 的 profiles 表注释）。
 */
export const JobOptions = z.object({
  batchSize: z.number().int().min(20).max(60).default(40),
  contextBefore: z.number().int().min(0).default(5),
  contextAfter: z.number().int().min(0).default(3),
  mode: z.enum(['standard', 'fine']).default('standard'), // fine（精翻/顺序模式）是 M3 功能，暂只实现 standard
  maxRetries: z.number().int().min(0).max(5).default(2),
  temperature: z.number().min(0).max(2).default(0.3),
  maxCharsPerLine: z.number().int().min(1).default(16),
  maxCharsPerSecond: z.number().min(1).default(9),
  outputMode: z.enum(['zh', 'zh-top', 'src-top']).default('zh'),
  outputEncoding: z.string().default('utf-8-bom'),
  outputNameTemplate: z.string().default('{name}.zh.{ext}'),
  skipStyles: z.array(z.string()).default([]), // ASS 中不翻译的样式名（如 Sign/OP/ED）
  opencc: z.enum(['none', 's2t', 't2s']).default('none'), // 简转繁 / 繁转简，见 postprocess/opencc.ts
  glossaryAutoExtract: z.boolean().default(true),
  glossaryAutoConfirm: z.boolean().default(false), // true 时跳过"待确认术语"，术语提取完直接继续翻译
  skipReview: z.boolean().default(false), // true 时翻译完成后直接 done，不进入 awaiting_review
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
  projectId: z.string().nullable(),
  profileId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobSummary = z.infer<typeof JobSummary>;
