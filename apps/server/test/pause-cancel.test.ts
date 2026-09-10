import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerService, mockService, type TranslateService } from '@subferry/core';
import { buildMultipart, buildTestApp, SAMPLE_SRT, type TestApp } from './helpers.js';

/**
 * 暂停/取消/恢复（readme.md 7.1）。用一个"慢速 mock"服务（在 mock 基础上人为加一点延迟，
 * 并遵守 AbortSignal）制造出"任务正在翻译中"的窗口，好在这个窗口内调用 pause/cancel，
 * 而不必依赖真实网络延迟。
 */
const SLOW_MOCK_NAME = 'slow-mock-for-pause-test';

beforeAll(() => {
  const slowMock: TranslateService = {
    ...mockService,
    info: { ...mockService.info, name: SLOW_MOCK_NAME },
    async translateBatch(req, opts) {
      await new Promise<void>((resolve, reject) => {
        if (opts.signal?.aborted) return reject(new Error('aborted'));
        const timer = setTimeout(resolve, 250);
        opts.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
      return mockService.translateBatch!(req, opts);
    },
  };
  registerService(slowMock);
});

async function loginAsNewAdmin(testApp: TestApp): Promise<string> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/auth/init',
    payload: { username: 'admin', password: 'testpass123' },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function uploadJob(testApp: TestApp, cookie: string, serviceInstanceId: string): Promise<string> {
  const { body, contentType } = buildMultipart(
    { serviceInstanceId, srcLang: 'ko', tgtLang: 'zh_cn', options: JSON.stringify({ skipReview: true }) },
    { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
  );
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/jobs',
    headers: { cookie, 'content-type': contentType },
    payload: body,
  });
  expect(res.statusCode).toBe(201);
  return res.json().jobId;
}

async function waitForStatus(testApp: TestApp, cookie: string, jobId: string, statuses: string[]): Promise<string> {
  const start = Date.now();
  for (;;) {
    const res = await testApp.app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } });
    const status = res.json().status as string;
    if (statuses.includes(status)) return status;
    if (Date.now() - start > 5000) throw new Error(`超时，当前状态 ${status}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('任务暂停 / 恢复 / 取消', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
    await testApp.app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        id: `${SLOW_MOCK_NAME}@1`,
        serviceName: SLOW_MOCK_NAME,
        displayName: 'Slow Mock',
        config: {},
        rpm: 600,
        maxConcurrency: 5,
        enabled: true,
      }),
    });
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('暂停后任务状态变为 paused；恢复后能继续完成', async () => {
    const jobId = await uploadJob(testApp, cookie, `${SLOW_MOCK_NAME}@1`);
    await waitForStatus(testApp, cookie, jobId, ['translating']);

    const pauseRes = await testApp.app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/pause`,
      headers: { cookie },
    });
    expect(pauseRes.statusCode).toBe(200);

    const paused = await waitForStatus(testApp, cookie, jobId, ['paused']);
    expect(paused).toBe('paused');

    const resumeRes = await testApp.app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/resume`,
      headers: { cookie },
    });
    expect(resumeRes.statusCode).toBe(200);

    const final = await waitForStatus(testApp, cookie, jobId, ['done', 'failed']);
    expect(final).toBe('done');
  });

  it('取消后任务状态变为 canceled，不会被调度器继续处理', async () => {
    const jobId = await uploadJob(testApp, cookie, `${SLOW_MOCK_NAME}@1`);
    await waitForStatus(testApp, cookie, jobId, ['translating']);

    const cancelRes = await testApp.app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/cancel`,
      headers: { cookie },
    });
    expect(cancelRes.statusCode).toBe(200);

    const canceled = await waitForStatus(testApp, cookie, jobId, ['canceled']);
    expect(canceled).toBe('canceled');

    // 等一会儿确认不会自己变成 done（调度器不应该再继续处理已取消的任务）
    await new Promise((r) => setTimeout(r, 300));
    const res = await testApp.app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } });
    expect(res.json().status).toBe('canceled');
  });

  it('优雅退出：shutdown 会等待或中断进行中的任务，不会挂起', async () => {
    const jobId = await uploadJob(testApp, cookie, `${SLOW_MOCK_NAME}@1`);
    await waitForStatus(testApp, cookie, jobId, ['translating']);
    await testApp.scheduler.shutdown(100); // 故意给一个比翻译耗时更短的超时，测试超时中断路径
    expect(testApp.scheduler.activeCount).toBe(0);
  });
});
