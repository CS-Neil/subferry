import { desc, eq } from 'drizzle-orm';
import { JobOptions, type Profile } from '@subferry/shared';
import type { DB } from './client.js';
import { profiles } from './schema.js';

export type ProfileRow = typeof profiles.$inferSelect;

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    serviceInstanceId: row.serviceInstanceId,
    srcLang: row.srcLang,
    tgtLang: row.tgtLang,
    options: JobOptions.parse(JSON.parse(row.optionsJson)),
    reviewEnabled: row.reviewEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProfileRows(db: DB): ProfileRow[] {
  return db.select().from(profiles).orderBy(desc(profiles.createdAt)).all();
}

export function getProfileRow(db: DB, id: string): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.id, id)).get();
}

export function deleteProfile(db: DB, id: string): void {
  db.delete(profiles).where(eq(profiles.id, id)).run();
}
