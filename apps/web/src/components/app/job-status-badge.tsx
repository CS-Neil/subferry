import type { JobSummary } from '@subferry/shared';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { TextShimmer } from '@/components/motion/text-shimmer';

const STATUS_LABEL: Record<JobSummary['status'], string> = {
  queued: '排队中',
  parsing: '解析中',
  translating: '翻译中',
  done: '已完成',
  failed: '失败',
  paused: '已暂停',
  canceled: '已取消',
};

const STATUS_VARIANT: Record<JobSummary['status'], BadgeVariant> = {
  queued: 'secondary',
  parsing: 'secondary',
  translating: 'default',
  done: 'success',
  failed: 'destructive',
  paused: 'warning',
  canceled: 'outline',
};

// 全站唯一使用 TextShimmer 的地方：任务处于"进行中"状态时的文字（readme.md 8.5）。
const IN_PROGRESS: JobSummary['status'][] = ['queued', 'parsing', 'translating'];

export function JobStatusBadge({ status }: { status: JobSummary['status'] }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {IN_PROGRESS.includes(status) ? <TextShimmer duration={1.6}>{STATUS_LABEL[status]}</TextShimmer> : STATUS_LABEL[status]}
    </Badge>
  );
}
