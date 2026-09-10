/**
 * 阅读速度检查（readme.md 4.8）：默认阈值约 9 字/秒，超出时只打标记，不改动时间轴。
 */
export function checkReadingSpeed(text: string, startMs: number, endMs: number, maxCps = 9): boolean {
  const durationSec = (endMs - startMs) / 1000;
  if (durationSec <= 0) return false;
  const charCount = text.replace(/\s/g, '').length;
  return charCount / durationSec > maxCps;
}
