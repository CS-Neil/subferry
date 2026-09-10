import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * AnimatedGroup —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 新内容进入时的交错入场动画：上传后的文件列表逐个出现、任务列表首次加载（readme.md 8.5）。
 */
export function AnimatedGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedGroupItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
      {children}
    </motion.div>
  );
}
