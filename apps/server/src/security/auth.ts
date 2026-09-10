import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from '../db/client.js';
import { users } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import { findByTokenPlaintext } from '../db/tokens-repo.js';
import { isApiTokenFormat } from './tokens.js';

export const SESSION_COOKIE = 'sf_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

export interface SessionUser {
  id: number;
  username: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

export function isInitialized(db: DB): boolean {
  const row = db.select({ id: users.id }).from(users).limit(1).get();
  return row !== undefined;
}

/**
 * 登录失败次数限速（readme.md 7.4）：按用户名做简单的内存计数，防止暴力破解。
 * M1 单进程部署，内存状态足够；多副本部署需要换成共享存储，非本阶段范围。
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

export function isRateLimited(key: string): boolean {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failedAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  failedAttempts.delete(key);
}

export function setSessionCookie(reply: FastifyReply, userId: number): void {
  reply.setCookie(SESSION_COOKIE, JSON.stringify({ uid: userId }), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

function loadSessionUser(request: FastifyRequest, db: DB): SessionUser | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return undefined;
  let uid: number;
  try {
    uid = (JSON.parse(unsigned.value) as { uid: number }).uid;
  } catch {
    return undefined;
  }
  const row = db.select().from(users).where(eq(users.id, uid)).get();
  if (!row) return undefined;
  return { id: row.id, username: row.username, role: row.role };
}

/**
 * 脚本调用用 `Authorization: Bearer <token>`（readme.md 7.2），token 在 apps/server/src/db/tokens-repo.ts
 * 里只以哈希存储，这里反查命中后顺带刷新 last_used_at。
 */
function loadBearerUser(request: FastifyRequest, db: DB): SessionUser | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  if (!isApiTokenFormat(token)) return undefined;
  const tokenRow = findByTokenPlaintext(db, token);
  if (!tokenRow) return undefined;
  const row = db.select().from(users).where(eq(users.id, tokenRow.userId)).get();
  if (!row) return undefined;
  return { id: row.id, username: row.username, role: row.role };
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

/**
 * 生成 requireAuth 这个 preHandler。AUTH_MODE=none 时直接放行（仅限可信内网场景，
 * 启动时会打印醒目警告，见 apps/server/src/index.ts）。
 */
export function createRequireAuth(db: DB, config: AppConfig) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (config.authMode === 'none') return;

    const user = loadBearerUser(request, db) ?? loadSessionUser(request, db);
    if (!user) {
      await reply.code(401).send({ error: 'unauthorized', message: '请先登录，或使用 Authorization: Bearer <token>' });
      return;
    }
    request.user = user;
  };
}

/** 供路由内部按需读取当前登录用户（requireAuth 之后调用才有值；none 模式下始终为 undefined）。 */
export function getCurrentUser(request: FastifyRequest, db: DB): SessionUser | undefined {
  return request.user ?? loadBearerUser(request, db) ?? loadSessionUser(request, db);
}
