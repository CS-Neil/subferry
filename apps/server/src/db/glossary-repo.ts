import { and, eq } from 'drizzle-orm';
import type { GlossaryEntry, GlossaryEntryType } from '@subferry/shared';
import type { DB } from './client.js';
import { glossaryEntries } from './schema.js';

export type GlossaryEntryRow = typeof glossaryEntries.$inferSelect;

export function toGlossaryEntry(row: GlossaryEntryRow): GlossaryEntry {
  return {
    id: row.id,
    projectId: row.projectId,
    source: row.source,
    target: row.target,
    type: row.type as GlossaryEntryType,
    note: row.note,
    confirmed: row.confirmed,
  };
}

export function listGlossaryForProject(db: DB, projectId: string): GlossaryEntryRow[] {
  return db.select().from(glossaryEntries).where(eq(glossaryEntries.projectId, projectId)).all();
}

/** 已确认的术语，供渲染提示词的 $glossary 变量使用（pipeline 只携带批次原文里实际出现的词条，见 job-runner）。 */
export function listConfirmedGlossary(db: DB, projectId: string): GlossaryEntryRow[] {
  return db
    .select()
    .from(glossaryEntries)
    .where(and(eq(glossaryEntries.projectId, projectId), eq(glossaryEntries.confirmed, true)))
    .all();
}

export function insertGlossaryEntry(
  db: DB,
  projectId: string,
  entry: { source: string; target: string; type: string; note?: string; confirmed: boolean },
): GlossaryEntryRow {
  return db
    .insert(glossaryEntries)
    .values({
      projectId,
      source: entry.source,
      target: entry.target,
      type: entry.type,
      note: entry.note ?? null,
      confirmed: entry.confirmed,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

export function updateGlossaryEntry(
  db: DB,
  id: number,
  patch: Partial<{ source: string; target: string; type: string; note: string | null; confirmed: boolean }>,
): GlossaryEntryRow | undefined {
  return db.update(glossaryEntries).set(patch).where(eq(glossaryEntries.id, id)).returning().get();
}

export function deleteGlossaryEntry(db: DB, id: number): void {
  db.delete(glossaryEntries).where(eq(glossaryEntries.id, id)).run();
}

/** 把某个项目里所有未确认的词条标记为已确认（术语确认动作，见 routes/jobs.ts 的 glossary/confirm）。 */
export function confirmAllPendingGlossary(db: DB, projectId: string): void {
  db.update(glossaryEntries)
    .set({ confirmed: true })
    .where(and(eq(glossaryEntries.projectId, projectId), eq(glossaryEntries.confirmed, false)))
    .run();
}
