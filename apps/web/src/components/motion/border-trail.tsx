import { cn } from '@/lib/utils';

/**
 * BorderTrail —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 运行中任务卡片的边框流光，和静止的已完成卡片区分开（readme.md 8.5）。用 CSS `@property
 * --angle` + conic-gradient 旋转实现，不依赖 `motion` 库。父元素需要 `position: relative`。
 */
export function BorderTrail({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 rounded-[inherit]', className)}
      style={{
        background: 'conic-gradient(from var(--angle), transparent 75%, var(--color-primary) 92%, transparent)',
        padding: 1,
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        animation: 'border-trail-spin 2.4s linear infinite',
      }}
    />
  );
}
