import type { TranslateService } from './types.js';
import { openaiService } from './openai/index.js';
import { mockService } from './mock/index.js';

export * from './types.js';
export { defaultHttpClient } from './http-client.js';
export type { HttpClient } from './http-client.js';
export { openaiService } from './openai/index.js';
export { mockService } from './mock/index.js';

const registry = new Map<string, TranslateService>();

export function registerService(service: TranslateService): void {
  registry.set(service.info.name, service);
}

export function getService(name: string): TranslateService | undefined {
  return registry.get(name);
}

export function listServices(): TranslateService[] {
  return Array.from(registry.values());
}

// M1 内置服务：OpenAI 兼容 + mock。Claude/Gemini/Ollama/DeepL/通用HTTP 是 M3 范围（readme.md 13章），
// 届时在此追加 registerService(...) 调用即可，不需要改动调用方。
registerService(openaiService);
registerService(mockService);
