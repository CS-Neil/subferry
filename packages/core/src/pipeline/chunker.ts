import type { Cue } from '../subtitle/model.js';

/**
 * 分批（readme.md 4.5）：默认每批 40 条，可在 20 到 60 条之间浮动；切分点优先选在字幕间隔
 * 最大的位置，间隔超过 2 秒通常意味着场景切换。
 *
 * 只有 translatable 的 cue 占批次配额；skipped 的 cue 不进入任何批次（它们不需要翻译，
 * 写出时直接使用原文），但仍保留在文档序列中，供 pipeline/context.ts 取上下文时使用。
 */
export interface ChunkOptions {
  batchSize?: number; // 目标批大小，默认 40
  minBatchSize?: number; // 默认 20
  maxBatchSize?: number; // 默认 60
  gapThresholdMs?: number; // 优先切分点的间隔阈值，默认 2000ms
}

export interface Batch {
  idFrom: number;
  idTo: number;
  items: Cue[];
}

const DEFAULTS: Required<ChunkOptions> = {
  batchSize: 40,
  minBatchSize: 20,
  maxBatchSize: 60,
  gapThresholdMs: 2000,
};

export function chunkCues(cues: Cue[], opts: ChunkOptions = {}): Batch[] {
  const { batchSize, minBatchSize, maxBatchSize, gapThresholdMs } = { ...DEFAULTS, ...opts };
  const translatable = cues.filter((c) => c.translatable);
  if (translatable.length === 0) return [];

  const batches: Batch[] = [];
  let start = 0;

  while (start < translatable.length) {
    const remaining = translatable.length - start;
    if (remaining <= maxBatchSize) {
      // 剩余条目一批放不下上限就放不下，放得下就直接收尾，避免切出一个过小的尾批
      batches.push(makeBatch(translatable.slice(start)));
      break;
    }

    // 在 [start+minBatchSize, start+maxBatchSize) 范围内寻找间隔最大的切分点，
    // 找不到明显大间隔时退回到 batchSize 处切分。
    const searchEnd = Math.min(start + maxBatchSize, translatable.length);
    const searchStart = start + minBatchSize;
    let cutIndex = Math.min(start + batchSize, searchEnd);
    let bestGap = -1;

    for (let i = searchStart; i < searchEnd; i++) {
      const gap = translatable[i].startMs - translatable[i - 1].endMs;
      if (gap > gapThresholdMs && gap > bestGap) {
        bestGap = gap;
        cutIndex = i;
      }
    }

    batches.push(makeBatch(translatable.slice(start, cutIndex)));
    start = cutIndex;
  }

  return batches;
}

function makeBatch(items: Cue[]): Batch {
  return { idFrom: items[0].id, idTo: items[items.length - 1].id, items };
}
