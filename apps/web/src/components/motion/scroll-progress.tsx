import { useEffect, type RefObject } from 'react';
import { motion, useSpring } from 'motion/react';

/**
 * ScrollProgress —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 顶部细进度条，表示在当前滚动容器里的阅读位置（readme.md 8.5，校对页用）。
 * 默认跟踪 window 滚动；传入 containerRef 时跟踪该容器自身的滚动（校对页的虚拟列表
 * 是自己的滚动容器，不是整页滚动）。
 */
export function ScrollProgress({
  containerRef,
  className = 'fixed left-0 top-0 z-50 h-0.5 origin-left bg-primary',
}: {
  containerRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const progress = useSpring(0, { bounce: 0, duration: 200 });

  useEffect(() => {
    const el = containerRef?.current;
    const target: HTMLElement | Window = el ?? window;

    const handler = () => {
      const scrollTop = el ? el.scrollTop : window.scrollY;
      const scrollHeight = el
        ? el.scrollHeight - el.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      progress.set(scrollHeight > 0 ? scrollTop / scrollHeight : 0);
    };

    target.addEventListener('scroll', handler);
    handler();
    return () => target.removeEventListener('scroll', handler);
  }, [containerRef, progress]);

  return <motion.div className={className} style={{ scaleX: progress, width: '100%' }} />;
}
