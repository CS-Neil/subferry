import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { InitRequest, LoginRequest, type AuthStatus } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { users } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  isInitialized,
  isRateLimited,
  recordLoginFailure,
  clearLoginFailures,
  setSessionCookie,
  clearSessionCookie,
  getCurrentUser,
} from '../security/auth.js';

export function registerAuthRoutes(app: FastifyInstance, db: DB, config: AppConfig): void {
  app.get('/api/auth/status', async (request, reply) => {
    const user = getCurrentUser(request, db);
    const body: AuthStatus = {
      initialized: isInitialized(db),
      authMode: config.authMode,
      loggedIn: config.authMode === 'none' ? true : Boolean(user),
      username: user?.username ?? (config.authMode === 'none' ? 'anonymous' : null),
    };
    return reply.send(body);
  });

  app.post('/api/auth/init', async (request, reply) => {
    if (isInitialized(db)) {
      return reply.code(409).send({ error: 'already-initialized', message: '管理员账号已存在' });
    }
    const parsed = InitRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const row = db
      .insert(users)
      .values({
        username: parsed.data.username,
        passwordHash,
        role: 'admin',
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    setSessionCookie(reply, row.id);
    return reply.code(201).send({ id: row.id, username: row.username });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    }
    const { username, password } = parsed.data;

    if (isRateLimited(username)) {
      return reply.code(429).send({ error: 'too-many-attempts', message: '登录失败次数过多，请稍后再试' });
    }

    const row = db.select().from(users).where(eq(users.username, username)).get();
    const ok = row ? await verifyPassword(row.passwordHash, password) : false;
    if (!row || !ok) {
      recordLoginFailure(username);
      return reply.code(401).send({ error: 'invalid-credentials', message: '用户名或密码错误' });
    }

    clearLoginFailures(username);
    setSessionCookie(reply, row.id);
    return reply.send({ id: row.id, username: row.username });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
