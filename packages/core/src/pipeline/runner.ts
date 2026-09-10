import type { SubtitleDocument } from '../subtitle/model.js';
import type { CallOptions, TranslateService } from '../services/types.js';
import { chunkCues, type ChunkOptions } from './chunker.js';
import { getContext } from './context.js';
import { translateWithRetry, type CueResult } from './retry.js';

/**
 * 对外主入口：串联分批 → 上下文 → （标准模式：多批并行）→ 校验/重试 → 写回 cues 的 target/status/flags。
 * 不碰数据库、不做任何 IO——保持 core 包"无 UI/无 IO 依赖"的原则（readme.md 3.1）。
 * 每批完成后通过 onBatchDone 回调通知调用方（apps/server 用它落库、推 SSE 进度）。
 *
 * M1 只实现标准模式（同批内条目按批并行请求）；精翻模式（严格顺序、上下文含已完成译文）
 * 是 M2 范围，chunkCues/getContext 的接口已经为它预留（context.ts 顶部注释）。
 */
export interface RunPipelineOptions extends ChunkOptions {
  contextBefore?: number;
  contextAfter?: number;
  maxRetries?: number;
  from: string;
  to: string;
  synopsis?: string;
  glossary?: string;
}

export interface BatchOutcome {
  idFrom: number;
  idTo: number;
  results: Map<number, CueResult>;
}

export async function runPipeline(
  doc: SubtitleDocument,
  options: RunPipelineOptions,
  service: TranslateService,
  callOptions: CallOptions,
  onBatchDone?: (outcome: BatchOutcome) => void | Promise<void>,
): Promise<SubtitleDocument> {
  const batches = chunkCues(doc.cues, options);

  const batchPromises = batches.map(async (batch) => {
    const ctx = getContext(doc.cues, batch, options.contextBefore, options.contextAfter);
    const results = await translateWithRetry(batch.items, {
      service,
      callOptions,
      from: options.from,
      to: options.to,
      synopsis: options.synopsis,
      glossary: options.glossary,
      contextBefore: ctx.before,
      contextAfter: ctx.after,
      maxRetries: options.maxRetries ?? 2,
    });
    await onBatchDone?.({ idFrom: batch.idFrom, idTo: batch.idTo, results });
    return results;
  });

  const allResults = await Promise.all(batchPromises);
  const merged = new Map<number, CueResult>();
  for (const results of allResults) {
    for (const [id, r] of results) merged.set(id, r);
  }

  const updatedCues = doc.cues.map((cue) => {
    if (!cue.translatable) return cue; // skipped 条目原样保留，写出时使用 source
    const r = merged.get(cue.id);
    if (!r) return cue; // 理论上不会发生：每个 translatable cue 都必然属于某一批
    return { ...cue, status: r.status, target: r.target, flags: r.flags };
  });

  return { ...doc, cues: updatedCues };
}
