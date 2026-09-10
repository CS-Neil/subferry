import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * TextEffect —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 空状态提示的入场动效，例如"还没有任务，拖入字幕文件开始"（readme.md 8.5）。
 */
export function TextEffect({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.p className={className} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {children}
    </motion.p>
  );
}
