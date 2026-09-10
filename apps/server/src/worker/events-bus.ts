import { EventEmitter } from 'node:events';
import type { JobEventPayload } from '@subferry/shared';

/**
 * 进程内事件总线（readme.md 7.1）：调度器每批完成后更新数据库，并通过这个事件总线推送进度事件；
 * routes/events.ts 的 SSE 接口把事件转发给订阅的浏览器。
 */
export class EventsBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200); // 多个浏览器标签同时订阅多个任务时避免误报"内存泄漏"警告
  }

  emitJobEvent(payload: JobEventPayload): void {
    this.emit('job-event', payload);
    this.emit(`job-event:${payload.jobId}`, payload);
  }

  onJobEvent(listener: (payload: JobEventPayload) => void): () => void {
    this.on('job-event', listener);
    return () => this.off('job-event', listener);
  }

  onJobEventFor(jobId: string, listener: (payload: JobEventPayload) => void): () => void {
    const key = `job-event:${jobId}`;
    this.on(key, listener);
    return () => this.off(key, listener);
  }
}
