import type { Cue, SubtitleDocument, SubtitleFormat } from '../subtitle/model.js';
import { restoreTags } from '../preprocess/tags.js';
import { normalizePunctuation } from './zh-rules.js';
import { reflow } from './reflow.js';
import { checkReadingSpeed } from './cps.js';
import { convertOpenCC, type OpenccMode } from './opencc.js';
import { makeBilingualText, type BilingualMode } from './bilingual.js';

export * from './zh-rules.js';
export * from './reflow.js';
export * from './cps.js';
export * from './opencc.js';
export * from './bilingual.js';

/**
 * 后处理入口（readme.md 4.8）：标点规范 → 繁简转换 → 折行 → 阅读速度检查 → 双语合并，
 * 只处理 status === 'done' 的条目（failed/skipped 条目保留原文，不需要再规范化；edited
 * 条目是用户手动改过的，同样跳过自动规范化，尊重用户的手动编辑）。
 *
 * 阅读速度检查故意放在双语合并之前，只统计中文部分的字数——双语字幕里原文那一行的字符数
 * 不应该被计入"中文阅读速度"。
 *
 * 标签还原（占位符拼回行首标签）在 pipeline/validator.ts 中已经作为校验通过条件的一部分完成
 * （见该文件顶部注释），这里只在需要展示原文的双语模式下，用同一个 restoreTags 重新拼出
 * "人类可读的原文"（cue.source 本身是占位符化过的清洗文本）。
 */
export interface PostprocessOptions {
  maxCharsPerLine?: number;
  maxCharsPerSecond?: number;
  opencc?: OpenccMode;
  outputMode?: 'zh' | BilingualMode;
  format?: SubtitleFormat; // 双语模式下 ASS 需要知道格式才能决定是否加缩放样式
}

export function postprocessCue(cue: Cue, opts: PostprocessOptions = {}): Cue {
  if (cue.status !== 'done' || cue.target === undefined) return cue;

  const maxCharsPerLine = opts.maxCharsPerLine ?? 16;
  const maxCharsPerSecond = opts.maxCharsPerSecond ?? 9;

  let text = normalizePunctuation(cue.target);
  text = convertOpenCC(text, opts.opencc ?? 'none');
  text = reflow(text, maxCharsPerLine);

  const exceeded = checkReadingSpeed(text, cue.startMs, cue.endMs, maxCharsPerSecond);
  const flags = exceeded && !cue.flags.includes('cps-exceeded') ? [...cue.flags, 'cps-exceeded' as const] : cue.flags;

  if (opts.outputMode === 'zh-top' || opts.outputMode === 'src-top') {
    const originalDisplay = restoreTags(cue.source, cue.placeholders, cue.leadingTags);
    text = makeBilingualText(text, originalDisplay, opts.outputMode, opts.format ?? 'srt');
  }

  return { ...cue, target: text, flags };
}

export function postprocessDocument(doc: SubtitleDocument, opts: PostprocessOptions = {}): SubtitleDocument {
  const withFormat: PostprocessOptions = { ...opts, format: opts.format ?? doc.format };
  return { ...doc, cues: doc.cues.map((c) => postprocessCue(c, withFormat)) };
}
