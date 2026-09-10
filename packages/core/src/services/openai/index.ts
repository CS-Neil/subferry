import type { CallOptions, BatchRequest, TranslateService } from '../types.js';
import { ServiceHttpError, parseRetryAfter } from '../types.js';
import { renderPrompt } from '../../prompts/default.js';

/**
 * OpenAI 兼容服务：覆盖 OpenAI、DeepSeek、通义千问、Kimi、智谱及各类中转站
 * （readme.md 4.4）。是 M1 唯一的真实翻译服务实现。
 *
 * 只负责传输：构造请求、发送、把响应体的原始字符串返回给调用方；JSON 解析与校验是
 * pipeline/validator.ts 的职责，保持服务层与业务校验解耦。
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

async function callChatCompletions(
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

export const openaiService: TranslateService = {
  info: {
    name: 'openai',
    displayName: 'OpenAI 兼容',
    capabilities: { batch: true, jsonMode: true, stream: false, maxBatchSize: 60 },
    configSchema: [
      {
        key: 'baseURL',
        label: '接口地址',
        type: 'string',
        required: true,
        default: 'https://api.openai.com/v1',
        secret: false,
      },
      { key: 'apiKey', label: 'API Key', type: 'string', required: true, secret: true },
      { key: 'model', label: '模型', type: 'string', required: true, default: 'gpt-4o-mini', secret: false },
      { key: 'temperature', label: '温度', type: 'number', default: 0.3, secret: false, required: false },
      { key: 'jsonMode', label: '强制 JSON 输出', type: 'boolean', default: true, secret: false, required: false },
    ],
  },
  Language: {
    zh_cn: 'Chinese (Simplified)',
    ko: 'Korean',
    it: 'Italian',
    en: 'English',
    ja: 'Japanese',
  },

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
