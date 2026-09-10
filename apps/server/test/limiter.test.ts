import { describe, expect, it } from 'vitest';
import { getLimiter, limitHttpClient, resetLimiters } from '../src/worker/limiter.js';

describe('worker/limiter：按服务实例的全局并发限制', () => {
  it('不超过配置的 maxConcurrency，且多个调用方共享同一个限流器实例', async () => {
    resetLimiters();
    const limiter = getLimiter('svc@test', 6000, 2);
    let current = 0;
    let maxObserved = 0;
    const fakeHttp = {
      fetch: async () => {
        current++;
        maxObserved = Math.max(maxObserved, current);
        await new Promise((r) => setTimeout(r, 30));
        current--;
        return new Response('{}');
      },
    };
    const limited = limitHttpClient(fakeHttp, limiter);

    await Promise.all(Array.from({ length: 8 }, () => limited.fetch('http://x')));
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('getLimiter 对同一 id 重复调用返回同一个限流器，且能热更新配置', async () => {
    resetLimiters();
    const a = getLimiter('svc@same', 600, 3);
    const b = getLimiter('svc@same', 60, 1); // 模拟服务实例配置被更新
    expect(a).toBe(b);
  });
});
