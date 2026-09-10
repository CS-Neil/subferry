import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { JobEventPayload, JobSummary } from '@subferry/shared';

/**
 * SSE 封装（readme.md 8.7）：收到事件后直接 setQueryData 更新缓存，不重新请求接口；
 * EventSource 断开会自动重连，重连后（onerror 触发）主动 invalidate 一次，补齐断线期间
 * 错过的状态。
 */
function applyPayload(queryClient: QueryClient, payload: JobEventPayload): void {
  queryClient.setQueryData<JobSummary>(['job', payload.jobId], (old) => {
    if (!old) return old;
    if (payload.type === 'status') {
      return { ...old, status: payload.status as JobSummary['status'], error: payload.error ?? old.error };
    }
    if (payload.type === 'progress') {
      return {
        ...old,
        progress: {
          ...old.progress,
          doneCues: payload.doneCues,
          translatableCues: payload.translatableCues,
          failedCues: payload.failedCues,
        },
      };
    }
    return old;
  });
  void queryClient.invalidateQueries({ queryKey: ['jobs'] });
}

export function useJobEvents(jobId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(`/api/jobs/${jobId}/events`, { withCredentials: true });

    source.onmessage = (ev) => {
      try {
        applyPayload(queryClient, JSON.parse(ev.data) as JobEventPayload);
      } catch {
        // 心跳注释等非 JSON 消息，忽略
      }
    };
    source.onerror = () => {
      void queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    };

    return () => source.close();
  }, [jobId, queryClient]);
}

/** 任务列表页订阅的汇总流：所有任务的事件都会推到这里。 */
export function useAllJobEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/events', { withCredentials: true });
    source.onmessage = (ev) => {
      try {
        applyPayload(queryClient, JSON.parse(ev.data) as JobEventPayload);
      } catch {
        // 心跳注释等非 JSON 消息，忽略
      }
    };
    source.onerror = () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    };
    return () => source.close();
  }, [queryClient]);
}
