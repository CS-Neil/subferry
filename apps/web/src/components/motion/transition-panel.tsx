import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * TransitionPanel —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 步骤/面板切换时的方向感（readme.md 8.5）。M1/M2 没有做新建任务的多步向导，这里用在
 * 服务设置页"不同服务商的配置表单切换"上——按 activeKey 变化时做一次左右滑入滑出。
 */
export function TransitionPanel({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
