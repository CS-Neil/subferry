import { describe, expect, it, vi } from 'vitest';
import { claudeService } from '../../src/services/anthropic/index.js';
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

describe('claudeService（真正的 Anthropic Messages API，与 OpenAI 协议不同）', () => {
  it('translateBatch：system 是顶层字段，认证用 x-api-key，响应从 content 块里取文本', async () => {
    const http = fakeHttp({ status: 200, body: { content: [{ type: 'text', text: '{"1":"你好"}' }] } });
    const req: BatchRequest = {
      items: [{ id: 1, text: '안녕' }],
      contextBefore: [],
      contextAfter: [],
      from: '한국어',
      to: '中文',
    };

    const raw = await claudeService.translateBatch!(req, { config: { apiKey: 'sk-ant-test' }, http });
    expect(raw).toBe('{"1":"你好"}');

    const call = (http.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(call[1].headers['x-api-key']).toBe('sk-ant-test');
    expect(call[1].headers['anthropic-version']).toBeTruthy();
    expect(call[1].headers.Authorization).toBeUndefined();
    const sentBody = JSON.parse(call[1].body);
    expect(typeof sentBody.system).toBe('string');
    expect(sentBody.messages).toEqual([{ role: 'user', content: expect.stringContaining('待翻译') }]);
  });

  it('未填写 model 时使用默认模型', async () => {
    const http = fakeHttp({ status: 200, body: { content: [{ type: 'text', text: '{"1":"你好"}' }] } });
    await claudeService.translateBatch!(
      { items: [{ id: 1, text: 'hi' }], contextBefore: [], contextAfter: [], from: 'en', to: 'zh' },
      { config: { apiKey: 'sk-ant-test' }, http },
    );
    const sentBody = JSON.parse((http.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sentBody.model).toBeTruthy();
  });

  it('非 2xx 响应抛出 ServiceHttpError', async () => {
    const http = fakeHttp({ status: 529, body: { error: 'overloaded' } });
    await expect(
      claudeService.translateBatch!(
        { items: [{ id: 1, text: 'hi' }], contextBefore: [], contextAfter: [], from: 'en', to: 'zh' },
        { config: { apiKey: 'sk-ant-test' }, http },
      ),
    ).rejects.toMatchObject({ status: 529 });
  });

  it('translate（单条）trim 结果，且不强制 JSON', async () => {
    const http = fakeHttp({ status: 200, body: { content: [{ type: 'text', text: '  你好  ' }] } });
    const result = await claudeService.translate('hi', 'en', 'zh', { config: { apiKey: 'sk-ant-test' }, http });
    expect(result).toBe('你好');
  });

  it('info.configSchema 只要求 apiKey 必填，不需要 baseURL', () => {
    const keys = claudeService.info.configSchema.map((f) => f.key);
    expect(keys).toContain('apiKey');
    expect(keys).not.toContain('baseURL');
    expect(claudeService.info.configSchema.find((f) => f.key === 'apiKey')?.required).toBe(true);
  });
});
