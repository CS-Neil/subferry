import { and, eq } from 'drizzle-orm';
import type { ApiTokenView } from '@subferry/shared';
import type { DB } from './client.js';
import { apiTokens } from './schema.js';
import { hashApiToken } from '../security/tokens.js';

export type ApiTokenRow = typeof apiTokens.$inferSelect;

export function toApiTokenView(row: ApiTokenRow): ApiTokenView {
  return { id: row.id, name: row.name, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt };
}

export function listApiTokens(db: DB, userId: number): ApiTokenRow[] {
  return db.select().from(apiTokens).where(eq(apiTokens.userId, userId)).all();
}

export function insertApiToken(db: DB, userId: number, name: string, tokenHash: string): ApiTokenRow {
  return db
    .insert(apiTokens)
    .values({ userId, name, tokenHash, createdAt: new Date().toISOString() })
    .returning()
    .get();
}

export function deleteApiToken(db: DB, userId: number, id: number): void {
  db.delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .run();
}

/** 按明文 token 反查记录（用于鉴权中间件），顺带更新 lastUsedAt。 */
export function findByTokenPlaintext(db: DB, plaintext: string): ApiTokenRow | undefined {
  const hash = hashApiToken(plaintext);
  const row = db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).get();
  if (row) {
    db.update(apiTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiTokens.id, row.id)).run();
  }
  return row;
}
