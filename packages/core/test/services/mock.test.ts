import { describe, expect, it } from 'vitest';
import { mockService } from '../../src/services/mock/index.js';
import type { BatchRequest } from '../../src/services/types.js';
import { defaultHttpClient } from '../../src/services/http-client.js';

function req(overrides: Partial<BatchRequest> = {}): BatchRequest {
  return {
    items: [
      { id: 1, text: '어디 가?' },
      { id: 2, text: '집에 가.' },
    ],
    contextBefore: [],
    contextAfter: [],
    from: '한국어',
    to: '中文',
    ...overrides,
  };
}

describe('mockService.translateBatch 正常路径', () => {
  it('返回以 id 为键的 JSON，译文带前缀且不含原文的韩文字符（不会被残留原文校验误判）', async () => {
    const raw = await mockService.translateBatch!(req(), { config: {}, http: defaultHttpClient });
    const parsed = JSON.parse(raw);
    expect(parsed['1']).toMatch(/^【译】/);
    expect(parsed['2']).toMatch(/^【译】/);
    expect(parsed['1']).not.toMatch(/[가-힣]/);
    expect(parsed['2']).not.toMatch(/[가-힣]/);
  });

  it('支持自定义前缀', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { prefix: '[ZH] ' },
      http: defaultHttpClient,
    });
    expect(JSON.parse(raw)['1']).toMatch(/^\[ZH\] /);
  });

  it('保留占位符 ⟨N⟩，供校验阶段还原回真实标签', async () => {
    const raw = await mockService.translateBatch!(
      req({ items: [{ id: 1, text: '⟨1⟩안녕⟨2⟩' }] }),
      { config: {}, http: defaultHttpClient },
    );
    expect(JSON.parse(raw)['1']).toContain('⟨1⟩');
    expect(JSON.parse(raw)['1']).toContain('⟨2⟩');
  });
});

describe('mockService.translateBatch 故障注入', () => {
  it('missing-id：缺失第一个 id', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { faults: ['missing-id'] },
      http: defaultHttpClient,
    });
    const parsed = JSON.parse(raw);
    expect(parsed['1']).toBeUndefined();
    expect(parsed['2']).toBeDefined();
  });

  it('merge-ids：两条被拼接成一条，第二个 id 消失', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { faults: ['merge-ids'] },
      http: defaultHttpClient,
    });
    const parsed = JSON.parse(raw);
    expect(parsed['2']).toBeUndefined();
    expect(parsed['1']).toBeDefined();
  });

  it('empty：第一条译文为空字符串', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { faults: ['empty'] },
      http: defaultHttpClient,
    });
    expect(JSON.parse(raw)['1']).toBe('');
  });

  it('bad-placeholder：混入多余的占位符标记', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { faults: ['bad-placeholder'] },
      http: defaultHttpClient,
    });
    expect(JSON.parse(raw)['1']).toContain('⟨99⟩');
  });

  it('non-json：返回的不是合法 JSON', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { faults: ['non-json'] },
      http: defaultHttpClient,
    });
    expect(() => JSON.parse(raw)).toThrow();
  });

  it('refuse：返回拒答文本', async () => {
    const raw = await mockService.translateBatch!(req(), {
      config: { faults: ['refuse'] },
      http: defaultHttpClient,
    });
    expect(raw).toMatch(/cannot|sorry/i);
  });

  it('rate-limit-429：抛出 ServiceHttpError(429)', async () => {
    await expect(
      mockService.translateBatch!(req(), { config: { faults: ['rate-limit-429'] }, http: defaultHttpClient }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('failTimes 限制故障只触发前 N 次，之后恢复正常', async () => {
    const counter = { count: 0 };
    const config = { faults: ['missing-id'] as const, failTimes: 1, counter };
    const first = JSON.parse(await mockService.translateBatch!(req(), { config, http: defaultHttpClient }));
    expect(first['1']).toBeUndefined();
    const second = JSON.parse(await mockService.translateBatch!(req(), { config, http: defaultHttpClient }));
    expect(second['1']).toBeDefined();
    expect(counter.count).toBe(2);
  });
});
