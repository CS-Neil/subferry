import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type DB } from '../src/db/client.js';
import { buildApp, type AppInstance } from '../src/app.js';
import type { AppConfig, AuthMode } from '../src/config.js';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = mkdtempSync(join(tmpdir(), 'subferry-test-'));
  return {
    port: 0,
    dataDir,
    appSecret: 'test-secret-at-least-32-bytes-long-xxxxx',
    authMode: 'single' as AuthMode,
    adminPassword: undefined,
    baseUrl: undefined,
    maxActiveJobs: 2,
    logLevel: 'silent',
    tz: 'UTC',
    ...overrides,
  };
}

export interface TestApp extends AppInstance {
  db: DB;
  config: AppConfig;
}

export async function buildTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config = testConfig(overrides);
  const { db } = openDb({ file: ':memory:' });
  const instance = await buildApp({ db, config, logger: false, publicDir: '/nonexistent-public-dir' });
  return { ...instance, db, config };
}

/** 构造一个最小的 multipart/form-data 请求体，供 fastify.inject 测试文件上传接口使用。 */
export function buildMultipart(
  fields: Record<string, string>,
  file: { fieldname: string; filename: string; content: string; contentType?: string },
): { body: Buffer; contentType: string } {
  const boundary = `----subferry-test-${Math.random().toString(16).slice(2)}`;
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType ?? 'text/plain'}\r\n\r\n${file.content}\r\n`,
  );
  parts.push(`--${boundary}--\r\n`);
  return { body: Buffer.from(parts.join(''), 'utf8'), contentType: `multipart/form-data; boundary=${boundary}` };
}

export const SAMPLE_SRT = [
  '1',
  '00:00:01,000 --> 00:00:02,500',
  '어디 가?',
  '',
  '2',
  '00:00:03,000 --> 00:00:05,000',
  '지금 집에 가고 있어요',
  '',
  '3',
  '00:00:06,000 --> 00:00:07,000',
  '♪ ~ ♪',
  '',
].join('\n');

export async function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 20): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
