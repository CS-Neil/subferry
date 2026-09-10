import { extractGlossaryCandidates, getService, defaultHttpClient } from '@subferry/core';
import type { JobOptions } from '@subferry/shared';
import { getJobRow, setJobStatus } from '../db/jobs-repo.js';
import { listCuesForJob } from '../db/cues-repo.js';
import { getServiceInstanceRow, loadFullConfig } from '../db/service-instances-repo.js';
import { listGlossaryForProject, insertGlossaryEntry } from '../db/glossary-repo.js';
import { getLimiter, limitHttpClient } from './limiter.js';
import { wrapWithInstanceProxy } from '../net/proxy.js';
import type { JobRunnerContext } from './job-runner.js';

/**
 * 术语自动提取阶段（readme.md 4.7），对应 job 状态里的 `parsing`——文件本身的解析在上传时
 * 已经同步做完（快，纯本地操作），这里的 "parsing" 专指"提取候选术语"这个需要调用大模型、
 * 因而需要走调度器异步执行的阶段。跑完后：
 * - 没有新术语，或方案设置了自动确认：直接进 `queued`，交给 runJob 翻译。
 * - 有新的未确认术语：进 `awaiting_glossary`，等用户在术语表页确认（POST .../glossary/confirm）。
 *
 * 没有项目、没有服务实例、服务不支持提取（未实现 chat）时都直接跳过提取、进入 `queued`——
 * 术语提取本身是锦上添花的功能，不应该因为不可用而阻塞翻译。
 */
export async function runGlossaryPhase(ctx: JobRunnerContext, jobId: string, signal: AbortSignal): Promise<void> {
  const { db, config, bus } = ctx;
  const jobRow = getJobRow(db, jobId);
  if (!jobRow) return;

  const skip = (): void => {
    setJobStatus(db, jobId, 'queued');
    bus.emitJobEvent({ type: 'status', jobId, status: 'queued' });
  };

  if (!jobRow.projectId || !jobRow.serviceInstanceId) return skip();
  const serviceRow = getServiceInstanceRow(db, jobRow.serviceInstanceId);
  if (!serviceRow) return skip();
  const service = getService(serviceRow.serviceName);
  if (!service?.chat) return skip();

  const cueRows = listCuesForJob(db, jobId);
  const sourceTexts = cueRows.filter((r) => r.status !== 'skipped').map((r) => r.source);
  if (sourceTexts.length === 0) return skip();

  const fullConfig = loadFullConfig(serviceRow, config.appSecret);
  const limiter = getLimiter(serviceRow.id, serviceRow.rpm, serviceRow.maxConcurrency);
  const http = limitHttpClient(wrapWithInstanceProxy(defaultHttpClient, serviceRow.proxyUrl ?? undefined), limiter);

  let candidates: Awaited<ReturnType<typeof extractGlossaryCandidates>> = [];
  try {
    candidates = await extractGlossaryCandidates(sourceTexts, service, { config: fullConfig, http, signal });
  } catch {
    // 提取失败不阻塞翻译：直接当作"没有新术语"处理，用户仍可以在术语表页手动补充。
    candidates = [];
  }
  if (signal.aborted) return;

  const options = JSON.parse(jobRow.optionsJson) as JobOptions;
  const existingSources = new Set(listGlossaryForProject(db, jobRow.projectId).map((e) => e.source));
  const newOnes = candidates.filter((c) => !existingSources.has(c.source));

  for (const c of newOnes) {
    insertGlossaryEntry(db, jobRow.projectId, {
      source: c.source,
      target: c.target,
      type: c.type,
      note: c.note,
      confirmed: options.glossaryAutoConfirm,
    });
  }

  if (newOnes.length === 0 || options.glossaryAutoConfirm) {
    skip();
  } else {
    setJobStatus(db, jobId, 'awaiting_glossary');
    bus.emitJobEvent({ type: 'status', jobId, status: 'awaiting_glossary' });
  }
}
