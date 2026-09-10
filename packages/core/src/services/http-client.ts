/**
 * HttpClient 是翻译服务发起请求的唯一出口，通过依赖注入提供（见 CallOptions.http）。
 * 生产环境下由 apps/server/src/net 提供基于 undici fetch 的实现（支持全局/实例代理）；
 * 测试时可以注入一个返回预置 Response 的假实现，完全不出网。
 */
export interface HttpClient {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

/** 默认实现：直接使用全局 fetch（Node 18+ 内置，undici 提供）。 */
export const defaultHttpClient: HttpClient = {
  fetch: (url, init) => fetch(url, init),
};
