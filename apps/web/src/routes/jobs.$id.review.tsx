import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Cue, CueFlag } from '@subferry/shared';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedBackground } from '@/components/motion/animated-background';
import { ScrollProgress } from '@/components/motion/scroll-progress';
import { ToolbarExpandable } from '@/components/motion/toolbar-expandable';

const PAGE_SIZE = 500;

/** 一次性把整份 cues 拉全（校对页需要总数来算虚拟列表高度，不做增量无限滚动）。 */
function useAllCues(jobId: string) {
  return useQuery({
    queryKey: ['cues', jobId],
    queryFn: async () => {
      const first = await api.jobs.cues(jobId, { offset: 0, limit: PAGE_SIZE });
      const all = [...first.items];
      let offset = PAGE_SIZE;
      while (all.length < first.total) {
        const page = await api.jobs.cues(jobId, { offset, limit: PAGE_SIZE });
        all.push(...page.items);
        offset += PAGE_SIZE;
        if (page.items.length === 0) break;
      }
      return all;
    },
  });
}

const FLAG_LABEL: Record<CueFlag, string> = {
  'bad-placeholder': '占位符异常',
  'length-mismatch': '长度异常',
  refused: '拒答',
  'cps-exceeded': '阅读过快',
  failed: '失败',
};

const STATUS_COLOR: Record<Cue['status'], string> = {
  pending: 'text-muted-foreground',
  done: 'text-foreground',
  failed: 'text-destructive',
  edited: 'text-primary',
  skipped: 'text-muted-foreground',
};

type Filter = 'all' | 'flagged' | 'failed' | 'edited';

function CueTargetCell({ jobId, cue }: { jobId: string; cue: Cue }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(cue.target ?? cue.source);
  const save = useMutation({
    mutationFn: (next: string) => api.jobs.updateCue(jobId, cue.id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cues', jobId] }),
  });

  return (
    <textarea
      className="w-full resize-none rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-ring focus:outline-none"
      rows={Math.max(1, value.split('\n').length)}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (cue.target ?? cue.source)) save.mutate(value);
      }}
    />
  );
}

function ReviewInner({ jobId }: { jobId: string }) {
  const { data: cues, isLoading } = useAllCues(jobId);
  const { data: job } = useQuery({ queryKey: ['job', jobId], queryFn: () => api.jobs.get(jobId) });
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!cues) return [];
    switch (filter) {
      case 'flagged':
        return cues.filter((c) => c.flags.length > 0);
      case 'failed':
        return cues.filter((c) => c.status === 'failed');
      case 'edited':
        return cues.filter((c) => c.status === 'edited');
      default:
        return cues;
    }
  }, [cues, filter]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  const retranslateSelected = useMutation({
    mutationFn: async () => {
      await Promise.all([...selected].map((idx) => api.jobs.retranslateCue(jobId, idx)));
    },
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['cues', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
  });

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (isLoading || !cues) return <p className="text-sm text-muted-foreground">加载中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <ScrollProgress containerRef={scrollRef} />
      <div className="flex items-center justify-between">
        <div>
          <Link to="/jobs/$jobId" params={{ jobId }} className="text-xs text-muted-foreground hover:text-foreground">
            ← 返回任务详情
          </Link>
          <h1 className="text-lg font-semibold">{job?.fileName ?? '对照校对'}</h1>
        </div>
        <AnimatedBackground
          id="review-filter"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          items={[
            { value: 'all', label: `全部 (${cues.length})` },
            { value: 'flagged', label: '有问题' },
            { value: 'failed', label: '失败' },
            { value: 'edited', label: '已编辑' },
          ]}
        />
      </div>

      <div className="grid grid-cols-[90px_1fr_1fr] gap-2 border-b border-border px-2 pb-2 text-xs text-muted-foreground">
        <span>时间</span>
        <span>原文</span>
        <span>译文</span>
      </div>

      <div ref={scrollRef} className="h-[65vh] overflow-y-auto rounded-lg border border-border">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const cue = filtered[row.index];
            return (
              <div
                key={cue.id}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
                className="grid grid-cols-[90px_1fr_1fr] items-start gap-2 border-b border-border/50 px-2 py-1.5"
              >
                <div className="flex items-start gap-1.5 pt-1.5">
                  <input type="checkbox" checked={selected.has(cue.id)} onChange={() => toggle(cue.id)} className="mt-0.5" />
                  <span className="text-xs text-muted-foreground">{cue.rawTime.split(/-->|\s/)[0]}</span>
                </div>
                <p className="whitespace-pre-wrap pt-1.5 text-sm text-muted-foreground">{cue.source}</p>
                <div className={STATUS_COLOR[cue.status]}>
                  <CueTargetCell jobId={jobId} cue={cue} />
                  {cue.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-2 pb-1">
                      {cue.flags.map((f) => (
                        <Badge key={f} variant="warning">
                          {FLAG_LABEL[f]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ToolbarExpandable visible={selected.size > 0}>
        <span className="text-sm">已选 {selected.size} 条</span>
        <Button size="sm" onClick={() => retranslateSelected.mutate()} disabled={retranslateSelected.isPending}>
          重译所选
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
          取消选择
        </Button>
      </ToolbarExpandable>
    </div>
  );
}

export function JobReviewPage() {
  const { jobId } = useParams({ from: '/jobs/$jobId/review' });
  return (
    <RequireAuth>
      <ReviewInner jobId={jobId} />
    </RequireAuth>
  );
}

