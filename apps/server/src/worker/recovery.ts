import type { DB } from '../db/client.js';
import { listJobRowsByStatus, setJobStatus } from '../db/jobs-repo.js';

/**
 * 启动恢复（readme.md 7.1）：把所有处于 translating 状态的任务重新排队。
 *
 * 实现说明：M1 不在批次粒度做断点记录——job-runner.ts 每次运行都会跳过已经是
 * 'done' 状态的条目、重新处理其余条目（见该文件顶部注释），所以恢复动作只需要把
 * job 状态改回 queued，调度器接管后会自然地"从断点继续"，不需要额外重置 cues/batches 表。
 */
export function recoverInterruptedJobs(db: DB): number {
  const interrupted = listJobRowsByStatus(db, 'translating');
  for (const job of interrupted) {
    setJobStatus(db, job.id, 'queued');
  }
  return interrupted.length;
}
