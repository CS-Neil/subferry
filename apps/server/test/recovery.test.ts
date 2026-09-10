import { describe, expect, it } from 'vitest';
import { JobOptions } from '@subferry/shared';
import { buildTestApp } from './helpers.js';
import { serviceInstances, jobs, cues } from '../src/db/schema.js';
import { recoverInterruptedJobs } from '../src/worker/recovery.js';
import { getJobRow } from '../src/db/jobs-repo.js';
import { listCuesForJob } from '../src/db/cues-repo.js';

/**
 * 模拟"服务中途重启"（readme.md 12章"服务端集成测试"）：不需要真的重启进程，
 * 直接构造出"重启前"的数据库状态（一个卡在 translating 的任务，部分条目已完成、
 * 部分还是 pending），验证 recoverInterruptedJobs + 调度器能让任务从断点继续，
 * 且已完成的条目不会被重新请求（不重复计费）。
 */
describe('启动恢复：从断点继续，不重复翻译已完成条目', () => {
  it('恢复后只重新处理未完成的条目', async () => {
    const testApp = await buildTestApp();
    const { db, scheduler, app } = testApp;
    const now = new Date().toISOString();

    db.insert(serviceInstances)
      .values({
        id: 'mock@recovery',
        serviceName: 'mock',
        displayName: 'Mock',
        configJson: '{}',
        secretEnc: null,
        rpm: 600,
        maxConcurrency: 5,
        enabled: true,
        createdAt: now,
      })
      .run();

    const jobId = 'job-recovery-1';
    db.insert(jobs)
      .values({
        id: jobId,
        fileName: 'x.srt',
        format: 'srt',
        encoding: 'UTF-8',
        eol: '\n',
        srcLang: 'ko',
        tgtLang: 'zh_cn',
        status: 'translating', // 模拟服务重启前卡在这个状态
        progressDone: 1,
        progressTotal: 2,
        progressFailed: 0,
        origin: 'web',
        serviceInstanceId: 'mock@recovery',
        optionsJson: JSON.stringify(JobOptions.parse({ skipReview: true })),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const alreadyDoneTarget = '【已完成】不应被重新翻译';
    db.insert(cues)
      .values([
        {
          jobId,
          idx: 1,
          rawTime: '00:00:01,000 --> 00:00:02,000',
          startMs: 1000,
          endMs: 2000,
          metaJson: '{}',
          leadingTags: '',
          source: '안녕',
          placeholdersJson: '[]',
          target: alreadyDoneTarget,
          status: 'done',
          flagsJson: '[]',
        },
        {
          jobId,
          idx: 2,
          rawTime: '00:00:03,000 --> 00:00:04,000',
          startMs: 3000,
          endMs: 4000,
          metaJson: '{}',
          leadingTags: '',
          source: '잘가',
          placeholdersJson: '[]',
          target: null,
          status: 'pending',
          flagsJson: '[]',
        },
      ])
      .run();

    const recoveredCount = recoverInterruptedJobs(db);
    expect(recoveredCount).toBe(1);
    expect(getJobRow(db, jobId)?.status).toBe('queued');

    scheduler.poke();

    const start = Date.now();
    while (getJobRow(db, jobId)?.status !== 'done') {
      if (Date.now() - start > 5000) throw new Error('恢复后的任务未能在超时内完成');
      await new Promise((r) => setTimeout(r, 20));
    }

    const finalCues = listCuesForJob(db, jobId);
    const cue1 = finalCues.find((c) => c.idx === 1)!;
    const cue2 = finalCues.find((c) => c.idx === 2)!;

    // 已完成的条目原样保留，没有被重新请求
    expect(cue1.target).toBe(alreadyDoneTarget);
    // 之前 pending 的条目现在被翻译完成
    expect(cue2.status).toBe('done');
    expect(cue2.target).toContain('【译】');

    await app.close();
  });
});
