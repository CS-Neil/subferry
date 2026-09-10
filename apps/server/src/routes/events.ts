import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { JobEventPayload } from '@subferry/shared';
import type { EventsBus } from '../worker/events-bus.js';

/**
 * SSE 进度流（readme.md 7.1 / 10.4）：手写 SSE（不用额外的库），响应头带
 * `X-Accel-Buffering: no`，每 15 秒发送一次心跳注释，防止中间设备断开空闲连接。
 */
const HEARTBEAT_MS = 15_000;

function beginSse(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.hijack(); // 接管响应，不让 Fastify 在 handler 返回后尝试再发送一次
}

function writeEvent(reply: FastifyReply, payload: JobEventPayload): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerEventRoutes(
  app: FastifyInstance,
  bus: EventsBus,
  requireAuth: preHandlerHookHandler,
): void {
  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id/events',
    { preHandler: requireAuth },
    async (request, reply) => {
      beginSse(reply);
      const unsubscribe = bus.onJobEventFor(request.params.id, (payload) => writeEvent(reply, payload));
      const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), HEARTBEAT_MS);
      request.raw.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  );

  // 当前用户所有任务的汇总 SSE 流。M1 单管理员/无严格多用户隔离，暂不按用户过滤事件
  // （见 security/auth.ts 顶部关于 AUTH_MODE=multi 的说明，用户隔离是 M2 范围）。
  app.get('/api/events', { preHandler: requireAuth }, async (request, reply) => {
    beginSse(reply);
    const unsubscribe = bus.onJobEvent((payload) => writeEvent(reply, payload));
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), HEARTBEAT_MS);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
