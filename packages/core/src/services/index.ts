import type { TranslateService } from './types.js';
import { customOpenAIService } from './openai/index.js';
import { OPENAI_COMPATIBLE_PRESETS, createOpenAICompatibleService } from './presets.js';
import { claudeService } from './anthropic/index.js';
import { mockService } from './mock/index.js';

export * from './types.js';
export { defaultHttpClient } from './http-client.js';
export type { HttpClient } from './http-client.js';
export { customOpenAIService, DEFAULT_LANGUAGE_MAP, callChatCompletions, type OpenAIConfig } from './openai/index.js';
export { OPENAI_COMPATIBLE_PRESETS, createOpenAICompatibleService, type OpenAICompatiblePreset } from './presets.js';
export { claudeService, type AnthropicConfig } from './anthropic/index.js';
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

// 内置服务：国内外主流大模型的预设（只需填 apiKey，见 presets.ts）+ 通用自定义地址的
// OpenAI 兼容服务 + 真正的 Claude Messages API + mock（测试/无 Key 时使用）。
// Gemini/Ollama/DeepL/通用HTTP 模板中尚未覆盖的服务、故障切换链是 M2/M3 范围
// （readme.md 13章），届时在此追加 registerService(...) 调用即可，不需要改动调用方。
for (const preset of OPENAI_COMPATIBLE_PRESETS) {
  registerService(createOpenAICompatibleService(preset));
}
registerService(customOpenAIService);
registerService(claudeService);
registerService(mockService);
