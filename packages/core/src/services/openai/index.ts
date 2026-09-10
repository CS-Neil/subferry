import type { CallOptions, BatchRequest, ConfigField, LanguageMap, TranslateService } from '../types.js';
import { ServiceHttpError, parseRetryAfter } from '../types.js';
import { renderPrompt } from '../../prompts/default.js';

/**
 * OpenAI 兼容协议的传输层：构造请求、发送、把响应体的原始字符串返回给调用方；JSON 解析
 * 与校验是 pipeline/validator.ts 的职责，保持服务层与业务校验解耦。
 *
 * 覆盖 OpenAI、DeepSeek、通义千问、Kimi、智谱及各类中转站（readme.md 4.4）。这里只放
 * 传输逻辑和"自定义地址"服务；具体厂商的预设（固定 baseURL、默认模型，用户只需填 apiKey）
 * 在 ../presets.ts 里通过 createOpenAICompatibleService 生成。
 */
export interface OpenAIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  jsonMode?: boolean;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const DEFAULT_LANGUAGE_MAP: LanguageMap = {
  zh_cn: 'Chinese (Simplified)',
  ko: 'Korean',
  ja: 'Japanese',
  en: 'English',
  it: 'Italian',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ru: 'Russian',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ar: 'Arabic',
  hi: 'Hindi',
};

export async function callChatCompletions(
  config: OpenAIConfig,
  messages: ChatMessage[],
  opts: CallOptions,
): Promise<string> {
  const url = `${config.baseURL.replace(/\/+$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: config.temperature ?? 0.3,
    messages,
  };
  if (config.jsonMode ?? true) {
    body.response_format = { type: 'json_object' };
  }

  const res = await opts.http.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    const text = await res.text().catch(() => '');
    throw new ServiceHttpError(`OpenAI 兼容服务返回 ${res.status}：${text.slice(0, 500)}`, res.status, retryAfterMs);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenAI 兼容服务响应中缺少 choices[0].message.content');
  }
  return content;
}

function buildTranslateService(name: string, displayName: string, configSchema: ConfigField[]): TranslateService {
  return {
    info: {
      name,
      displayName,
      capabilities: { batch: true, jsonMode: true, stream: false, maxBatchSize: 60 },
      configSchema,
    },
    Language: DEFAULT_LANGUAGE_MAP,

    async translate(text, from, to, opts) {
      const config = { ...(opts.config as unknown as OpenAIConfig), jsonMode: false };
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

    async translateBatch(req: BatchRequest, opts: CallOptions) {
      const config = opts.config as unknown as OpenAIConfig;
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

/**
 * 通用/自定义地址的 OpenAI 兼容服务：baseURL 由用户填写，覆盖官方预设列表之外的中转站、
 * 自建代理等场景（readme.md 2.3 提到的"其余通过通用 HTTP 模板接入"，这里是它的简化版——
 * 协议仍是标准的 OpenAI chat/completions，只是地址可自定义）。
 */
export const customOpenAIService: TranslateService = buildTranslateService('openai-compatible', '通用 OpenAI 兼容（自定义地址）', [
  {
    key: 'baseURL',
    label: '接口地址',
    type: 'string',
    required: true,
    default: 'https://api.openai.com/v1',
    secret: false,
    description: '任何兼容 OpenAI /chat/completions 协议的接口地址',
  },
  { key: 'apiKey', label: 'API Key', type: 'string', required: true, secret: true },
  { key: 'model', label: '模型', type: 'string', required: true, secret: false },
  { key: 'temperature', label: '温度', type: 'number', default: 0.3, secret: false, required: false },
  { key: 'jsonMode', label: '强制 JSON 输出', type: 'boolean', default: true, secret: false, required: false },
]);
