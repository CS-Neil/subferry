import { describe, expect, it } from 'vitest';
import { parseSrt, writeSrt } from '../../src/subtitle/srt.js';
import { preprocessDocument } from '../../src/preprocess/index.js';
import { runPipeline } from '../../src/pipeline/runner.js';
import { postprocessDocument } from '../../src/postprocess/index.js';
import { mockService } from '../../src/services/mock/index.js';
import { defaultHttpClient } from '../../src/services/http-client.js';

/**
 * 端到端集成测试：解析 → 预处理 → 翻译（mock）→ 后处理 → 写出，覆盖 readme.md 12 章
 * "故障注入测试"要求的核心断言：任务必然结束，且每条 cue 最终状态只能是 done/failed/skipped，
 * 不允许残留 pending。这是 Phase 6 手工端到端验证在自动化测试里的对应版本。
 */
const SAMPLE_SRT = [
  '1',
  '00:00:01,000 --> 00:00:02,500',
  '어디 가?',
  '',
  '2',
  '00:00:03,000 --> 00:00:05,000',
  '<i>지금</i> 집에 가고 있어요',
  '',
  '3',
  '00:00:06,000 --> 00:00:07,000',
  '♪ ~ ♪',
  '',
  '4',
  '00:00:08,000 --> 00:00:09,000',
  '- 안녕\n- 안녕하세요',
  '',
].join('\n');

describe('完整流水线：解析 → 预处理 → 翻译 → 后处理 → 写出', () => {
  it('无故障：全部 translatable 条目变为 done，skipped 条目原样保留，输出仍是合法 SRT', async () => {
    const parsed = parseSrt(SAMPLE_SRT);
    const preprocessed = preprocessDocument(parsed);

    // 第 3 条是纯音乐符号行，应被标记为 skipped
    expect(preprocessed.cues[2].status).toBe('skipped');
    expect(preprocessed.cues[2].translatable).toBe(false);

    const translated = await runPipeline(
      preprocessed,
      { from: 'ko', to: 'zh', batchSize: 40 },
      mockService,
      { config: {}, http: defaultHttpClient },
    );

    for (const cue of translated.cues) {
      expect(['done', 'skipped']).toContain(cue.status);
    }
    // 第 2 条含 <i> 标签，译文中应还原出 <i>...</i>
    expect(translated.cues[1].target).toContain('<i>');
    // 第 4 条多人对白，"- " 前缀应保留
    expect(translated.cues[3].target).toContain('- ');

    const postprocessed = postprocessDocument(translated);
    const output = writeSrt(postprocessed);

    // 输出仍然是结构合法的 SRT：条目数不变，时间轴逐字符保留
    const outputDoc = parseSrt(output);
    expect(outputDoc.cues).toHaveLength(4);
    expect(outputDoc.cues.map((c) => c.rawTime)).toEqual(parsed.cues.map((c) => c.rawTime));
    // 跳过的音乐符号行原文保留
    expect(outputDoc.cues[2].source).toBe('♪ ~ ♪');
  });

  it('持续故障：任务仍然结束，没有残留 pending 状态', async () => {
    const parsed = parseSrt(SAMPLE_SRT);
    const preprocessed = preprocessDocument(parsed);

    const translated = await runPipeline(
      preprocessed,
      { from: 'ko', to: 'zh', batchSize: 40 },
      mockService,
      { config: { faults: ['missing-id'] }, http: defaultHttpClient },
    );

    for (const cue of translated.cues) {
      expect(['done', 'failed', 'skipped']).toContain(cue.status);
      expect(cue.status).not.toBe('pending');
    }

    // 即使有失败条目，写出也不应该抛异常，且仍是合法 SRT
    const postprocessed = postprocessDocument(translated);
    expect(() => writeSrt(postprocessed)).not.toThrow();
  });

  it.each([
    'missing-id',
    'merge-ids',
    'empty',
    'bad-placeholder',
    'non-json',
    'refuse',
    'rate-limit-429',
  ] as const)('故障注入 %s：任务必然结束，不留 pending', async (fault) => {
    const parsed = parseSrt(SAMPLE_SRT);
    const preprocessed = preprocessDocument(parsed);

    const translated = await runPipeline(
      preprocessed,
      { from: 'ko', to: 'zh', batchSize: 40 },
      mockService,
      { config: { faults: [fault] }, http: defaultHttpClient },
    );

    for (const cue of translated.cues) {
      expect(cue.status).not.toBe('pending');
    }
  });
});
