import { describe, expect, it, vi } from 'vitest';
import { wrapWithInstanceProxy, setupGlobalProxy } from '../src/net/proxy.js';
import type { HttpClient } from '@subferry/core';

describe('wrapWithInstanceProxy', () => {
  it('没有 proxyUrl 时原样返回底层 HttpClient', () => {
    const base: HttpClient = { fetch: vi.fn() };
    expect(wrapWithInstanceProxy(base, undefined)).toBe(base);
  });

  it('设置了 proxyUrl 时请求会带上 dispatcher', async () => {
    const base: HttpClient = { fetch: vi.fn(async () => new Response('{}')) };
    const wrapped = wrapWithInstanceProxy(base, 'http://127.0.0.1:1');
    await wrapped.fetch('http://example.com');
    const call = (base.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toHaveProperty('dispatcher');
  });
});

describe('setupGlobalProxy', () => {
  it('没有代理环境变量时返回 false，不设置全局 dispatcher', () => {
    expect(setupGlobalProxy({})).toBe(false);
  });

  it('设置了 HTTPS_PROXY 时返回 true', () => {
    expect(setupGlobalProxy({ HTTPS_PROXY: 'http://127.0.0.1:1' })).toBe(true);
  });
});
