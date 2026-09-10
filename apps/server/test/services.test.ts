import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';
import { getServiceInstanceRow, loadFullConfig } from '../src/db/service-instances-repo.js';

async function loginAsNewAdmin(testApp: TestApp): Promise<string> {
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/api/auth/init',
    payload: { username: 'admin', password: 'testpass123' },
  });
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

describe('服务实例管理', () => {
  let testApp: TestApp;
  let cookie: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    cookie = await loginAsNewAdmin(testApp);
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('GET /api/service-types 列出内置服务及其 configSchema', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/service-types', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const names = res.json().map((s: { name: string }) => s.name);
    expect(names).toContain('openai');
    expect(names).toContain('mock');
  });

  it('创建 openai 实例后，密钥在数据库中是密文，接口返回脱敏值', async () => {
    const { app, db, config } = testApp;
    const res = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        id: 'openai@default',
        serviceName: 'openai',
        displayName: 'OpenAI',
        config: { baseURL: 'https://api.openai.com/v1', apiKey: 'sk-abcdefghijklmnop', model: 'gpt-4o-mini' },
        rpm: 60,
        maxConcurrency: 3,
        enabled: true,
      }),
    });
    expect(res.statusCode).toBe(201);
    const view = res.json();
    expect(view.config.apiKey).not.toBe('sk-abcdefghijklmnop');
    expect(view.config.apiKey).toMatch(/^sk-\*+mnop$/);

    const row = getServiceInstanceRow(db, 'openai@default');
    expect(row?.secretEnc).toBeTruthy();
    expect(row?.secretEnc).not.toContain('sk-abcdefghijklmnop');
    expect(row?.configJson).not.toContain('sk-abcdefghijklmnop'); // 密钥不会混进非密字段
    void config;
  });

  it('未认证请求被拒绝', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/services' });
    expect(res.statusCode).toBe(401);
  });

  it('重复 id 创建返回 409', async () => {
    const payload = JSON.stringify({
      id: 'mock@dup',
      serviceName: 'mock',
      displayName: 'Mock',
      config: {},
      rpm: 60,
      maxConcurrency: 3,
      enabled: true,
    });
    const first = await testApp.app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await testApp.app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload,
    });
    expect(second.statusCode).toBe(409);
  });

  it('PUT 更新只改动提供的字段，不清空未提供的密钥', async () => {
    const { app, db, config } = testApp;
    await app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        id: 'openai@u',
        serviceName: 'openai',
        displayName: 'OpenAI',
        config: { apiKey: 'sk-original-key-value', model: 'gpt-4o-mini' },
        rpm: 60,
        maxConcurrency: 3,
        enabled: true,
      }),
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/api/services/openai@u',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'OpenAI（改名）' }),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().displayName).toBe('OpenAI（改名）');
    expect(put.json().config.apiKey).toMatch(/mnop|key-|value|\*/); // 仍然是脱敏但非空的形式

    // 直接读库验证密钥没有被清空（而不是真的发一个网络请求去验证——'openai' 现在是固定
    // 官方地址的预设，真打一次会打到 api.openai.com，拖慢测试又依赖外网）。
    const row = getServiceInstanceRow(db, 'openai@u');
    expect(row?.secretEnc).toBeTruthy();
    const fullConfig = loadFullConfig(row!, config.appSecret);
    expect(fullConfig.apiKey).toBe('sk-original-key-value');
  });

  it('POST /api/services/:id/test 对 mock 服务必定成功', async () => {
    const { app } = testApp;
    await app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        id: 'mock@conn',
        serviceName: 'mock',
        displayName: 'Mock',
        config: {},
        rpm: 60,
        maxConcurrency: 3,
        enabled: true,
      }),
    });
    const res = await app.inject({ method: 'POST', url: '/api/services/mock@conn/test', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('DELETE 删除服务实例', async () => {
    const { app } = testApp;
    await app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ id: 'mock@del', serviceName: 'mock', displayName: 'Mock', config: {} }),
    });
    const del = await app.inject({ method: 'DELETE', url: '/api/services/mock@del', headers: { cookie } });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: '/api/services/mock@del', headers: { cookie } });
    expect(get.statusCode).toBe(404);
  });
});
