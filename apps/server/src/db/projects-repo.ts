import { desc, eq } from 'drizzle-orm';
import type { Project } from '@subferry/shared';
import type { DB } from './client.js';
import { projects } from './schema.js';

export type ProjectRow = typeof projects.$inferSelect;

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    synopsis: row.synopsis,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProjectRows(db: DB): ProjectRow[] {
  return db.select().from(projects).orderBy(desc(projects.createdAt)).all();
}

export function getProjectRow(db: DB, id: string): ProjectRow | undefined {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}
