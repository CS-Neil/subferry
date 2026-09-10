import type { CallOptions, TranslateService } from '../types.js';
import { ServiceHttpError, parseRetryAfter } from '../types.js';
import { DEFAULT_LANGUAGE_MAP } from '../openai/index.js';
import { renderPrompt } from '../../prompts/default.js';

/**
 * Claude（Anthropic）服务：真正的 Messages API（POST /v1/messages），协议与 OpenAI 的
 * chat/completions 不同——认证用 `x-api-key` 头 + `anthropic-version` 头，system 是
 * 顶层字段而不是 messages 数组里的一条，响应体是 content 块数组而不是 choices。
 * 用户只需要填 API Key，baseURL/模型都有默认值。
 */
export interface AnthropicConfig {
  apiKey: string;
  model: string;
  temperature?: number;
}

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 8192;

async function callMessages(config: AnthropicConfig, system: string, userText: string, opts: CallOptions): Promise<string> {
  const res = await opts.http.fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: config.temperature ?? 0.3,
      system,
      messages: [{ role: 'user', content: userText }],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    const text = await res.text().catch(() => '');
    throw new ServiceHttpError(`Claude 服务返回 ${res.status}：${text.slice(0, 500)}`, res.status, retryAfterMs);
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const block = json.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block?.text) {
    throw new Error('Claude 服务响应中没有找到文本内容块（content[].type === "text"）');
  }
  return block.text;
}

export const claudeService: TranslateService = {
  info: {
    name: 'claude',
    displayName: 'Claude（Anthropic）',
    capabilities: { batch: true, jsonMode: false, stream: false, maxBatchSize: 60 },
    configSchema: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'string',
        required: true,
        secret: true,
        description: '在 https://console.anthropic.com/settings/keys 获取',
      },
      {
        key: 'model',
        label: '模型',
        type: 'string',
        required: false,
        secret: false,
        default: DEFAULT_MODEL,
        description: `留空则使用默认模型 ${DEFAULT_MODEL}`,
      },
      { key: 'temperature', label: '温度', type: 'number', default: 0.3, secret: false, required: false },
    ],
  },
  Language: DEFAULT_LANGUAGE_MAP,

  async translate(text, from, to, opts) {
    const config = opts.config as unknown as AnthropicConfig;
    const system = `你是一名翻译。把用户消息从${from}翻译为${to}，只输出译文本身，不要任何解释或额外内容。`;
    const content = await callMessages(config, system, text, opts);
    return content.trim();
  },

  async translateBatch(req, opts) {
    const config = opts.config as unknown as AnthropicConfig;
    const { system, user } = renderPrompt(req);
    return callMessages(config, system, user, opts);
  },

  async chat(system, user, opts) {
    const config = opts.config as unknown as AnthropicConfig;
    return callMessages(config, system, user, opts);
  },
};
