import Bottleneck from 'bottleneck';
import type { HttpClient } from '@subferry/core';

/**
 * 全局限流（readme.md 4.4"Web 版的特殊之处：全局限流"）：限流器按服务实例建立，
 * 所有任务共享同一个实例的限流器，而不是每个任务各建一个。
 */
const limiters = new Map<string, Bottleneck>();

export function getLimiter(serviceInstanceId: string, rpm: number, maxConcurrency: number): Bottleneck {
  const minTime = Math.max(1, Math.ceil(60_000 / Math.max(1, rpm)));
  let limiter = limiters.get(serviceInstanceId);
  if (!limiter) {
    limiter = new Bottleneck({ maxConcurrent: maxConcurrency, minTime });
    limiters.set(serviceInstanceId, limiter);
  } else {
    // 配置可能在服务实例更新后变化，惰性同步到已存在的限流器，不需要重启服务。
    void limiter.updateSettings({ maxConcurrent: maxConcurrency, minTime });
  }
  return limiter;
}

/** 把一个 HttpClient 包一层限流调度，实际发出请求前先过 bottleneck。 */
export function limitHttpClient(base: HttpClient, limiter: Bottleneck): HttpClient {
  return {
    fetch: (url, init) => limiter.schedule(() => base.fetch(url, init)),
  };
}

/** 仅供测试使用：清空所有限流器状态。 */
export function resetLimiters(): void {
  limiters.clear();
}
