import type { FastifyInstance } from 'fastify';

/** 健康检查（readme.md 7.2）：无需认证，供 Docker healthcheck 和监控使用。 */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async (_request, reply) => {
    return reply.send({ ok: true });
  });
}
