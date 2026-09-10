import { type ElementType, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * TextShimmer —— motion-primitives 组件的手写降级实现。
 *
 * 本机沙箱环境无法访问 motion-primitives.com（详见 components/motion/README.md），
 * 因此手写了一份视觉效果相近、props 接口与上游一致的版本：纯 CSS 渐变扫光文字，
 * 不依赖 `motion` 包。等网络可用时可以直接用
 * `npx shadcn@latest add "https://motion-primitives.com/c/text-shimmer.json" --path src/components/motion`
 * 覆盖此文件，调用方代码不需要改动。
 *
 * 全站唯一用法：表示"正在进行中"（见 readme.md 8.5）。
 */
export interface TextShimmerProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  children: string;
  as?: ElementType;
  duration?: number;
  spread?: number;
}

export function TextShimmer({
  children,
  as: Component = 'span',
  className,
  duration = 2,
  spread = 2,
  style,
  ...props
}: TextShimmerProps) {
  const dynamicSpread = children.length * spread;

  return (
    <Component
      className={cn(
        'inline-block bg-clip-text text-transparent',
        'bg-[linear-gradient(90deg,var(--color-muted-foreground)_0%,var(--color-muted-foreground)_40%,var(--color-foreground)_50%,var(--color-muted-foreground)_60%,var(--color-muted-foreground)_100%)]',
        className,
      )}
      style={{
        ...style,
        backgroundSize: `${dynamicSpread}px 100%`,
        animation: `shimmer ${duration}s linear infinite`,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
