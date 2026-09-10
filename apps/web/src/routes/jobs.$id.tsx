import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useJobEvents } from '@/lib/sse';
import { RequireAuth } from '@/components/app/require-auth';
import { JobStatusBadge } from '@/components/app/job-status-badge';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { TextMorph } from '@/components/motion/text-morph';
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
  const confirm = useMutation({ mutationFn: () => api.jobs.confirm(jobId), onSuccess: invalidate });
  const confirmGlossary = useMutation({ mutationFn: () => api.jobs.confirmGlossary(jobId), onSuccess: invalidate });

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

      {job.status === 'awaiting_glossary' && (
        <Alert>
          <AlertTitle>有新术语待确认</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>去项目的术语表页检查候选译名，确认后任务会自动继续翻译。</span>
            <div className="flex gap-2">
              {job.projectId && (
                <Link to="/projects/$projectId" params={{ projectId: job.projectId }} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  查看术语表
                </Link>
              )}
              <Button size="sm" onClick={() => confirmGlossary.mutate()} disabled={confirmGlossary.isPending}>
                确认并继续
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {job.status === 'awaiting_review' && (
        <Alert>
          <AlertTitle>翻译完成，待校对</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>可以先去对照校对页检查/修改译文，确认完成后再下载。</span>
            <div className="flex gap-2">
              <Link to="/jobs/$jobId/review" params={{ jobId }} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                去校对
              </Link>
              <Button size="sm" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                确认完成
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
            <TextMorph>暂停</TextMorph>
          </Button>
        )}
        {job.status === 'paused' && (
          <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
            <TextMorph>继续</TextMorph>
          </Button>
        )}
        {running && (
          <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            取消
          </Button>
        )}
        {(job.status === 'failed' || job.progress.failedCues > 0) && (
          <Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
            重试失败条目
          </Button>
        )}
        {(job.status === 'done' || job.status === 'awaiting_review') && (
          <Link to="/jobs/$jobId/review" params={{ jobId }} className={buttonVariants({ variant: 'outline' })}>
            对照校对
          </Link>
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
