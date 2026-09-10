import type { DB } from '../db/client.js';
import type { AppConfig } from '../config.js';
import { nextQueuedJobRow, setJobStatus } from '../db/jobs-repo.js';
import type { EventsBus } from './events-bus.js';
import { runJob } from './job-runner.js';

interface ActiveEntry {
  controller: AbortController;
  desiredStatus?: 'paused' | 'canceled';
  promise: Promise<void>;
}

/**
 * 任务调度器（readme.md 7.1）：FIFO 取出 queued 任务，同时执行的任务数上限由
 * MAX_ACTIVE_JOBS 控制。暂停/取消通过 AbortController 中断；job-runner 在检测到
 * 中断时不会写最终状态，由这里根据"是暂停还是取消"补写。
 */
export class Scheduler {
  private active = new Map<string, ActiveEntry>();

  constructor(
    private db: DB,
    private config: AppConfig,
    private bus: EventsBus,
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  isActive(jobId: string): boolean {
    return this.active.has(jobId);
  }

  /** 触发一次调度检查（新任务入队、任务恢复排队后调用）。 */
  poke(): void {
    void this.tick();
  }

  private tick(): void {
    while (this.active.size < this.config.maxActiveJobs) {
      const next = nextQueuedJobRow(this.db);
      if (!next) return;
      this.start(next.id);
    }
  }

  private start(jobId: string): void {
    const controller = new AbortController();
    const entry: ActiveEntry = { controller, promise: Promise.resolve() };

    entry.promise = runJob({ db: this.db, config: this.config, bus: this.bus }, jobId, controller.signal)
      .catch((err) => {
        setJobStatus(this.db, jobId, 'failed', {
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date().toISOString(),
        });
      })
      .then(() => {
        if (entry.desiredStatus) {
          setJobStatus(this.db, jobId, entry.desiredStatus, { finishedAt: new Date().toISOString() });
          this.bus.emitJobEvent({ type: 'status', jobId, status: entry.desiredStatus });
        }
      })
      .finally(() => {
        this.active.delete(jobId);
        this.tick();
      });

    this.active.set(jobId, entry);
  }

  pause(jobId: string): boolean {
    const entry = this.active.get(jobId);
    if (!entry) return false;
    entry.desiredStatus = 'paused';
    entry.controller.abort();
    return true;
  }

  cancel(jobId: string): boolean {
    const entry = this.active.get(jobId);
    if (!entry) return false;
    entry.desiredStatus = 'canceled';
    entry.controller.abort();
    return true;
  }

  /** 优雅退出（readme.md 7.1）：停止接收新批次、等待进行中请求最多 timeoutMs，超时后中断。 */
  async shutdown(timeoutMs: number): Promise<void> {
    const pending = [...this.active.values()].map((e) => e.promise);
    if (pending.length === 0) return;

    let timedOut = false;
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);
    });
    await Promise.race([Promise.allSettled(pending), timeout]);

    if (timedOut) {
      for (const entry of this.active.values()) entry.controller.abort();
      await Promise.allSettled(pending);
    }
  }
}
