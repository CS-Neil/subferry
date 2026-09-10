import type { Cue } from '../subtitle/model.js';
import type { Batch } from './chunker.js';
import type { BatchItem } from '../services/types.js';

/**
 * 每批附带前 N 条、后 M 条字幕作为上下文（默认 5/3，readme.md 4.5）。
 * M1 只实现标准模式（同一任务内多批并行），上下文仅原文，不含已完成的译文——
 * 精翻模式（上下文含已完成译文、严格顺序执行）是 M2 范围。
 *
 * 上下文按文档顺序取相邻条目，不区分是否 translatable（被过滤的 skipped 条目也可以
 * 作为语境参考）。
 */
export function getContext(
  allCues: Cue[],
  batch: Batch,
  before = 5,
  after = 3,
): { before: BatchItem[]; after: BatchItem[] } {
  const firstIndex = allCues.findIndex((c) => c.id === batch.idFrom);
  const lastIndex = allCues.findIndex((c) => c.id === batch.idTo);

  const beforeCues = firstIndex >= 0 ? allCues.slice(Math.max(0, firstIndex - before), firstIndex) : [];
  const afterCues = lastIndex >= 0 ? allCues.slice(lastIndex + 1, lastIndex + 1 + after) : [];

  return { before: beforeCues.map(toBatchItem), after: afterCues.map(toBatchItem) };
}

function toBatchItem(cue: Cue): BatchItem {
  return { id: cue.id, speaker: cue.speaker, text: cue.source };
}
