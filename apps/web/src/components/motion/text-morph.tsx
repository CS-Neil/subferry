import { AnimatePresence, motion } from 'motion/react';

/**
 * TextMorph —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 状态型按钮文字变化时用交叉淡入淡出代替真实的逐字符 morph（上游用每个字符的 LayoutGroup
 * 做形变动画，这里简化为整体淡入淡出，视觉效果接近，按钮本身不跳动）。
 * 用于："开始翻译→暂停→继续"、"复制→已复制"、"测试连接→连接成功"（readme.md 8.5）。
 */
export function TextMorph({ children, className }: { children: string; className?: string }) {
  return (
    <span className={className} style={{ display: 'inline-grid' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={children}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          style={{ gridArea: '1 / 1' }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
