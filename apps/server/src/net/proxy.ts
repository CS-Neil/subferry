import { EnvHttpProxyAgent, ProxyAgent, setGlobalDispatcher } from 'undici';
import type { HttpClient } from '@subferry/core';

/**
 * 出站代理（readme.md 7.6）：
 * 1. 全局代理——启动时设置 undici 的 EnvHttpProxyAgent 作为全局 dispatcher，读取
 *    HTTPS_PROXY / HTTP_PROXY / NO_PROXY 环境变量，对所有未显式指定代理的出站请求生效
 *    （包括 core 包里通过全局 fetch 发起的请求）。
 * 2. 实例代理——单个服务实例在 config 里填写 proxyUrl 时，只包一层该实例自己的
 *    ProxyAgent，不影响其它实例或全局设置。
 */
export function setupGlobalProxy(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.HTTPS_PROXY && !env.HTTP_PROXY && !env.https_proxy && !env.http_proxy) return false;
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return true;
}

export function wrapWithInstanceProxy(base: HttpClient, proxyUrl: string | undefined): HttpClient {
  if (!proxyUrl) return base;
  const dispatcher = new ProxyAgent(proxyUrl);
  return {
    fetch: (url, init) => base.fetch(url, { ...init, dispatcher } as RequestInit),
  };
}
