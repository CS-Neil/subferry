import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * AnimatedBackground —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 用 `motion` 的 layoutId 共享布局动画做高亮块在选项之间滑动。用在：顶部导航的选中高亮、
 * 校对页筛选分段控件（readme.md 8.5）。两处可能同时挂载在同一页面上，所以用 `id` prop
 * 区分各自的 layoutId，避免互相干扰对方的滑动动画。
 */
export interface AnimatedBackgroundProps {
  id: string;
  items: { value: string; label: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function AnimatedBackground({ id, items, value, onChange, className }: AnimatedBackgroundProps) {
  return (
    <div className={cn('inline-flex gap-1 rounded-lg bg-muted p-1', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            'relative rounded-md px-3 py-1.5 text-sm transition-colors',
            value === item.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === item.value && (
            <motion.div
              layoutId={`animated-background-${id}`}
              className="absolute inset-0 rounded-md bg-background shadow-sm"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
            />
          )}
          <span className="relative z-10">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
