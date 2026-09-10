import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * GlowEffect —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 上传区域在文件拖入时发光，提示"可以在这里放下文件"（readme.md 8.5）。
 */
export function GlowEffect({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={cn('rounded-lg', className)}
      animate={{
        boxShadow: active
          ? '0 0 0 3px var(--color-primary), 0 0 28px 6px color-mix(in oklch, var(--color-primary) 45%, transparent)'
          : '0 0 0 0 transparent',
      }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
