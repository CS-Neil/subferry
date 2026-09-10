import type { ServiceInfo, ConfigField, ServiceCapabilities } from '@subferry/shared';
import type { HttpClient } from './http-client.js';

export type { ServiceInfo, ConfigField, ServiceCapabilities };

/** 统一语言键，沿用 pot-desktop 的思路（readme.md 2.2）。M1 只用到韩语/意大利语/中文，按需扩展。 */
export type LangKey = 'zh_cn' | 'ko' | 'it' | 'en' | 'ja' | (string & {});
export type LanguageMap = Partial<Record<LangKey, string>>;

export interface CallOptions {
  config: Record<string, unknown>; // 已解密的实例配置
  http: HttpClient; // 注入：按实例配置决定是否走代理
  signal?: AbortSignal; // 暂停、取消、服务关闭时中断请求
  onProgress?: (partial: string) => void;
}

export interface BatchItem {
  id: number;
  speaker?: string;
  text: string;
}

/** 批量翻译请求。渲染提示词模板时使用（见 pipeline/context.ts、prompts/default.ts）。 */
export interface BatchRequest {
  items: BatchItem[];
  contextBefore: BatchItem[]; // 仅供参考，不要求模型翻译
  contextAfter: BatchItem[];
  from: string;
  to: string;
  synopsis?: string; // M1 恒为空字符串，术语表/项目简介是 M2 功能
  glossary?: string; // 同上
  /** 上一次失败的具体问题说明，重试时附加到用户消息，帮助模型理解要修正什么（pipeline/retry.ts 使用）。 */
  retryNote?: string;
}

export interface TranslateService {
  info: ServiceInfo;
  Language: LanguageMap;
  /** pot 原接口：单条翻译，主要用于"测试连接"。 */
  translate(text: string, from: string, to: string, opts: CallOptions): Promise<string>;
  /** 批量扩展：返回模型的原始回复字符串（未解析），解析/校验是 pipeline/validator.ts 的职责。 */
  translateBatch?(req: BatchRequest, opts: CallOptions): Promise<string>;
}

/**
 * 服务层 HTTP 错误。携带 status 与 retryAfter，供 pipeline/retry.ts 的指数退避逻辑使用
 * （429/5xx 按此重试，并遵守服务端返回的 Retry-After，见 readme.md 4.6）。
 */
export class ServiceHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ServiceHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}
