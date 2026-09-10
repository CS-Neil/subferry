import { useEffect, useState } from 'react';

/**
 * TextScramble —— motion-primitives 组件的手写降级实现（见 README.md）。
 * 只播放一次的"解码"动画：从乱码逐渐显示为最终文字。全站限定两处使用（readme.md 8.5）：
 * 登录页标题"字渡"；校对页里当前可见的行收到新译文时。
 */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ字渡译幕光影声画';

export function TextScramble({
  text,
  className,
  duration = 700,
}: {
  text: string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const revealCount = Math.floor(progress * text.length);
      const next = text
        .split('')
        .map((ch, i) => {
          if (i < revealCount || ch === ' ' || ch === '\n') return ch;
          return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        })
        .join('');
      setDisplay(next);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setDisplay(text);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);

  return <span className={className}>{display}</span>;
}
