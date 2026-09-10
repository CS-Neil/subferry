import { useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useJobEvents } from '@/lib/sse';
import { RequireAuth } from '@/components/app/require-auth';
import { JobStatusBadge } from '@/components/app/job-status-badge';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

function JobDetailInner({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  useJobEvents(jobId);
  const { data: job, isLoading } = useQuery({ queryKey: ['job', jobId], queryFn: () => api.jobs.get(jobId) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['job', jobId] });
  const pause = useMutation({ mutationFn: () => api.jobs.pause(jobId), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => api.jobs.resume(jobId), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => api.jobs.cancel(jobId), onSuccess: invalidate });
  const retry = useMutation({ mutationFn: () => api.jobs.retryFailed(jobId), onSuccess: invalidate });

  if (isLoading || !job) return <p className="text-sm text-muted-foreground">加载中…</p>;

  const percent = job.progress.translatableCues > 0 ? (job.progress.doneCues / job.progress.translatableCues) * 100 : 0;
  const running = job.status === 'queued' || job.status === 'parsing' || job.status === 'translating';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{job.fileName}</h1>
          <p className="text-xs text-muted-foreground">
            {job.srcLang ?? '?'} → {job.tgtLang} · {job.encoding ?? '未知编码'}
          </p>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex items-center justify-between text-sm">
            <span>
              已完成 <AnimatedNumber value={job.progress.doneCues} /> / {job.progress.translatableCues} 条
              {job.progress.failedCues > 0 && (
                <span className="ml-2 text-destructive">（失败 {job.progress.failedCues} 条）</span>
              )}
            </span>
            <span className="text-muted-foreground">{Math.round(percent)}%</span>
          </div>
          <Progress value={percent} />
        </CardContent>
      </Card>

      {job.error && (
        <Alert variant="destructive">
          <AlertTitle>出错了</AlertTitle>
          <AlertDescription>{job.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {job.status === 'translating' && (
          <Button variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
            暂停
          </Button>
        )}
        {job.status === 'paused' && (
          <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
            继续
          </Button>
        )}
        {running && (
          <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            取消
          </Button>
        )}
        {(job.status === 'failed' || (job.status === 'done' && job.progress.failedCues > 0)) && (
          <Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
            重试失败条目
          </Button>
        )}
        {job.status === 'done' && (
          <a href={api.jobs.downloadUrl(jobId)} className={buttonVariants()}>
            下载译文
          </a>
        )}
      </div>
    </div>
  );
}

export function JobDetailPage() {
  const { jobId } = useParams({ from: '/jobs/$jobId' });
  return (
    <RequireAuth>
      <JobDetailInner jobId={jobId} />
    </RequireAuth>
  );
}
