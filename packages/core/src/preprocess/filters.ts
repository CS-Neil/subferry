/**
 * 过滤规则（readme.md 4.3）：以下条目标记为 skipped 并原样输出，用户可以在校对页手动恢复翻译：
 * - 空文本；
 * - 纯音乐符号行；
 * - 带 \k 的卡拉 OK 特效行（ASS 逐字特效，M1 虽只支持 SRT，规则先备好，M2 接入 ASS 时直接复用）；
 * - 用户排除的 ASS 样式（如 Sign、OP、ED，通过 options.skipStyles + cue 的 style 名称判断）。
 */

const MUSIC_SYMBOLS = /[♪♫]/u;
const MUSIC_ONLY_CHARS = /[♪♫\s\-–—.,~*]/gu;
const KARAOKE_TAG = /\\k\d+/i;

export type SkipReason = 'empty' | 'music' | 'karaoke' | 'skipped-style';

export interface ClassifyResult {
  translatable: boolean;
  reason?: SkipReason;
}

function isMusicOnly(text: string): boolean {
  if (!MUSIC_SYMBOLS.test(text)) return false;
  return text.replace(MUSIC_ONLY_CHARS, '').length === 0;
}

export function classifyCue(
  text: string,
  opts: { style?: string; skipStyles?: string[] } = {},
): ClassifyResult {
  if (text.trim().length === 0) return { translatable: false, reason: 'empty' };
  if (isMusicOnly(text)) return { translatable: false, reason: 'music' };
  if (KARAOKE_TAG.test(text)) return { translatable: false, reason: 'karaoke' };
  if (opts.style && opts.skipStyles?.includes(opts.style)) {
    return { translatable: false, reason: 'skipped-style' };
  }
  return { translatable: true };
}
