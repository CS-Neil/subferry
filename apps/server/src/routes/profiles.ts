import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { JobOptions, ProfileCreate, ProfileUpdate } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { profiles } from '../db/schema.js';
import { getProfileRow, listProfileRows, toProfile, deleteProfile } from '../db/profiles-repo.js';

/** 翻译方案（readme.md 第6章 profiles 表）：网页、API、监控目录共用的预设。 */
export function registerProfileRoutes(app: FastifyInstance, db: DB, requireAuth: preHandlerHookHandler): void {
  app.get('/api/profiles', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(listProfileRows(db).map(toProfile));
  });

  app.get<{ Params: { id: string } }>('/api/profiles/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = getProfileRow(db, request.params.id);
    if (!row) return reply.code(404).send({ error: 'not-found', message: '翻译方案不存在' });
    return reply.send(toProfile(row));
  });

  app.post('/api/profiles', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ProfileCreate.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    if (getProfileRow(db, parsed.data.id)) {
      return reply.code(409).send({ error: 'already-exists', message: `id ${parsed.data.id} 已存在` });
    }
    const now = new Date().toISOString();
    const row = db
      .insert(profiles)
      .values({
        id: parsed.data.id,
        name: parsed.data.name,
        serviceInstanceId: parsed.data.serviceInstanceId ?? null,
        srcLang: parsed.data.srcLang ?? null,
        tgtLang: parsed.data.tgtLang,
        optionsJson: JSON.stringify(JobOptions.parse(parsed.data.options ?? {})),
        reviewEnabled: parsed.data.reviewEnabled,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return reply.code(201).send(toProfile(row));
  });

  app.put<{ Params: { id: string } }>('/api/profiles/:id', { preHandler: requireAuth }, async (request, reply) => {
    const existing = getProfileRow(db, request.params.id);
    if (!existing) return reply.code(404).send({ error: 'not-found', message: '翻译方案不存在' });
    const parsed = ProfileUpdate.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });

    const mergedOptions = parsed.data.options
      ? JobOptions.parse({ ...JSON.parse(existing.optionsJson), ...parsed.data.options })
      : JSON.parse(existing.optionsJson);

    const row = db
      .update(profiles)
      .set({
        name: parsed.data.name ?? existing.name,
        serviceInstanceId: parsed.data.serviceInstanceId ?? existing.serviceInstanceId,
        srcLang: parsed.data.srcLang ?? existing.srcLang,
        tgtLang: parsed.data.tgtLang ?? existing.tgtLang,
        optionsJson: JSON.stringify(mergedOptions),
        reviewEnabled: parsed.data.reviewEnabled ?? existing.reviewEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(profiles.id, request.params.id))
      .returning()
      .get();
    return reply.send(toProfile(row));
  });

  app.delete<{ Params: { id: string } }>('/api/profiles/:id', { preHandler: requireAuth }, async (request, reply) => {
    deleteProfile(db, request.params.id);
    return reply.code(204).send();
  });
}
