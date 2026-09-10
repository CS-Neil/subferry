import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { JobStatusBadge } from '@/components/app/job-status-badge';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { useAllJobEvents } from '@/lib/sse';

function JobsListInner() {
  useAllJobEvents();
  const { data: jobs, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">任务列表</h1>
        <Link to="/jobs/new" className={buttonVariants()}>
          新建任务
        </Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && jobs?.length === 0 && (
        <p className="text-sm text-muted-foreground">还没有任务，点击"新建任务"上传字幕文件开始。</p>
      )}

      <div className="flex flex-col gap-3">
        {jobs?.map((job) => (
          <Link key={job.id} to="/jobs/$jobId" params={{ jobId: job.id }}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{job.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {job.srcLang ?? '?'} → {job.tgtLang} · {new Date(job.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    <AnimatedNumber value={job.progress.doneCues} />/{job.progress.translatableCues}
                  </span>
                  <JobStatusBadge status={job.status} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function JobsListPage() {
  return (
    <RequireAuth>
      <JobsListInner />
    </RequireAuth>
  );
}
