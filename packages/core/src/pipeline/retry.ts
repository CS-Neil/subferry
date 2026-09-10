import type { Cue, CueFlag } from '../subtitle/model.js';
import type { BatchItem, BatchRequest, CallOptions, TranslateService } from '../services/types.js';
import { ServiceHttpError } from '../services/types.js';
import { restoreTags } from '../preprocess/tags.js';
import { validateBatch } from './validator.js';

/**
 * 校验与重试（readme.md 4.6）。逐级降级：
 *
 *   1. 部分接受：合格条目立即计入结果，只对缺失/异常的 id 发起下一轮。
 *   2. 整批重试：对剩余失败 id 最多重试 `maxRetries` 次（默认2），重试消息中指出上次的问题。
 *   3. 二分拆批：重试次数耗尽后，若剩余 id 数 > 1，对半拆分后分别递归（重置 attempt 计数）。
 *   4. 标记失败：单条仍失败时，保留原文，任务继续，不抛异常——上层 runner 保证任务总能结束。
 *
 * 网络错误（429/5xx）在 callWithBackoff 中单独按指数退避重试，遵守 Retry-After，
 * 与上面的内容校验重试是两套独立机制。
 */

export interface CueResult {
  id: number;
  status: 'done' | 'failed';
  target: string;
  flags: CueFlag[];
}

export interface RetryConfig {
  service: TranslateService;
  callOptions: CallOptions;
  from: string;
  to: string;
  synopsis?: string;
  glossary?: string;
  contextBefore: BatchItem[];
  contextAfter: BatchItem[];
  maxRetries: number;
  maxNetworkRetries?: number;
}

const DEFAULT_MAX_NETWORK_RETRIES = 4;
const MAX_SPLIT_DEPTH = 8; // 安全上限：批大小上限 60，log2(60)≈6，8 足够覆盖且防止意外死循环

function cueToBatchItem(cue: Cue): BatchItem {
  return { id: cue.id, speaker: cue.speaker, text: cue.source };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

async function callWithBackoff(items: Cue[], cfg: RetryConfig, retryNote?: string): Promise<string> {
  const maxNetworkRetries = cfg.maxNetworkRetries ?? DEFAULT_MAX_NETWORK_RETRIES;
  const req: BatchRequest = {
    items: items.map(cueToBatchItem),
    contextBefore: cfg.contextBefore,
    contextAfter: cfg.contextAfter,
    from: cfg.from,
    to: cfg.to,
    synopsis: cfg.synopsis,
    glossary: cfg.glossary,
    retryNote,
  };

  for (let attempt = 0; ; attempt++) {
    try {
      return await cfg.service.translateBatch!(req, cfg.callOptions);
    } catch (err) {
      const retryable = err instanceof ServiceHttpError && (err.status === 429 || err.status >= 500);
      if (!retryable || attempt >= maxNetworkRetries) throw err;
      const delay = (err as ServiceHttpError).retryAfterMs ?? Math.min(30_000, 500 * 2 ** attempt);
      await sleep(delay, cfg.callOptions.signal);
    }
  }
}

function fallbackText(cue: Cue): string {
  // 保留原文：把占位符还原回真实标签，尽量接近未翻译前的原始样子。
  return restoreTags(cue.source, cue.placeholders, cue.leadingTags);
}

function markAllFailed(items: Cue[]): Map<number, CueResult> {
  const out = new Map<number, CueResult>();
  for (const cue of items) {
    out.set(cue.id, { id: cue.id, status: 'failed', target: fallbackText(cue), flags: ['failed'] });
  }
  return out;
}

function buildRetryNote(needsRetry: Map<number, string>, items: Cue[]): string {
  const byId = new Map(items.map((c) => [c.id, c]));
  const lines: string[] = [];
  for (const [id, reason] of needsRetry) {
    const cue = byId.get(id);
    if (!cue) continue;
    lines.push(`${id}: 上次的问题是「${reason}」，请重新给出完整、正确的译文。`);
  }
  return lines.join('\n');
}

export async function translateWithRetry(items: Cue[], cfg: RetryConfig): Promise<Map<number, CueResult>> {
  return translateWithRetryInner(items, cfg, 0, 0, undefined);
}

async function translateWithRetryInner(
  items: Cue[],
  cfg: RetryConfig,
  attempt: number,
  depth: number,
  retryNote: string | undefined,
): Promise<Map<number, CueResult>> {
  if (items.length === 0) return new Map();

  let raw: string;
  try {
    raw = await callWithBackoff(items, cfg, retryNote);
  } catch {
    // 网络错误重试耗尽，或遇到不可重试的错误（如 401/400）：不再做内容校验重试，直接标记失败。
    return markAllFailed(items);
  }

  const result = validateBatch(raw, items, { from: cfg.from });
  const out = new Map<number, CueResult>();
  for (const [id, acc] of result.accepted) {
    out.set(id, { id, status: 'done', target: acc.text, flags: acc.flags });
  }

  const failedCues = items.filter((c) => result.needsRetry.has(c.id));
  if (failedCues.length === 0) return out;

  if (attempt < cfg.maxRetries) {
    const note = buildRetryNote(result.needsRetry, items);
    const retried = await translateWithRetryInner(failedCues, cfg, attempt + 1, depth, note);
    for (const [id, r] of retried) out.set(id, r);
    return out;
  }

  if (failedCues.length > 1 && depth < MAX_SPLIT_DEPTH) {
    const mid = Math.ceil(failedCues.length / 2);
    const left = failedCues.slice(0, mid);
    const right = failedCues.slice(mid);
    const [leftResult, rightResult] = await Promise.all([
      translateWithRetryInner(left, cfg, 0, depth + 1, undefined),
      translateWithRetryInner(right, cfg, 0, depth + 1, undefined),
    ]);
    for (const [id, r] of leftResult) out.set(id, r);
    for (const [id, r] of rightResult) out.set(id, r);
    return out;
  }

  for (const [id, r] of markAllFailed(failedCues)) out.set(id, r);
  return out;
}
