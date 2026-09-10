import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { parseSubtitle, preprocessDocument, type SubtitleDocument, type SubtitleFormat } from '@subferry/core';
import { CreateJobOptions, JobOptions } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { jobs, cues } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import { getJobRow, listJobRows, setJobStatus, toJobSummary } from '../db/jobs-repo.js';
import { insertCues, listCuesForJob, rowToCue, updateCue } from '../db/cues-repo.js';
import { getServiceInstanceRow } from '../db/service-instances-repo.js';
import { getProfileRow } from '../db/profiles-repo.js';
import { getProjectRow } from '../db/projects-repo.js';
import { detectAndDecode, decodeWith } from '../io/encoding.js';
import { detectLanguage } from '../io/language.js';
import {
  fileExists,
  fileExtension,
  normalizeFileName,
  readFileBuffer,
  readTextFile,
  saveFile,
  uploadFilePath,
} from '../io/storage.js';
import type { Scheduler } from '../worker/scheduler.js';
import { confirmJobDone } from '../worker/finalize.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set<SubtitleFormat>(['srt', 'ass', 'ssa', 'vtt']);

function sampleText(doc: SubtitleDocument): string {
  return doc.cues
    .slice(0, 50)
    .map((c) => c.source)
    .join('\n');
}

/**
 * 组合 profile 默认值 + 请求里显式传入的字段：显式字段优先，其余取 profile 的值。
 * 没有 profileId 时原样返回请求字段。
 */
function resolveJobFields(
  db: DB,
  fields: ReturnType<typeof CreateJobOptions.parse>,
): { serviceInstanceId?: string; srcLang?: string; tgtLang: string; options: Partial<JobOptions> } | { error: string } {
  if (!fields.profileId) {
    return {
      serviceInstanceId: fields.serviceInstanceId,
      srcLang: fields.srcLang,
      tgtLang: fields.tgtLang,
      options: fields.options ?? {},
    };
  }
  const profileRow = getProfileRow(db, fields.profileId);
  if (!profileRow) return { error: `翻译方案不存在：${fields.profileId}` };
  const profileOptions = JSON.parse(profileRow.optionsJson) as Partial<JobOptions>;
  return {
    serviceInstanceId: fields.serviceInstanceId ?? profileRow.serviceInstanceId ?? undefined,
    srcLang: fields.srcLang ?? profileRow.srcLang ?? undefined,
    tgtLang: fields.tgtLang !== 'zh_cn' ? fields.tgtLang : profileRow.tgtLang,
    options: { ...profileOptions, ...fields.options },
  };
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
    if (!ALLOWED_EXTENSIONS.has(ext as SubtitleFormat)) {
      return reply
        .code(400)
        .send({ error: 'unsupported-format', message: `仅支持 .srt/.ass/.ssa/.vtt，收到：.${ext}` });
    }
    const format = ext as SubtitleFormat;

    const parsedFields = CreateJobOptions.safeParse({
      serviceInstanceId: fields.serviceInstanceId || undefined,
      profileId: fields.profileId || undefined,
      projectId: fields.projectId || undefined,
      srcLang: fields.srcLang || undefined,
      tgtLang: fields.tgtLang || 'zh_cn',
      options: fields.options ? JSON.parse(fields.options) : undefined,
    });
    if (!parsedFields.success) {
      return reply.code(400).send({ error: 'invalid-request', message: parsedFields.error.message });
    }

    const resolved = resolveJobFields(db, parsedFields.data);
    if ('error' in resolved) return reply.code(400).send({ error: 'unknown-profile', message: resolved.error });

    if (!resolved.serviceInstanceId) {
      return reply.code(400).send({ error: 'invalid-request', message: '缺少 serviceInstanceId（或提供 profileId）' });
    }
    const serviceRow = getServiceInstanceRow(db, resolved.serviceInstanceId);
    if (!serviceRow) {
      return reply.code(400).send({ error: 'unknown-service-instance', message: '服务实例不存在' });
    }
    if (parsedFields.data.projectId && !getProjectRow(db, parsedFields.data.projectId)) {
      return reply.code(400).send({ error: 'unknown-project', message: '项目不存在' });
    }

    let doc: SubtitleDocument;
    try {
      const { text } = detectAndDecode(fileBuffer);
      doc = parseSubtitle(format, text);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: 'parse-error', message: err instanceof Error ? err.message : '字幕文件解析失败' });
    }
    const { sourceEncoding } = detectAndDecode(fileBuffer);
    const srcLang = resolved.srcLang ?? detectLanguage(sampleText(doc)) ?? null;
    const options = JobOptions.parse(resolved.options);
    const preprocessed = preprocessDocument(doc, { skipStyles: options.skipStyles });

    const jobId = randomUUID();
    const safeName = normalizeFileName(fileName);
    const sourcePath = uploadFilePath(config.dataDir, jobId, safeName);
    saveFile(sourcePath, fileBuffer);

    const now = new Date().toISOString();
    const needsGlossaryPhase = Boolean(parsedFields.data.projectId) && options.glossaryAutoExtract;

    db.insert(jobs)
      .values({
        id: jobId,
        projectId: parsedFields.data.projectId ?? null,
        profileId: parsedFields.data.profileId ?? null,
        fileName: safeName,
        format: doc.format,
        encoding: sourceEncoding,
        eol: doc.eol,
        header: doc.header,
        srcLang,
        tgtLang: resolved.tgtLang,
        status: needsGlossaryPhase ? 'parsing' : 'queued',
        progressDone: 0,
        progressTotal: preprocessed.cues.filter((c) => c.translatable).length,
        progressFailed: 0,
        origin: 'web',
        sourcePath,
        serviceInstanceId: resolved.serviceInstanceId,
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
      if (!['done', 'failed', 'awaiting_review'].includes(row.status)) {
        return reply.code(409).send({ error: 'invalid-status', message: `任务当前状态为 ${row.status}，无法重试` });
      }
      setJobStatus(db, jobId, 'queued');
      scheduler.poke();
      return reply.send({ ok: true });
    },
  );

  // 待校对 → 完成（readme.md 第6章 awaiting_review）。重新生成一次输出文件，
  // 好让用户在校对页做的编辑（PATCH cues/:idx）体现在最终下载内容里。
  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/confirm',
    { preHandler: requireAuth },
    async (request, reply) => {
      const jobId = request.params.id;
      const row = getJobRow(db, jobId);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if (row.status !== 'awaiting_review') {
        return reply.code(409).send({ error: 'invalid-status', message: `任务当前状态为 ${row.status}，无需确认` });
      }
      confirmJobDone(db, config, jobId);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string }; Body: { encoding?: string } }>(
    '/api/jobs/:id/reparse',
    { preHandler: requireAuth },
    async (request, reply) => {
      const jobId = request.params.id;
      const row = getJobRow(db, jobId);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if (!row.sourcePath || !fileExists(row.sourcePath)) {
        return reply.code(409).send({ error: 'source-missing', message: '原始文件已被清理，无法重新解析' });
      }
      const encoding = request.body?.encoding;
      if (!encoding) return reply.code(400).send({ error: 'invalid-request', message: '缺少 encoding 字段' });

      const buffer = readFileBuffer(row.sourcePath);
      let doc: SubtitleDocument;
      try {
        const text = decodeWith(buffer, encoding);
        doc = parseSubtitle(row.format as SubtitleFormat, text);
      } catch (err) {
        return reply
          .code(400)
          .send({ error: 'parse-error', message: err instanceof Error ? err.message : '重新解析失败' });
      }

      const options = JSON.parse(row.optionsJson) as JobOptions;
      const preprocessed = preprocessDocument(doc, { skipStyles: options.skipStyles });

      db.delete(cues).where(eq(cues.jobId, jobId)).run();
      insertCues(db, jobId, preprocessed.cues);
      db.update(jobs)
        .set({
          encoding,
          eol: doc.eol,
          header: doc.header,
          status: 'queued',
          progressDone: 0,
          progressFailed: 0,
          progressTotal: preprocessed.cues.filter((c) => c.translatable).length,
          error: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, jobId))
        .run();

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

  app.post<{ Params: { id: string; idx: string } }>(
    '/api/jobs/:id/cues/:idx/retranslate',
    { preHandler: requireAuth },
    async (request, reply) => {
      updateCue(db, request.params.id, Number(request.params.idx), { status: 'pending', target: undefined });
      const row = getJobRow(db, request.params.id);
      if (row && ['done', 'failed', 'awaiting_review'].includes(row.status)) {
        setJobStatus(db, request.params.id, 'queued');
        scheduler.poke();
      }
      return reply.send({ ok: true });
    },
  );

  app.get<{ Params: { id: string }; Querystring: { mode?: string } }>(
    '/api/jobs/:id/download',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = getJobRow(db, request.params.id);
      if (!row) return reply.code(404).send({ error: 'not-found', message: '任务不存在' });
      if (!row.outputPath || !fileExists(row.outputPath)) {
        return reply.code(409).send({ error: 'not-ready', message: '任务尚未完成，或文件已被清理' });
      }
      // mode 查询参数保留用于 API 兼容（readme.md 7.2），但双语模式是任务创建时就定好的
      // JobOptions.outputMode，一个任务只生成一份文件，这里不再按 mode 现场重新拼装。
      const downloadName = `${row.fileName.replace(/\.[^./]+$/, '')}.zh.${row.format}`;
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
      reply.type('text/plain; charset=utf-8');
      return reply.send(readTextFile(row.outputPath));
    },
  );
}
