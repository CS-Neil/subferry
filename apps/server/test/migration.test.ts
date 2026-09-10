import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/client.js';

/**
 * 验证 M1 建的旧库（jobs 表没有 header/profile_id 列，service_instances 没有 proxy_url 列）
 * 升级到 M2 代码后能自动补列，不需要用户手动迁移（readme.md 10.6）。
 */
describe('数据库升级：给已有安装补充 M2 新增的列', () => {
  it('旧结构的 jobs/service_instances 表打开后自动补上新列，且不丢已有数据', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subferry-migration-test-'));
    const file = join(dir, 'subferry.db');

    // 模拟 M1 时期的旧表结构（没有 header/profile_id/proxy_url）
    const legacy = new Database(file);
    legacy.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        file_name TEXT NOT NULL,
        format TEXT NOT NULL,
        encoding TEXT,
        eol TEXT,
        src_lang TEXT,
        tgt_lang TEXT NOT NULL DEFAULT 'zh_cn',
        status TEXT NOT NULL,
        progress_done INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        progress_failed INTEGER NOT NULL DEFAULT 0,
        origin TEXT NOT NULL DEFAULT 'web',
        source_path TEXT,
        output_path TEXT,
        service_instance_id TEXT,
        options_json TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );
      CREATE TABLE service_instances (
        id TEXT PRIMARY KEY,
        service_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        secret_enc TEXT,
        rpm INTEGER NOT NULL DEFAULT 60,
        max_concurrency INTEGER NOT NULL DEFAULT 3,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO jobs (id, file_name, format, status, options_json, created_at, updated_at)
         VALUES ('job-legacy', 'x.srt', 'srt', 'done', '{}', 'now', 'now')`,
      )
      .run();
    legacy
      .prepare(
        `INSERT INTO service_instances (id, service_name, display_name, config_json, created_at)
         VALUES ('mock@legacy', 'mock', 'Mock', '{}', 'now')`,
      )
      .run();
    legacy.close();

    // 用新代码打开这个旧库：不应该抛异常，且新列存在、旧数据还在
    const { sqlite } = openDb({ file });
    const jobColumns = (sqlite.pragma('table_info(jobs)') as { name: string }[]).map((c) => c.name);
    expect(jobColumns).toContain('header');
    expect(jobColumns).toContain('profile_id');

    const svcColumns = (sqlite.pragma('table_info(service_instances)') as { name: string }[]).map((c) => c.name);
    expect(svcColumns).toContain('proxy_url');

    const job = sqlite.prepare('SELECT * FROM jobs WHERE id = ?').get('job-legacy') as { header: string; file_name: string };
    expect(job.file_name).toBe('x.srt'); // 旧数据没丢
    expect(job.header).toBe(''); // 新列用上了默认值

    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('新库（已经有新列）重复打开是幂等的，不会报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subferry-migration-test-'));
    const file = join(dir, 'subferry.db');
    const first = openDb({ file });
    first.sqlite.close();
    expect(() => openDb({ file }).sqlite.close()).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});
