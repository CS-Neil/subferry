import type { SubtitleFormat } from '../subtitle/model.js';

/**
 * 双语输出（readme.md 4.9）：中文在上或原文在上。ASS 格式给原文部分加较小字号的行内样式
 * （用 `{\fscx70\fscy70}` 缩放70%，`{\r}` 结束样式，避免影响后续可能拼接的其它内容）；
 * SRT/VTT 没有行内缩放语法，原文就原样放在第二行。
 */
export type BilingualMode = 'zh-top' | 'src-top';

function styleOriginal(text: string, format: SubtitleFormat): string {
  if (format === 'ass' || format === 'ssa') {
    return `{\\fscx70\\fscy70}${text}{\\r}`;
  }
  return text;
}

export function makeBilingualText(
  translated: string,
  originalDisplay: string,
  mode: BilingualMode,
  format: SubtitleFormat,
): string {
  const styled = styleOriginal(originalDisplay, format);
  return mode === 'zh-top' ? `${translated}\n${styled}` : `${styled}\n${translated}`;
}
