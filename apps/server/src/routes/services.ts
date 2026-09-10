import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { getService, listServices, defaultHttpClient } from '@subferry/core';
import { ServiceInstanceCreate, ServiceInstanceUpdate } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { serviceInstances } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import {
  getServiceInstanceRow,
  listServiceInstanceRows,
  loadFullConfig,
  splitConfigForStorage,
  toServiceInstanceView,
} from '../db/service-instances-repo.js';

function secretKeysOf(serviceName: string): Set<string> {
  const service = getService(serviceName);
  if (!service) return new Set();
  return new Set(service.info.configSchema.filter((f) => f.secret).map((f) => f.key));
}

export function registerServiceRoutes(
  app: FastifyInstance,
  db: DB,
  config: AppConfig,
  requireAuth: preHandlerHookHandler,
): void {
  app.get('/api/service-types', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(listServices().map((s) => s.info));
  });

  app.get('/api/services', { preHandler: requireAuth }, async (_request, reply) => {
    const rows = listServiceInstanceRows(db);
    return reply.send(rows.map((r) => toServiceInstanceView(r, config.appSecret)));
  });

  app.get<{ Params: { id: string } }>('/api/services/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = getServiceInstanceRow(db, request.params.id);
    if (!row) return reply.code(404).send({ error: 'not-found', message: '服务实例不存在' });
    return reply.send(toServiceInstanceView(row, config.appSecret));
  });

  app.post('/api/services', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ServiceInstanceCreate.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    }
    const service = getService(parsed.data.serviceName);
    if (!service) {
      return reply.code(400).send({ error: 'unknown-service', message: `未知服务类型：${parsed.data.serviceName}` });
    }
    if (getServiceInstanceRow(db, parsed.data.id)) {
      return reply.code(409).send({ error: 'already-exists', message: `id ${parsed.data.id} 已存在` });
    }

    const { configJson, secretEnc } = splitConfigForStorage(
      parsed.data.config,
      secretKeysOf(parsed.data.serviceName),
      config.appSecret,
    );

    const row = db
      .insert(serviceInstances)
      .values({
        id: parsed.data.id,
        serviceName: parsed.data.serviceName,
        displayName: parsed.data.displayName,
        configJson,
        secretEnc,
        rpm: parsed.data.rpm,
        maxConcurrency: parsed.data.maxConcurrency,
        enabled: parsed.data.enabled,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();

    return reply.code(201).send(toServiceInstanceView(row, config.appSecret));
  });

  app.put<{ Params: { id: string } }>('/api/services/:id', { preHandler: requireAuth }, async (request, reply) => {
    const existing = getServiceInstanceRow(db, request.params.id);
    if (!existing) return reply.code(404).send({ error: 'not-found', message: '服务实例不存在' });

    const parsed = ServiceInstanceUpdate.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    }

    let configJson = existing.configJson;
    let secretEnc = existing.secretEnc;
    if (parsed.data.config) {
      // 合并到已解密的完整配置上，用户只改动部分字段（例如只改显示名）时不需要重新输入密钥
      const merged = { ...loadFullConfig(existing, config.appSecret), ...parsed.data.config };
      const split = splitConfigForStorage(merged, secretKeysOf(existing.serviceName), config.appSecret);
      configJson = split.configJson;
      secretEnc = split.secretEnc;
    }

    const row = db
      .update(serviceInstances)
      .set({
        displayName: parsed.data.displayName ?? existing.displayName,
        configJson,
        secretEnc,
        rpm: parsed.data.rpm ?? existing.rpm,
        maxConcurrency: parsed.data.maxConcurrency ?? existing.maxConcurrency,
        enabled: parsed.data.enabled ?? existing.enabled,
      })
      .where(eq(serviceInstances.id, request.params.id))
      .returning()
      .get();

    return reply.send(toServiceInstanceView(row, config.appSecret));
  });

  app.delete<{ Params: { id: string } }>(
    '/api/services/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const existing = getServiceInstanceRow(db, request.params.id);
      if (!existing) return reply.code(404).send({ error: 'not-found', message: '服务实例不存在' });
      db.delete(serviceInstances).where(eq(serviceInstances.id, request.params.id)).run();
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/services/:id/test',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = getServiceInstanceRow(db, request.params.id);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '服务实例不存在' });
      const service = getService(row.serviceName);
      if (!service) return reply.code(400).send({ error: 'unknown-service', message: '未知服务类型' });

      try {
        const fullConfig = loadFullConfig(row, config.appSecret);
        const sample = await service.translate('테스트', 'ko', 'zh_cn', {
          config: fullConfig,
          http: defaultHttpClient,
        });
        return reply.send({ ok: true, sample });
      } catch (err) {
        return reply.code(502).send({ ok: false, message: err instanceof Error ? err.message : String(err) });
      }
    },
  );
}
