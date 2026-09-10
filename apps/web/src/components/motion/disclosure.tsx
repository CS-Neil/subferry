import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Disclosure —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 次要信息默认收起：新建任务的"高级参数"、任务详情的批次日志、服务设置的提示词模板
 * （readme.md 8.5）。
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-4 w-4" />
        </motion.span>
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn('overflow-hidden')}
          >
            <div className="border-t border-border px-3 py-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
