import type { ConfigField, TranslateService } from './types.js';
import { callChatCompletions, DEFAULT_LANGUAGE_MAP, type OpenAIConfig } from './openai/index.js';
import { renderPrompt } from '../prompts/default.js';

/**
 * 国内外主流大模型的预设：固定 baseURL 和默认模型，用户只需要填 API Key（模型字段可选，
 * 留空则使用预设默认值；doubao 等没有通用默认模型的情况下模型字段标为必填）。
 * 复用 openai/index.ts 的传输层——这些服务全部走标准的 OpenAI chat/completions 协议，
 * 只是各家的接口地址和模型命名不同。
 */
export interface OpenAICompatiblePreset {
  name: string;
  displayName: string;
  baseURL: string;
  defaultModel?: string;
  modelRequired?: boolean;
  modelDescription?: string;
  docsUrl?: string;
}

export const OPENAI_COMPATIBLE_PRESETS: OpenAICompatiblePreset[] = [
  {
    name: 'openai',
    displayName: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'gemini',
    displayName: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    name: 'qwen',
    displayName: '通义千问（阿里云百炼）',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    docsUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
  },
  {
    name: 'moonshot',
    displayName: 'Kimi（Moonshot AI）',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-latest',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    name: 'zhipu',
    displayName: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    name: 'doubao',
    displayName: '豆包（火山方舟）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    modelRequired: true,
    modelDescription: '填写火山方舟控制台创建的推理接入点 ID（形如 ep-2024xxxxxx-xxxxx）',
    docsUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  },
];

export function createOpenAICompatibleService(preset: OpenAICompatiblePreset): TranslateService {
  const configSchema: ConfigField[] = [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'string',
      required: true,
      secret: true,
      description: preset.docsUrl ? `在 ${preset.docsUrl} 获取` : undefined,
    },
    {
      key: 'model',
      label: '模型',
      type: 'string',
      required: Boolean(preset.modelRequired),
      secret: false,
      default: preset.defaultModel,
      description: preset.modelDescription ?? (preset.defaultModel ? `留空则使用默认模型 ${preset.defaultModel}` : undefined),
    },
    { key: 'temperature', label: '温度', type: 'number', default: 0.3, secret: false, required: false },
  ];

  function resolveConfig(rawConfig: Record<string, unknown>): OpenAIConfig {
    const model = (rawConfig.model as string | undefined)?.trim();
    return {
      baseURL: preset.baseURL,
      apiKey: rawConfig.apiKey as string,
      model: model || preset.defaultModel || '',
      temperature: rawConfig.temperature as number | undefined,
      jsonMode: true,
    };
  }

  return {
    info: {
      name: preset.name,
      displayName: preset.displayName,
      capabilities: { batch: true, jsonMode: true, stream: false, maxBatchSize: 60 },
      configSchema,
    },
    Language: DEFAULT_LANGUAGE_MAP,

    async translate(text, from, to, opts) {
      const config = { ...resolveConfig(opts.config), jsonMode: false };
      const content = await callChatCompletions(
        config,
        [
          {
            role: 'system',
            content: `你是一名翻译。把用户消息从${from}翻译为${to}，只输出译文本身，不要任何解释或额外内容。`,
          },
          { role: 'user', content: text },
        ],
        opts,
      );
      return content.trim();
    },

    async translateBatch(req, opts) {
      const config = resolveConfig(opts.config);
      const { system, user } = renderPrompt(req);
      return callChatCompletions(
        config,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        opts,
      );
    },
  };
}
