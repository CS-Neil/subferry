import { and, asc, desc, eq } from 'drizzle-orm';
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
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
