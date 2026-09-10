import { and, asc, desc, eq, notInArray, or } from 'drizzle-orm';
import type { JobOrigin, JobStatus, JobSummary } from '@subferry/shared';
import type { DB } from './client.js';
import { jobs } from './schema.js';

export type JobRow = typeof jobs.$inferSelect;

export function getJobRow(db: DB, id: string): JobRow | undefined {
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}

export function listJobRows(db: DB): JobRow[] {
  return db.select().from(jobs).orderBy(desc(jobs.createdAt)).all();
}

export function nextQueuedJobRow(db: DB): JobRow | undefined {
  return db.select().from(jobs).where(eq(jobs.status, 'queued')).orderBy(asc(jobs.createdAt)).limit(1).get();
}

/**
 * 调度器的取件查询：`queued`（等待翻译）和 `parsing`（等待术语提取，见 worker/glossary-runner.ts）
 * 共用同一个 MAX_ACTIVE_JOBS 并发池，按创建时间统一排队，不特别优先谁。
 *
 * `excludeIds` 必须传入调度器当前已经在跑的 job id（Scheduler.active 的 key）：runner 函数
 * 在真正改写 job 状态之前通常还有一小段同步代码（读配置、建 limiter 等），这段时间窗口内
 * 数据库里的状态仍然是 queued/parsing，如果不排除就会被同一次 tick() 的 while 循环重复取到、
 * 重复 start() 同一个 job——而 Scheduler.active 是按 jobId 去重的 Map，重复 start 不会让
 * active.size 增长，会导致 while 循环永远满足"还没到并发上限"从而死循环。
 */
export function nextSchedulableJobRow(db: DB, excludeIds: string[] = []): JobRow | undefined {
  const statusFilter = or(eq(jobs.status, 'queued'), eq(jobs.status, 'parsing'))!;
  const where = excludeIds.length > 0 ? and(statusFilter, notInArray(jobs.id, excludeIds)) : statusFilter;
  return db.select().from(jobs).where(where).orderBy(asc(jobs.createdAt)).limit(1).get();
}

export function listJobRowsByStatus(db: DB, status: JobStatus): JobRow[] {
  return db.select().from(jobs).where(eq(jobs.status, status)).all();
}

export function setJobStatus(
  db: DB,
  id: string,
  status: JobStatus,
  patch: Partial<{ error: string | null; startedAt: string; finishedAt: string; outputPath: string }> = {},
): void {
  db.update(jobs)
    .set({ status, updatedAt: new Date().toISOString(), ...patch })
    .where(eq(jobs.id, id))
    .run();
}

export function updateJobProgress(
  db: DB,
  id: string,
  progress: { done: number; total: number; failed: number },
): void {
  db.update(jobs)
    .set({
      progressDone: progress.done,
      progressTotal: progress.total,
      progressFailed: progress.failed,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, id))
    .run();
}

export function toJobSummary(row: JobRow): JobSummary {
  return {
    id: row.id,
    fileName: row.fileName,
    format: row.format as JobSummary['format'],
    encoding: row.encoding,
    srcLang: row.srcLang,
    tgtLang: row.tgtLang,
    status: row.status as JobStatus,
    progress: {
      // M1 简化：totalCues 和 translatableCues 取同一个值（不需要翻译的 skipped 条目
      // 不计入进度分母，也不单独展示 skipped 数量）。
      totalCues: row.progressTotal,
      translatableCues: row.progressTotal,
      doneCues: row.progressDone,
      failedCues: row.progressFailed,
    },
    origin: row.origin as JobOrigin,
    serviceInstanceId: row.serviceInstanceId,
    projectId: row.projectId,
    profileId: row.profileId,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
