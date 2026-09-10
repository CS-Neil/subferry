import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers.js';

describe('认证（AUTH_MODE=single）', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('未初始化时 status.initialized 为 false，受保护路由返回 401', async () => {
    const { app } = testApp;
    const status = await app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(status.json().initialized).toBe(false);

    const jobsRes = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(jobsRes.statusCode).toBe(401);
  });

  it('初始化后不能重复初始化（409）', async () => {
    const { app } = testApp;
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/init',
      payload: { username: 'admin', password: 'testpass123' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/init',
      payload: { username: 'someone', password: 'anotherpass1' },
    });
    expect(second.statusCode).toBe(409);
  });

  it('登录成功后带 cookie 可以访问受保护路由；登出后不能', async () => {
    const { app } = testApp;
    await app.inject({
      method: 'POST',
      url: '/api/auth/init',
      payload: { username: 'admin', password: 'testpass123' },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'testpass123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const authed = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie } });
    expect(authed.statusCode).toBe(200);

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);
    const logoutCookie = logout.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const afterLogout = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie: logoutCookie } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('密码错误、用户名不存在时返回同样的通用错误信息，不泄露具体是哪一项错误', async () => {
    const { app } = testApp;
    await app.inject({
      method: 'POST',
      url: '/api/auth/init',
      payload: { username: 'admin', password: 'testpass123' },
    });
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    });
    const wrongUsername = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'wrong-password' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongUsername.statusCode).toBe(401);
    expect(wrongPassword.json().message).toBe(wrongUsername.json().message);
  });

  it('连续多次登录失败后触发限速（429）', async () => {
    const { app } = testApp;
    await app.inject({
      method: 'POST',
      url: '/api/auth/init',
      payload: { username: 'admin', password: 'testpass123' },
    });
    let last;
    for (let i = 0; i < 12; i++) {
      last = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'wrong' },
      });
    }
    expect(last!.statusCode).toBe(429);
  });
});

describe('认证（AUTH_MODE=none）', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp({ authMode: 'none' });
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('无需登录即可访问受保护路由', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.statusCode).toBe(200);
  });
});
