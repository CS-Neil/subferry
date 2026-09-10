import { describe, expect, it } from 'vitest';
import { chunkCues } from '../../src/pipeline/chunker.js';
import type { Cue } from '../../src/subtitle/model.js';

function makeCue(id: number, startMs: number, endMs: number, translatable = true): Cue {
  return {
    id,
    rawTime: `${startMs}-${endMs}`,
    startMs,
    endMs,
    meta: {},
    leadingTags: '',
    source: `text ${id}`,
    placeholders: [],
    translatable,
    status: translatable ? 'pending' : 'skipped',
    flags: [],
  };
}

describe('chunkCues', () => {
  it('少量条目放进单个批次', () => {
    const cues = [makeCue(1, 0, 1000), makeCue(2, 1500, 2500)];
    const batches = chunkCues(cues);
    expect(batches).toHaveLength(1);
    expect(batches[0].idFrom).toBe(1);
    expect(batches[0].idTo).toBe(2);
  });

  it('跳过不可翻译条目，不计入批次配额', () => {
    const cues = [makeCue(1, 0, 1000), makeCue(2, 1000, 2000, false), makeCue(3, 2000, 3000)];
    const batches = chunkCues(cues);
    const allIds = batches.flatMap((b) => b.items.map((c) => c.id));
    expect(allIds).toEqual([1, 3]);
  });

  it('超过上限时在最大间隔处切分', () => {
    const cues: Cue[] = [];
    for (let i = 0; i < 70; i++) {
      // 在第 30 条后制造一个 5 秒的大间隔
      const start = i < 30 ? i * 1000 : (i - 30) * 1000 + 30000 + 5000;
      cues.push(makeCue(i + 1, start, start + 900));
    }
    const batches = chunkCues(cues, { batchSize: 40, minBatchSize: 20, maxBatchSize: 60 });
    expect(batches.length).toBeGreaterThan(1);
    // 第一批应该在间隔最大处（第30条）切分，而不是机械地切在第40条
    expect(batches[0].items.length).toBe(30);
  });

  it('没有明显大间隔时退回到 batchSize 处切分', () => {
    const cues: Cue[] = [];
    for (let i = 0; i < 90; i++) cues.push(makeCue(i + 1, i * 1000, i * 1000 + 900));
    const batches = chunkCues(cues, { batchSize: 40, minBatchSize: 20, maxBatchSize: 60 });
    expect(batches[0].items.length).toBe(40);
  });

  it('空输入返回空数组', () => {
    expect(chunkCues([])).toEqual([]);
  });
});
