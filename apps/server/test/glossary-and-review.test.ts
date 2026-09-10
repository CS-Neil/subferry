import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMultipart, buildTestApp, SAMPLE_SRT, type TestApp } from './helpers.js';

async function loginAsNewAdmin(testApp: TestApp): Promise<string> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/auth/init',
    payload: { username: 'admin', password: 'testpass123' },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function createMockService(testApp: TestApp, cookie: string, id: string, config: Record<string, unknown> = {}) {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/services',
    headers: { cookie, 'content-type': 'application/json' },
    payload: JSON.stringify({ id, serviceName: 'mock', displayName: 'Mock', config, rpm: 600, maxConcurrency: 5, enabled: true }),
  });
  expect(res.statusCode).toBe(201);
}

async function createProject(testApp: TestApp, cookie: string, name = '测试项目'): Promise<string> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { cookie, 'content-type': 'application/json' },
    payload: JSON.stringify({ name }),
  });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function waitForStatus(testApp: TestApp, cookie: string, jobId: string, statuses: string[], timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const res = await testApp.app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } });
    const status = res.json().status as string;
    if (statuses.includes(status)) return status;
    if (Date.now() - start > timeoutMs) throw new Error(`超时，当前状态 ${status}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('待校对（awaiting_review）→ 确认完成', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
    await createMockService(testApp, cookie, 'mock@review');
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('默认（skipReview=false）翻译完成后停在 awaiting_review，确认后才变成 done', async () => {
    const { body, contentType } = buildMultipart(
      { serviceInstanceId: 'mock@review', srcLang: 'ko' },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    const { jobId } = upload.json();

    await waitForStatus(testApp, cookie, jobId, ['awaiting_review']);

    // 校对页编辑一条译文
    await testApp.app.inject({
      method: 'PATCH',
      url: `/api/jobs/${jobId}/cues/1`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ target: '手工校对后的译文' }),
    });

    const confirm = await testApp.app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/confirm`,
      headers: { cookie },
    });
    expect(confirm.statusCode).toBe(200);

    const final = await waitForStatus(testApp, cookie, jobId, ['done']);
    expect(final).toBe('done');

    const download = await testApp.app.inject({ method: 'GET', url: `/api/jobs/${jobId}/download`, headers: { cookie } });
    expect(download.body).toContain('手工校对后的译文'); // 确认完成时重新生成，体现了校对页的编辑
  });

  it('skipReview=true 时翻译完成直接进入 done，不经过 awaiting_review', async () => {
    const { body, contentType } = buildMultipart(
      { serviceInstanceId: 'mock@review', srcLang: 'ko', options: JSON.stringify({ skipReview: true }) },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    const { jobId } = upload.json();
    const final = await waitForStatus(testApp, cookie, jobId, ['done', 'failed']);
    expect(final).toBe('done');
  });
});

describe('术语表自动提取与确认', () => {
  let testApp: TestApp;
  let cookie: string;
  let projectId: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
    projectId = await createProject(testApp, cookie);
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('提取到新术语时任务停在 awaiting_glossary，确认后术语表被写入并继续翻译', async () => {
    await createMockService(testApp, cookie, 'mock@glossary', {
      mockGlossaryResponse: [{ source: '민수', target: '敏秀', type: 'person', note: '男主角' }],
    });

    const { body, contentType } = buildMultipart(
      { serviceInstanceId: 'mock@glossary', projectId, srcLang: 'ko', options: JSON.stringify({ skipReview: true }) },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    const { jobId } = upload.json();

    await waitForStatus(testApp, cookie, jobId, ['awaiting_glossary']);

    const glossaryBefore = await testApp.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/glossary`,
      headers: { cookie },
    });
    expect(glossaryBefore.json()).toEqual([
      expect.objectContaining({ source: '민수', target: '敏秀', confirmed: false }),
    ]);

    const confirm = await testApp.app.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/glossary/confirm`,
      headers: { cookie },
    });
    expect(confirm.statusCode).toBe(200);

    const glossaryAfter = await testApp.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/glossary`,
      headers: { cookie },
    });
    expect(glossaryAfter.json()[0].confirmed).toBe(true);

    const final = await waitForStatus(testApp, cookie, jobId, ['done', 'failed']);
    expect(final).toBe('done');
  });

  it('glossaryAutoConfirm=true 时跳过人工确认，直接进入翻译', async () => {
    await createMockService(testApp, cookie, 'mock@autoconfirm', {
      mockGlossaryResponse: [{ source: 'x', target: 'y', type: 'other' }],
    });
    const { body, contentType } = buildMultipart(
      {
        serviceInstanceId: 'mock@autoconfirm',
        projectId,
        srcLang: 'ko',
        options: JSON.stringify({ skipReview: true, glossaryAutoConfirm: true }),
      },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    const { jobId } = upload.json();
    const final = await waitForStatus(testApp, cookie, jobId, ['done', 'failed']);
    expect(final).toBe('done');
  });

  it('没有新术语时直接跳过 awaiting_glossary', async () => {
    await createMockService(testApp, cookie, 'mock@noterm', { mockGlossaryResponse: [] });
    const { body, contentType } = buildMultipart(
      { serviceInstanceId: 'mock@noterm', projectId, srcLang: 'ko', options: JSON.stringify({ skipReview: true }) },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    const { jobId } = upload.json();
    const final = await waitForStatus(testApp, cookie, jobId, ['done', 'failed']);
    expect(final).toBe('done');
  });
});
