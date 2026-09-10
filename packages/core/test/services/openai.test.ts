import { describe, expect, it, vi } from 'vitest';
import { customOpenAIService } from '../../src/services/openai/index.js';
import { createOpenAICompatibleService, OPENAI_COMPATIBLE_PRESETS } from '../../src/services/presets.js';
import type { HttpClient } from '../../src/services/http-client.js';
import type { BatchRequest } from '../../src/services/types.js';

function fakeHttp(response: { status: number; body: unknown; headers?: Record<string, string> }): HttpClient {
  return {
    fetch: vi.fn(async () => {
      const headers = new Headers(response.headers ?? {});
      return new Response(JSON.stringify(response.body), { status: response.status, headers });
    }),
  };
}

const config = { baseURL: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' };

describe('customOpenAIService（通用自定义地址）.translateBatch', () => {
  it('构造正确的请求体并返回原始响应字符串，baseURL 来自用户配置', async () => {
    const http = fakeHttp({ status: 200, body: { choices: [{ message: { content: '{"1":"你好"}' } }] } });
    const req: BatchRequest = {
      items: [{ id: 1, text: 'hello' }],
      contextBefore: [],
      contextAfter: [],
      from: '한국어',
      to: '中文',
    };
    const raw = await customOpenAIService.translateBatch!(req, { config, http });
    expect(raw).toBe('{"1":"你好"}');

    const call = (http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.model).toBe('gpt-4o-mini');
    expect(sentBody.response_format).toEqual({ type: 'json_object' });
    expect(sentBody.messages[1].content).toContain('待翻译');
    expect(call[1].headers.Authorization).toBe('Bearer sk-test');
  });

  it('非 2xx 响应抛出 ServiceHttpError 并携带 status/retryAfter', async () => {
    const http = fakeHttp({ status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': '2' } });
    const req: BatchRequest = {
      items: [{ id: 1, text: 'hi' }],
      contextBefore: [],
      contextAfter: [],
      from: 'ko',
      to: 'zh',
    };
    await expect(customOpenAIService.translateBatch!(req, { config, http })).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 2000,
    });
  });
});

describe('customOpenAIService.translate（单条，测试连接用）', () => {
  it('关闭 jsonMode，返回 trim 后的译文', async () => {
    const http = fakeHttp({ status: 200, body: { choices: [{ message: { content: '  你好  ' } }] } });
    const result = await customOpenAIService.translate('안녕', 'ko', 'zh', { config, http });
    expect(result).toBe('你好');
    const call = (http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.response_format).toBeUndefined();
  });
});

describe('国内外主流大模型预设（createOpenAICompatibleService）', () => {
  it('每个预设都声明了 apiKey，且不要求用户填写 baseURL', () => {
    for (const preset of OPENAI_COMPATIBLE_PRESETS) {
      const service = createOpenAICompatibleService(preset);
      const keys = service.info.configSchema.map((f) => f.key);
      expect(keys).toContain('apiKey');
      expect(keys).not.toContain('baseURL');
    }
  });

  it('请求固定发往预设的 baseURL，忽略用户配置里意外传入的 baseURL', async () => {
    const preset = OPENAI_COMPATIBLE_PRESETS.find((p) => p.name === 'deepseek')!;
    const service = createOpenAICompatibleService(preset);
    const http = fakeHttp({ status: 200, body: { choices: [{ message: { content: '{"1":"你好"}' } }] } });

    await service.translateBatch!(
      { items: [{ id: 1, text: 'hi' }], contextBefore: [], contextAfter: [], from: 'ko', to: 'zh' },
      { config: { apiKey: 'sk-deepseek', baseURL: 'https://should-be-ignored.example.com' }, http },
    );

    const call = (http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.deepseek.com/v1/chat/completions');
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.model).toBe('deepseek-chat'); // 用户没填 model，回退到预设默认模型
  });

  it('用户填写了 model 时优先使用用户的值', async () => {
    const preset = OPENAI_COMPATIBLE_PRESETS.find((p) => p.name === 'qwen')!;
    const service = createOpenAICompatibleService(preset);
    const http = fakeHttp({ status: 200, body: { choices: [{ message: { content: '{"1":"你好"}' } }] } });

    await service.translateBatch!(
      { items: [{ id: 1, text: 'hi' }], contextBefore: [], contextAfter: [], from: 'ko', to: 'zh' },
      { config: { apiKey: 'sk-qwen', model: 'qwen-max' }, http },
    );
    const sentBody = JSON.parse((http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sentBody.model).toBe('qwen-max');
  });

  it('doubao 预设的 model 字段是必填的（没有通用默认接入点 ID）', () => {
    const preset = OPENAI_COMPATIBLE_PRESETS.find((p) => p.name === 'doubao')!;
    const service = createOpenAICompatibleService(preset);
    const modelField = service.info.configSchema.find((f) => f.key === 'model')!;
    expect(modelField.required).toBe(true);
  });
});
