import { useEffect } from 'react';
import { motion, useSpring, useTransform, type SpringOptions } from 'motion/react';

/**
 * AnimatedNumber —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 与真实上游组件的机制一致：用 `motion` 库的 useSpring + useTransform 做数值弹簧动画，
 * 只是源码是手写的而非通过 `npx shadcn add` 从 motion-primitives.com 拉取（本机沙箱
 * 无法访问该域名）。props 接口保持一致，网络可用时可以直接替换此文件。
 *
 * 用法：进度百分比、已完成条目数、token 用量等随 SSE 事件平滑变化的数字（readme.md 8.5）。
 * 高频更新要节流——调用方负责控制 value 的更新频率（每秒最多 4 次左右），组件本身不节流。
 */
export interface AnimatedNumberProps {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
}

export function AnimatedNumber({ value, className, springOptions }: AnimatedNumberProps) {
  const spring = useSpring(value, { bounce: 0, duration: 400, ...springOptions });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString('zh-CN'));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
