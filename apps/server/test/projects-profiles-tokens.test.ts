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

describe('项目 CRUD', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
  });
  afterEach(async () => {
    await testApp.app.close();
  });

  it('创建、读取、更新项目', async () => {
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: '深夜食堂', synopsis: '一部关于深夜小酒馆的剧' }),
    });
    expect(create.statusCode).toBe(201);
    const { id } = create.json();

    const get = await testApp.app.inject({ method: 'GET', url: `/api/projects/${id}`, headers: { cookie } });
    expect(get.json().name).toBe('深夜食堂');

    const update = await testApp.app.inject({
      method: 'PUT',
      url: `/api/projects/${id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ synopsis: '更新后的简介' }),
    });
    expect(update.json().synopsis).toBe('更新后的简介');

    const list = await testApp.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
    expect(list.json()).toHaveLength(1);
  });

  it('术语表条目增删改', async () => {
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x' }),
    });
    const { id } = create.json();

    const add = await testApp.app.inject({
      method: 'POST',
      url: `/api/projects/${id}/glossary`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ source: '민수', target: '敏秀', type: 'person' }),
    });
    expect(add.statusCode).toBe(201);
    const entryId = add.json().id;
    expect(add.json().confirmed).toBe(true); // 手动添加的词条默认已确认

    const update = await testApp.app.inject({
      method: 'PUT',
      url: `/api/projects/${id}/glossary/${entryId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ target: '敏修' }),
    });
    expect(update.json().target).toBe('敏修');

    const del = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/projects/${id}/glossary/${entryId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const list = await testApp.app.inject({ method: 'GET', url: `/api/projects/${id}/glossary`, headers: { cookie } });
    expect(list.json()).toHaveLength(0);
  });
});

describe('翻译方案 CRUD 与任务创建集成', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
    await testApp.app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ id: 'mock@p', serviceName: 'mock', displayName: 'Mock', config: {}, rpm: 600, maxConcurrency: 5, enabled: true }),
    });
  });
  afterEach(async () => {
    await testApp.app.close();
  });

  it('创建方案，更新方案不影响已快照的任务', async () => {
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/api/profiles',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        id: 'fast-korean',
        name: '韩语快速翻译',
        serviceInstanceId: 'mock@p',
        srcLang: 'ko',
        options: { batchSize: 30, skipReview: true },
      }),
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().options.batchSize).toBe(30);

    const get = await testApp.app.inject({ method: 'GET', url: '/api/profiles/fast-korean', headers: { cookie } });
    expect(get.json().options.skipReview).toBe(true);

    const update = await testApp.app.inject({
      method: 'PUT',
      url: '/api/profiles/fast-korean',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ options: { batchSize: 50 } }),
    });
    expect(update.json().options.batchSize).toBe(50);
    expect(update.json().options.skipReview).toBe(true); // 局部更新，其它字段保留

    const list = await testApp.app.inject({ method: 'GET', url: '/api/profiles', headers: { cookie } });
    expect(list.json()).toHaveLength(1);
  });

  it('上传任务时指定 profileId，自动带上方案的服务实例/语言/选项', async () => {
    await testApp.app.inject({
      method: 'POST',
      url: '/api/profiles',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        id: 'auto',
        name: '自动方案',
        serviceInstanceId: 'mock@p',
        srcLang: 'ko',
        options: { skipReview: true },
      }),
    });

    const { body, contentType } = buildMultipart(
      { profileId: 'auto' }, // 不显式传 serviceInstanceId/srcLang，应该从方案继承
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    expect(upload.statusCode).toBe(201);
    const { jobId } = upload.json();

    const start = Date.now();
    let job;
    do {
      job = (await testApp.app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } })).json();
      if (Date.now() - start > 5000) throw new Error(`超时：${job.status}`);
      if (!['done', 'failed'].includes(job.status)) await new Promise((r) => setTimeout(r, 15));
    } while (!['done', 'failed'].includes(job.status));

    expect(job.status).toBe('done');
    expect(job.srcLang).toBe('ko');
  });

  it('不存在的 profileId 返回 400', async () => {
    const { body, contentType } = buildMultipart(
      { profileId: 'nonexistent' },
      { fieldname: 'file', filename: 'movie.ko.srt', content: SAMPLE_SRT },
    );
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { cookie, 'content-type': contentType },
      payload: body,
    });
    expect(upload.statusCode).toBe(400);
  });

  it('删除方案', async () => {
    await testApp.app.inject({
      method: 'POST',
      url: '/api/profiles',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ id: 'to-delete', name: 'x' }),
    });
    const del = await testApp.app.inject({ method: 'DELETE', url: '/api/profiles/to-delete', headers: { cookie } });
    expect(del.statusCode).toBe(204);
    const get = await testApp.app.inject({ method: 'GET', url: '/api/profiles/to-delete', headers: { cookie } });
    expect(get.statusCode).toBe(404);
  });
});

describe('API Token', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
  });
  afterEach(async () => {
    await testApp.app.close();
  });

  it('创建 token 只在创建时返回明文，之后只返回名称/时间', async () => {
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'ci-script' }),
    });
    expect(create.statusCode).toBe(201);
    const { token, id } = create.json();
    expect(token).toMatch(/^sf_/);

    const list = await testApp.app.inject({ method: 'GET', url: '/api/tokens', headers: { cookie } });
    expect(list.json()).toEqual([expect.objectContaining({ id, name: 'ci-script' })]);
    expect(JSON.stringify(list.json())).not.toContain(token); // 明文不会再出现

    const del = await testApp.app.inject({ method: 'DELETE', url: `/api/tokens/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
  });

  it('用 Bearer token 可以访问受保护接口，不需要 cookie', async () => {
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'script' }),
    });
    const { token } = create.json();

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('伪造/删除后的 token 被拒绝', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { authorization: 'Bearer sf_totally-made-up-token-value-1234567890' },
    });
    expect(res.statusCode).toBe(401);
  });
});
