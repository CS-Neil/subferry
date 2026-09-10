import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { ProjectCreate, ProjectUpdate, GlossaryEntryInput } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { projects } from '../db/schema.js';
import { getProjectRow, listProjectRows, toProject } from '../db/projects-repo.js';
import {
  confirmAllPendingGlossary,
  deleteGlossaryEntry,
  insertGlossaryEntry,
  listGlossaryForProject,
  toGlossaryEntry,
  updateGlossaryEntry,
} from '../db/glossary-repo.js';
import { getJobRow, setJobStatus } from '../db/jobs-repo.js';
import type { Scheduler } from '../worker/scheduler.js';

/** 项目与术语表（readme.md 4.7 / 第6章）。 */
export function registerProjectRoutes(
  app: FastifyInstance,
  db: DB,
  scheduler: Scheduler,
  requireAuth: preHandlerHookHandler,
): void {
  app.get('/api/projects', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(listProjectRows(db).map(toProject));
  });

  app.post('/api/projects', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ProjectCreate.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    const now = new Date().toISOString();
    const row = db
      .insert(projects)
      .values({ id: randomUUID(), name: parsed.data.name, synopsis: parsed.data.synopsis ?? null, createdAt: now, updatedAt: now })
      .returning()
      .get();
    return reply.code(201).send(toProject(row));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = getProjectRow(db, request.params.id);
    if (!row) return reply.code(404).send({ error: 'not-found', message: '项目不存在' });
    return reply.send(toProject(row));
  });

  app.put<{ Params: { id: string } }>('/api/projects/:id', { preHandler: requireAuth }, async (request, reply) => {
    const existing = getProjectRow(db, request.params.id);
    if (!existing) return reply.code(404).send({ error: 'not-found', message: '项目不存在' });
    const parsed = ProjectUpdate.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
    const row = db
      .update(projects)
      .set({
        name: parsed.data.name ?? existing.name,
        synopsis: parsed.data.synopsis ?? existing.synopsis,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(projects.id, request.params.id))
      .returning()
      .get();
    return reply.send(toProject(row));
  });

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id/glossary',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!getProjectRow(db, request.params.id)) {
        return reply.code(404).send({ error: 'not-found', message: '项目不存在' });
      }
      return reply.send(listGlossaryForProject(db, request.params.id).map(toGlossaryEntry));
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/glossary',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!getProjectRow(db, request.params.id)) {
        return reply.code(404).send({ error: 'not-found', message: '项目不存在' });
      }
      const parsed = GlossaryEntryInput.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
      const row = insertGlossaryEntry(db, request.params.id, parsed.data);
      return reply.code(201).send(toGlossaryEntry(row));
    },
  );

  app.put<{ Params: { id: string; entryId: string } }>(
    '/api/projects/:id/glossary/:entryId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = GlossaryEntryInput.partial().safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-request', message: parsed.error.message });
      const row = updateGlossaryEntry(db, Number(request.params.entryId), parsed.data);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '术语条目不存在' });
      return reply.send(toGlossaryEntry(row));
    },
  );

  app.delete<{ Params: { id: string; entryId: string } }>(
    '/api/projects/:id/glossary/:entryId',
    { preHandler: requireAuth },
    async (request, reply) => {
      deleteGlossaryEntry(db, Number(request.params.entryId));
      return reply.code(204).send();
    },
  );

  // 术语确认（readme.md 4.7"确认方式"）：任务在 awaiting_glossary 状态等待人工确认。
  // 一并确认该项目下所有未确认的词条（同一项目可能有多个任务并发在等，见 glossary-runner.ts 顶部说明）。
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/glossary/confirm',
    { preHandler: requireAuth },
    async (request, reply) => {
      const jobId = request.params.id;
      const job = getJobRow(db, jobId);
      if (!job) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if (job.status !== 'awaiting_glossary') {
        return reply.code(409).send({ error: 'invalid-status', message: `任务当前状态为 ${job.status}，无需确认术语` });
      }
      if (job.projectId) confirmAllPendingGlossary(db, job.projectId);
      setJobStatus(db, jobId, 'queued');
      scheduler.poke();
      return reply.send({ ok: true });
    },
  );
}
