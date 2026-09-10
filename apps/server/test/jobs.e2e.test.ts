import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildMultipart, buildTestApp, SAMPLE_SRT, type TestApp } from './helpers.js';

/**
 * 端到端集成测试：登录 → 创建 mock 服务实例 → 上传 SRT → 等待任务完成 → 下载。
 * 对应 readme.md 第13章 M1 完成标志（用 mock 服务代替真实 docker compose + 浏览器手工操作）。
 */
async function loginAsNewAdmin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/init',
    payload: { username: 'admin', password: 'testpass123' },
  });
  expect(res.statusCode).toBe(201);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function createMockService(app: FastifyInstance, cookie: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/services',
    headers: { cookie, 'content-type': 'application/json' },
    payload: JSON.stringify({
      id: 'mock@test',
      serviceName: 'mock',
      displayName: 'Mock',
      config: {},
      rpm: 600,
      maxConcurrency: 5,
      enabled: true,
    }),
  });
  expect(res.statusCode).toBe(201);
}

async function waitForJobStatus(
  app: FastifyInstance,
  cookie: string,
  jobId: string,
  statuses: string[],
  timeoutMs = 5000,
): Promise<{ status: string; [k: string]: unknown }> {
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } });
    const body = res.json();
    if (statuses.includes(body.status)) return body;
    if (Date.now() - start > timeoutMs) throw new Error(`超时：任务状态为 ${body.status}，等待 ${statuses.join('/')}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('任务端到端流程（上传 → mock 翻译 → 下载）', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('上传 SRT 后任务最终完成，下载结果时间轴一致、跳过条目原样保留、翻译条目带 mock 前缀', async () => {
    const { app } = testApp;
    const cookie = await loginAsNewAdmin(app);
    await createMockService(app, cookie);

    const { body, contentType } = buildMultipart(
      { serviceInstanceId: 'mock@test', srcLang: 'ko', tgtLang: 'zh_cn' },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    expect(uploadRes.statusCode).toBe(201);
    const { jobId } = uploadRes.json();
    expect(jobId).toBeTruthy();

    const finalJob = await waitForJobStatus(app, cookie, jobId, ['done', 'failed']);
    expect(finalJob.status).toBe('done');
    expect(finalJob.progress.doneCues).toBe(2); // 第 3 条是纯音乐符号行，不计入可翻译总数
    expect(finalJob.progress.translatableCues).toBe(2);

    const downloadRes = await app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/download?mode=zh`,
      headers: { cookie },
    });
    expect(downloadRes.statusCode).toBe(200);
    const text = downloadRes.body;

    // 条目数不变，时间轴逐字符保留
    expect(text).toContain('00:00:01,000 --> 00:00:02,500');
    expect(text).toContain('00:00:03,000 --> 00:00:05,000');
    expect(text).toContain('00:00:06,000 --> 00:00:07,000');
    // 跳过的音乐符号行原样保留
    expect(text).toContain('♪ ~ ♪');
    // 翻译过的条目带有 mock 服务的默认前缀
    expect(text).toContain('【译】');
    // 不应残留未翻译的韩文（证明确实走过 mock 翻译，而不是原样透传）
    expect(text).not.toMatch(/어디|지금/);
  });

  it('未认证请求被拒绝（401）', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.statusCode).toBe(401);
  });

  it('上传非 srt 扩展名被拒绝', async () => {
    const { app } = testApp;
    const cookie = await loginAsNewAdmin(app);
    await createMockService(app, cookie);
    const { body, contentType } = buildMultipart(
      { serviceInstanceId: 'mock@test' },
      { fieldname: 'file', filename: 'movie.ass', content: 'not really ass' },
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });
});
