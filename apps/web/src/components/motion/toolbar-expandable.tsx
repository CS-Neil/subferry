import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * ToolbarExpandable —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 校对页底部浮动工具栏：选中条目后展开可用操作（readme.md 8.5）。
 */
export function ToolbarExpandable({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
