import {
  getService,
  defaultHttpClient,
  runPipeline,
  postprocessDocument,
  writeSubtitle,
  type SubtitleDocument,
  type BatchOutcome,
} from '@subferry/core';
import type { JobOptions } from '@subferry/shared';
import type { DB } from '../db/client.js';
import { getJobRow, setJobStatus, updateJobProgress } from '../db/jobs-repo.js';
import { listCuesForJob, rowToCue, saveCueResults } from '../db/cues-repo.js';
import { getServiceInstanceRow, loadFullConfig } from '../db/service-instances-repo.js';
import { batches } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import type { EventsBus } from './events-bus.js';
import { getLimiter, limitHttpClient } from './limiter.js';
import { outputFilePath, saveFile } from '../io/storage.js';

const LANG_DISPLAY_NAMES: Record<string, string> = {
  ko: '韩语',
  it: '意大利语',
  en: '英语',
  ja: '日语',
  zh_cn: '中文',
};

function displayName(langKey: string | null | undefined): string {
  if (!langKey) return '未知语言';
  return LANG_DISPLAY_NAMES[langKey] ?? langKey;
}

function defaultOutputName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  const ext = dot === -1 ? 'srt' : fileName.slice(dot + 1);
  return `${base}.zh.${ext}`;
}

export interface JobRunnerContext {
  db: DB;
  config: AppConfig;
  bus: EventsBus;
}

/**
 * 单任务执行体（readme.md 7.1）。调用 core 的 runPipeline + postprocessDocument，
 * 每批完成落库并推送 SSE 事件；AbortController 支持中断。
 *
 * 断点续传/重试失败条目的实现方式：把已经是 'done' 状态的条目临时标记 translatable=false，
 * chunker 会跳过它们，runPipeline 对 translatable=false 的条目原样透传（不改动 status/target），
 * 所以同一个 runJob 函数天然同时承担"首次翻译""暂停后恢复""只重试失败条目"三种场景，
 * 不需要区分处理——这三种情况下"需要处理的条目集合"（非 done 的条目）的计算方式是一样的。
 */
export async function runJob(ctx: JobRunnerContext, jobId: string, signal: AbortSignal): Promise<void> {
  const { db, config, bus } = ctx;
  const jobRow = getJobRow(db, jobId);
  if (!jobRow) return;

  const serviceRow = jobRow.serviceInstanceId ? getServiceInstanceRow(db, jobRow.serviceInstanceId) : undefined;
  if (!serviceRow) {
    setJobStatus(db, jobId, 'failed', { error: '服务实例不存在或已被删除', finishedAt: new Date().toISOString() });
    bus.emitJobEvent({ type: 'status', jobId, status: 'failed', error: '服务实例不存在或已被删除' });
    return;
  }
  const service = getService(serviceRow.serviceName);
  if (!service || !service.translateBatch) {
    const error = `服务类型不支持批量翻译：${serviceRow.serviceName}`;
    setJobStatus(db, jobId, 'failed', { error, finishedAt: new Date().toISOString() });
    bus.emitJobEvent({ type: 'status', jobId, status: 'failed', error });
    return;
  }

  const cueRows = listCuesForJob(db, jobId);
  const allCues = cueRows.map(rowToCue);
  const docForRun: SubtitleDocument = {
    format: jobRow.format as SubtitleDocument['format'],
    sourceEncoding: jobRow.encoding ?? 'UTF-8',
    eol: (jobRow.eol as SubtitleDocument['eol']) ?? '\n',
    header: '',
    cues: allCues.map((c) => (c.status === 'done' ? { ...c, translatable: false } : c)),
  };

  const options = JSON.parse(jobRow.optionsJson) as JobOptions;
  const fullConfig = loadFullConfig(serviceRow, config.appSecret);
  const limiter = getLimiter(serviceRow.id, serviceRow.rpm, serviceRow.maxConcurrency);
  const http = limitHttpClient(defaultHttpClient, limiter);

  setJobStatus(db, jobId, 'translating', { startedAt: jobRow.startedAt ?? new Date().toISOString() });
  bus.emitJobEvent({ type: 'status', jobId, status: 'translating' });

  const translatableTotal = allCues.filter((c) => c.translatable).length;
  let doneCount = allCues.filter((c) => c.status === 'done').length;
  let failedCount = allCues.filter((c) => c.status === 'failed').length;
  updateJobProgress(db, jobId, { done: doneCount, total: translatableTotal, failed: failedCount });

  const onBatchDone = async (outcome: BatchOutcome): Promise<void> => {
    const results = [...outcome.results.values()];
    saveCueResults(db, jobId, results);

    doneCount += results.filter((r) => r.status === 'done').length;
    failedCount += results.filter((r) => r.status === 'failed').length;
    updateJobProgress(db, jobId, { done: doneCount, total: translatableTotal, failed: failedCount });

    db.insert(batches)
      .values({
        jobId,
        idFrom: outcome.idFrom,
        idTo: outcome.idTo,
        serviceInstance: serviceRow.id,
        attempt: 0,
        status: results.some((r) => r.status === 'failed') ? 'failed' : 'done',
        createdAt: new Date().toISOString(),
      })
      .run();

    bus.emitJobEvent({
      type: 'progress',
      jobId,
      doneCues: doneCount,
      translatableCues: translatableTotal,
      failedCues: failedCount,
    });
    bus.emitJobEvent({ type: 'batch', jobId, idFrom: outcome.idFrom, idTo: outcome.idTo, status: 'done' });
  };

  try {
    const translated = await runPipeline(
      docForRun,
      {
        from: displayName(jobRow.srcLang),
        to: displayName(jobRow.tgtLang),
        batchSize: options.batchSize,
        contextBefore: options.contextBefore,
        contextAfter: options.contextAfter,
        maxRetries: options.maxRetries,
      },
      service,
      { config: fullConfig, http, signal },
      onBatchDone,
    );

    if (signal.aborted) {
      // 被暂停/取消中断：已完成批次已经在 onBatchDone 中落库；最终 job 状态由
      // worker/scheduler.ts 根据"暂停还是取消"决定，这里不再改写状态，也不写出文件。
      return;
    }

    const postprocessed = postprocessDocument(translated, {
      maxCharsPerLine: options.maxCharsPerLine,
      maxCharsPerSecond: options.maxCharsPerSecond,
    });
    saveCueResults(
      db,
      jobId,
      postprocessed.cues
        .filter((c) => c.status === 'done')
        .map((c) => ({ id: c.id, status: c.status, target: c.target ?? '', flags: c.flags })),
    );

    const outPath = outputFilePath(config.dataDir, jobId, defaultOutputName(jobRow.fileName));
    saveFile(outPath, writeSubtitle(postprocessed));

    setJobStatus(db, jobId, 'done', { outputPath: outPath, finishedAt: new Date().toISOString(), error: null });
    bus.emitJobEvent({ type: 'status', jobId, status: 'done' });
  } catch (err) {
    if (signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    setJobStatus(db, jobId, 'failed', { error: message, finishedAt: new Date().toISOString() });
    bus.emitJobEvent({ type: 'status', jobId, status: 'failed', error: message });
  }
}
