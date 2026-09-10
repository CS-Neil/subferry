import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/**
 * MorphingDialog —— motion-primitives 组件的手写降级实现（见 README.md）。
 *
 * 已知简化：真正的 MorphingDialog 用共享的 layoutId 让弹层从触发元素的原始位置和尺寸
 * "长出来"（FLIP 动画）；这里简化成从屏幕中心缩放淡入的普通弹层，没有做位置续接。
 * 视觉上仍然传达"这是详情展开"的含义（用于任务卡片展开详情、术语条目展开编辑，
 * readme.md 8.5），但不是逐像素还原的 morph 效果。
 */
export function MorphingDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
