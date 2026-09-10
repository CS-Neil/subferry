import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { JobStatusBadge } from '@/components/app/job-status-badge';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { SlidingNumber } from '@/components/motion/sliding-number';
import { BorderTrail } from '@/components/motion/border-trail';
import { AnimatedGroup, AnimatedGroupItem } from '@/components/motion/animated-group';
import { TextEffect } from '@/components/motion/text-effect';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { useAllJobEvents } from '@/lib/sse';

const RUNNING = new Set(['queued', 'parsing', 'translating']);
const NEEDS_ATTENTION = new Set(['awaiting_glossary', 'awaiting_review']);

function JobsListInner() {
  useAllJobEvents();
  const { data: jobs, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });

  const stats = useMemo(() => {
    const list = jobs ?? [];
    return {
      running: list.filter((j) => RUNNING.has(j.status)).length,
      needsAttention: list.filter((j) => NEEDS_ATTENTION.has(j.status)).length,
      done: list.filter((j) => j.status === 'done').length,
    };
  }, [jobs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">任务列表</h1>
        <Link to="/jobs/new" className={buttonVariants()}>
          新建任务
        </Link>
      </div>

      {jobs && jobs.length > 0 && (
        <div className="flex gap-6 text-sm text-muted-foreground">
          <span>
            运行中 <SlidingNumber value={stats.running} className="font-medium text-foreground" />
          </span>
          <span>
            待处理 <SlidingNumber value={stats.needsAttention} className="font-medium text-foreground" />
          </span>
          <span>
            已完成 <SlidingNumber value={stats.done} className="font-medium text-foreground" />
          </span>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && jobs?.length === 0 && (
        <TextEffect className="text-sm text-muted-foreground">还没有任务，拖入字幕文件开始。</TextEffect>
      )}

      <AnimatedGroup className="flex flex-col gap-3">
        {jobs?.map((job) => (
          <AnimatedGroupItem key={job.id}>
            <Link to="/jobs/$jobId" params={{ jobId: job.id }}>
              <Card className="relative overflow-hidden transition-colors hover:border-primary/50">
                {RUNNING.has(job.status) && <BorderTrail />}
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
          </AnimatedGroupItem>
        ))}
      </AnimatedGroup>
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
