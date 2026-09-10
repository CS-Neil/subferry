import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { ApiTokenCreate } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { deleteApiToken, insertApiToken, listApiTokens, toApiTokenView } from '../db/tokens-repo.js';
import { generateApiToken, hashApiToken } from '../security/tokens.js';
import { getCurrentUser } from '../security/auth.js';

/** API Token 管理（readme.md 7.2）：创建后只显示一次明文，之后接口只返回名称/最近使用时间。 */
export function registerTokenRoutes(app: FastifyInstance, db: DB, requireAuth: preHandlerHookHandler): void {
  app.get('/api/tokens', { preHandler: requireAuth }, async (request, reply) => {
    const user = getCurrentUser(request, db);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: '请先登录' });
    return reply.send(listApiTokens(db, user.id).map(toApiTokenView));
  });

  app.post('/api/tokens', { preHandler: requireAuth }, async (request, reply) => {
    const user = getCurrentUser(request, db);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: '请先登录' });

    const parsed = ApiTokenCreate.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    }

    const plaintext = generateApiToken();
    const row = insertApiToken(db, user.id, parsed.data.name, hashApiToken(plaintext));
    return reply.code(201).send({ ...toApiTokenView(row), token: plaintext });
  });

  app.delete<{ Params: { id: string } }>('/api/tokens/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = getCurrentUser(request, db);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: '请先登录' });
    deleteApiToken(db, user.id, Number(request.params.id));
    return reply.code(204).send();
  });
}
