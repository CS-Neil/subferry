import { and, eq, asc } from 'drizzle-orm';
import type { Cue, CueFlag, CueStatus } from '@subferry/core';
import type { DB } from './client.js';
import { cues } from './schema.js';

export type CueRow = typeof cues.$inferSelect;

/**
 * cues 表不单独存 `translatable` 列（对齐 readme.md 第6章字段列表）：它总是等于
 * `status !== 'skipped'`，是一个可推导的不变量，preprocessCue 只会在判定"不可翻译"时
 * 把 status 设为 skipped，其余情况 status 都表示"可翻译但翻译到什么阶段了"。
 */
export function rowToCue(row: CueRow): Cue {
  return {
    id: row.idx,
    rawTime: row.rawTime,
    startMs: row.startMs,
    endMs: row.endMs,
    speaker: row.speaker ?? undefined,
    meta: JSON.parse(row.metaJson) as Cue['meta'],
    leadingTags: row.leadingTags,
    source: row.source,
    placeholders: JSON.parse(row.placeholdersJson) as string[],
    translatable: row.status !== 'skipped',
    target: row.target ?? undefined,
    status: row.status as CueStatus,
    flags: JSON.parse(row.flagsJson) as CueFlag[],
  };
}

export function cueToInsertRow(jobId: string, cue: Cue): typeof cues.$inferInsert {
  return {
    jobId,
    idx: cue.id,
    rawTime: cue.rawTime,
    startMs: cue.startMs,
    endMs: cue.endMs,
    speaker: cue.speaker ?? null,
    metaJson: JSON.stringify(cue.meta),
    leadingTags: cue.leadingTags,
    source: cue.source,
    placeholdersJson: JSON.stringify(cue.placeholders),
    target: cue.target ?? null,
    status: cue.status,
    flagsJson: JSON.stringify(cue.flags),
  };
}

const INSERT_CHUNK_SIZE = 200;

export function insertCues(db: DB, jobId: string, cueList: Cue[]): void {
  const rows = cueList.map((c) => cueToInsertRow(jobId, c));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    db.insert(cues)
      .values(rows.slice(i, i + INSERT_CHUNK_SIZE))
      .run();
  }
}

export function listCuesForJob(db: DB, jobId: string): CueRow[] {
  return db.select().from(cues).where(eq(cues.jobId, jobId)).orderBy(asc(cues.idx)).all();
}

/** 单条更新（例如校对页手动编辑）。 */
export function updateCue(
  db: DB,
  jobId: string,
  idx: number,
  patch: { target?: string; status?: CueStatus; flags?: CueFlag[] },
): void {
  db.update(cues)
    .set({
      ...(patch.target !== undefined ? { target: patch.target } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.flags !== undefined ? { flagsJson: JSON.stringify(patch.flags) } : {}),
    })
    .where(and(eq(cues.jobId, jobId), eq(cues.idx, idx)))
    .run();
}

/** 批量保存翻译结果（每批完成时调用，见 worker/job-runner.ts）。 */
export function saveCueResults(
  db: DB,
  jobId: string,
  results: Iterable<{ id: number; status: CueStatus; target: string; flags: CueFlag[] }>,
): void {
  for (const r of results) {
    updateCue(db, jobId, r.id, { target: r.target, status: r.status, flags: r.flags });
  }
}
