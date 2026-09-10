import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { parseSubtitle, preprocessDocument, type SubtitleDocument } from '@subferry/core';
import { CreateJobOptions, JobOptions } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { jobs } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import { getJobRow, listJobRows, setJobStatus, toJobSummary } from '../db/jobs-repo.js';
import { insertCues, listCuesForJob, rowToCue, updateCue } from '../db/cues-repo.js';
import { getServiceInstanceRow } from '../db/service-instances-repo.js';
import { detectAndDecode } from '../io/encoding.js';
import { detectLanguage } from '../io/language.js';
import { fileExists, fileExtension, normalizeFileName, readTextFile, saveFile, uploadFilePath } from '../io/storage.js';
import type { Scheduler } from '../worker/scheduler.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['srt']); // M1 只支持 srt；ass/ssa/vtt 是 M2 范围（readme.md 13章）

function sampleText(doc: SubtitleDocument): string {
  return doc.cues
    .slice(0, 50)
    .map((c) => c.source)
    .join('\n');
}

export function registerJobRoutes(
  app: FastifyInstance,
  db: DB,
  config: AppConfig,
  scheduler: Scheduler,
  requireAuth: preHandlerHookHandler,
): void {
  app.post('/api/jobs', { preHandler: requireAuth }, async (request, reply) => {
    let fileBuffer: Buffer | undefined;
    let fileName = '';
    const fields: Record<string, string> = {};

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBuffer = Buffer.concat(chunks);
        fileName = part.filename;
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!fileBuffer || fileBuffer.byteLength === 0 || !fileName) {
      return reply.code(400).send({ error: 'no-file', message: '未收到文件' });
    }
    if (fileBuffer.byteLength > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: 'file-too-large', message: '文件超过 10MB 限制' });
    }
    const ext = fileExtension(fileName);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.code(400).send({ error: 'unsupported-format', message: `M1 仅支持 .srt，收到：.${ext}` });
    }

    const parsedFields = CreateJobOptions.safeParse({
      serviceInstanceId: fields.serviceInstanceId,
      srcLang: fields.srcLang || undefined,
      tgtLang: fields.tgtLang || 'zh_cn',
      options: fields.options ? JSON.parse(fields.options) : undefined,
    });
    if (!parsedFields.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsedFields.error.message });
    }

    const serviceRow = getServiceInstanceRow(db, parsedFields.data.serviceInstanceId);
    if (!serviceRow) {
      return reply.code(400).send({ error: 'unknown-service-instance', message: '服务实例不存在' });
    }

    const { text, sourceEncoding } = detectAndDecode(fileBuffer);
    const doc = parseSubtitle('srt', text);
    const srcLang = parsedFields.data.srcLang ?? detectLanguage(sampleText(doc)) ?? null;
    const preprocessed = preprocessDocument(doc);

    const jobId = randomUUID();
    const safeName = normalizeFileName(fileName);
    const sourcePath = uploadFilePath(config.dataDir, jobId, safeName);
    saveFile(sourcePath, fileBuffer);

    const options = JobOptions.parse(parsedFields.data.options ?? {});
    const now = new Date().toISOString();

    db.insert(jobs)
      .values({
        id: jobId,
        fileName: safeName,
        format: doc.format,
        encoding: sourceEncoding,
        eol: doc.eol,
        srcLang,
        tgtLang: parsedFields.data.tgtLang,
        status: 'queued',
        progressDone: 0,
        progressTotal: preprocessed.cues.filter((c) => c.translatable).length,
        progressFailed: 0,
        origin: 'web',
        sourcePath,
        serviceInstanceId: parsedFields.data.serviceInstanceId,
        optionsJson: JSON.stringify(options),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    insertCues(db, jobId, preprocessed.cues);
    scheduler.poke();

    return reply.code(201).send({ jobId });
  });

  app.get('/api/jobs', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(listJobRows(db).map(toJobSummary));
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const row = getJobRow(db, request.params.id);
    if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
    return reply.send(toJobSummary(row));
  });

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/pause',
    { preHandler: requireAuth },
    async (request, reply) => {
      const ok = scheduler.pause(request.params.id);
      if (!ok) return reply.code(409).send({ error: 'not-running', message: '任务当前不在运行中' });
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/cancel',
    { preHandler: requireAuth },
    async (request, reply) => {
      const jobId = request.params.id;
      if (scheduler.isActive(jobId)) {
        scheduler.cancel(jobId);
      } else {
        const row = getJobRow(db, jobId);
        if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
        setJobStatus(db, jobId, 'canceled', { finishedAt: new Date().toISOString() });
      }
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/resume',
    { preHandler: requireAuth },
    async (request, reply) => {
      const jobId = request.params.id;
      const row = getJobRow(db, jobId);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if (!['paused', 'failed'].includes(row.status)) {
        return reply.code(409).send({ error: 'invalid-status', message: `任务当前状态为 ${row.status}，无法恢复` });
      }
      setJobStatus(db, jobId, 'queued');
      scheduler.poke();
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/retry-failed',
    { preHandler: requireAuth },
    async (request, reply) => {
      const jobId = request.params.id;
      const row = getJobRow(db, jobId);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if (!['done', 'failed'].includes(row.status)) {
        return reply.code(409).send({ error: 'invalid-status', message: `任务当前状态为 ${row.status}，无法重试` });
      }
      setJobStatus(db, jobId, 'queued');
      scheduler.poke();
      return reply.send({ ok: true });
    },
  );

  app.get<{ Params: { id: string }; Querystring: { offset?: string; limit?: string; filter?: string } }>(
    '/api/jobs/:id/cues',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = getJobRow(db, request.params.id);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      const all = listCuesForJob(db, request.params.id).map(rowToCue);
      const offset = Number(request.query.offset ?? 0);
      const limit = Math.min(Number(request.query.limit ?? 200), 1000);
      const filtered = request.query.filter === 'flagged' ? all.filter((c) => c.flags.length > 0) : all;
      return reply.send({ total: filtered.length, items: filtered.slice(offset, offset + limit) });
    },
  );

  app.patch<{ Params: { id: string; idx: string }; Body: { target?: string } }>(
    '/api/jobs/:id/cues/:idx',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (typeof request.body?.target !== 'string') {
        return reply.code(400).send({ error: 'invalid-request', message: '缺少 target 字段' });
      }
      updateCue(db, request.params.id, Number(request.params.idx), {
        target: request.body.target,
        status: 'edited',
      });
      return reply.send({ ok: true });
    },
  );

  app.get<{ Params: { id: string }; Querystring: { mode?: string } }>(
    '/api/jobs/:id/download',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = getJobRow(db, request.params.id);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if ((request.query.mode ?? 'zh') !== 'zh') {
        return reply.code(400).send({ error: 'unsupported-mode', message: 'M1 仅支持 mode=zh（双语输出是 M2 范围）' });
      }
      if (!row.outputPath || !fileExists(row.outputPath)) {
        return reply.code(409).send({ error: 'not-ready', message: '任务尚未完成，或文件已被清理' });
      }
      const downloadName = `${row.fileName.replace(/\.[^./]+$/, '')}.zh.srt`;
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
      reply.type('text/plain; charset=utf-8');
      return reply.send(readTextFile(row.outputPath));
    },
  );
}
