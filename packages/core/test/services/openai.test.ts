import { describe, expect, it, vi } from 'vitest';
import { openaiService } from '../../src/services/openai/index.js';
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

describe('openaiService.translateBatch', () => {
  it('构造正确的请求体并返回原始响应字符串', async () => {
    const http = fakeHttp({ status: 200, body: { choices: [{ message: { content: '{"1":"你好"}' } }] } });
    const req: BatchRequest = {
      items: [{ id: 1, text: 'hello' }],
      contextBefore: [],
      contextAfter: [],
      from: '한국어',
      to: '中文',
    };
    const raw = await openaiService.translateBatch!(req, { config, http });
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
    await expect(openaiService.translateBatch!(req, { config, http })).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 2000,
    });
  });
});

describe('openaiService.translate（单条，测试连接用）', () => {
  it('关闭 jsonMode，返回 trim 后的译文', async () => {
    const http = fakeHttp({ status: 200, body: { choices: [{ message: { content: '  你好  ' } }] } });
    const result = await openaiService.translate('안녕', 'ko', 'zh', { config, http });
    expect(result).toBe('你好');
    const call = (http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.response_format).toBeUndefined();
  });
});
