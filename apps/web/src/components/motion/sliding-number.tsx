import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

/**
 * SlidingNumber —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 用于计数变化：任务列表顶部"运行中/排队中/待校对"的任务数统计（readme.md 8.5）。
 * 和 AnimatedNumber 机制相同，语义上专用于整数计数，不用于带小数的进度百分比。
 */
export function SlidingNumber({ value, className }: { value: number; className?: string }) {
  const spring = useSpring(value, { bounce: 0, duration: 300 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString('zh-CN'));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
