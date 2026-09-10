import { describe, expect, it } from 'vitest';
import { translateWithRetry } from '../../src/pipeline/retry.js';
import { mockService } from '../../src/services/mock/index.js';
import { defaultHttpClient } from '../../src/services/http-client.js';
import type { Cue } from '../../src/subtitle/model.js';
import type { MockFault } from '../../src/services/mock/index.js';

function makeCue(id: number, source: string): Cue {
  return {
    id,
    rawTime: 'x',
    startMs: id * 1000,
    endMs: id * 1000 + 900,
    meta: {},
    leadingTags: '',
    source,
    placeholders: [],
    translatable: true,
    status: 'pending',
    flags: [],
  };
}

function baseConfig(faults?: MockFault[], failTimes?: number) {
  return {
    service: mockService,
    callOptions: { config: { faults, failTimes, counter: { count: 0 } }, http: defaultHttpClient },
    from: 'ko',
    to: 'zh',
    contextBefore: [],
    contextAfter: [],
    maxRetries: 2,
  };
}

describe('translateWithRetry：故障注入后任务必然结束', () => {
  const cues = [makeCue(1, '어디 가?'), makeCue(2, '집에 가.')];

  it('无故障：全部 done', async () => {
    const results = await translateWithRetry(cues, baseConfig());
    expect([...results.values()].every((r) => r.status === 'done')).toBe(true);
  });

  it('missing-id 只触发一次：重试后恢复，最终 done', async () => {
    const results = await translateWithRetry(cues, baseConfig(['missing-id'], 1));
    expect(results.size).toBe(2);
    expect([...results.values()].every((r) => r.status === 'done')).toBe(true);
  });

  it('missing-id 持续触发：最终标记为 failed，但流程正常结束', async () => {
    const results = await translateWithRetry(cues, baseConfig(['missing-id']));
    expect(results.size).toBe(2);
    // 至少有一条最终失败（另一条可能在某次重试中恰好成功，取决于哪个 id 被判为 missing）
    expect([...results.values()].some((r) => r.status === 'failed')).toBe(true);
    for (const r of results.values()) {
      expect(['done', 'failed']).toContain(r.status);
      expect(typeof r.target).toBe('string');
    }
  });

  it('merge-ids 持续触发：最终结束且每条要么 done 要么 failed', async () => {
    const results = await translateWithRetry(cues, baseConfig(['merge-ids']));
    expect(results.size).toBe(2);
    for (const r of results.values()) expect(['done', 'failed']).toContain(r.status);
  });

  it('empty 持续触发：最终标记失败', async () => {
    const results = await translateWithRetry([makeCue(1, 'hi')], baseConfig(['empty']));
    expect(results.get(1)?.status).toBe('failed');
    expect(results.get(1)?.flags).toContain('failed');
  });

  it('bad-placeholder：不进入失败，而是接受并打标记', async () => {
    const cue = makeCue(1, '⟨1⟩hi');
    cue.placeholders = ['<i>'];
    const results = await translateWithRetry([cue], baseConfig(['bad-placeholder']));
    expect(results.get(1)?.status).toBe('done');
    expect(results.get(1)?.flags).toContain('bad-placeholder');
  });

  it('non-json 持续触发：最终标记失败', async () => {
    const results = await translateWithRetry([makeCue(1, 'hi')], baseConfig(['non-json']));
    expect(results.get(1)?.status).toBe('failed');
  });

  it('refuse 持续触发：最终标记失败', async () => {
    const results = await translateWithRetry([makeCue(1, 'hi')], baseConfig(['refuse']));
    expect(results.get(1)?.status).toBe('failed');
  });

  it('rate-limit-429 只触发一次：指数退避后恢复，最终 done', async () => {
    const results = await translateWithRetry(cues, baseConfig(['rate-limit-429'], 1));
    expect([...results.values()].every((r) => r.status === 'done')).toBe(true);
  }, 10_000);

  it('单条持续失败时会标记为 failed 而不是无限递归/抛异常', async () => {
    const results = await translateWithRetry([makeCue(1, 'hi')], baseConfig(['missing-id']));
    expect(results.get(1)?.status).toBe('failed');
  });

  it('大批量 + 持续故障：所有 id 都有结果，不残留 pending', async () => {
    const many = Array.from({ length: 12 }, (_, i) => makeCue(i + 1, `text ${i + 1}`));
    const results = await translateWithRetry(many, baseConfig(['missing-id']));
    expect(results.size).toBe(12);
    for (const cue of many) {
      const r = results.get(cue.id);
      expect(r).toBeDefined();
      expect(['done', 'failed']).toContain(r!.status);
    }
  });
});
