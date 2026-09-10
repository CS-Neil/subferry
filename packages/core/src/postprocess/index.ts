import type { Cue, SubtitleDocument } from '../subtitle/model.js';
import { normalizePunctuation } from './zh-rules.js';
import { reflow } from './reflow.js';
import { checkReadingSpeed } from './cps.js';

export * from './zh-rules.js';
export * from './reflow.js';
export * from './cps.js';

/**
 * 后处理入口（readme.md 4.8）：标点规范 → 折行 → 阅读速度检查，只处理 status === 'done' 的条目
 * （failed/skipped 条目保留原文，不需要再规范化；edited 条目是用户手动改过的，同样跳过自动规范化，
 * 尊重用户的手动编辑）。
 *
 * 标签还原（占位符拼回行首标签）在 pipeline/validator.ts 中已经作为校验通过条件的一部分完成
 * （见该文件顶部注释），这里不重复处理。繁简转换（opencc.ts）与双语输出（bilingual.ts）是 M2 范围。
 */
export interface PostprocessOptions {
  maxCharsPerLine?: number;
  maxCharsPerSecond?: number;
}

export function postprocessCue(cue: Cue, opts: PostprocessOptions = {}): Cue {
  if (cue.status !== 'done' || cue.target === undefined) return cue;

  const maxCharsPerLine = opts.maxCharsPerLine ?? 16;
  const maxCharsPerSecond = opts.maxCharsPerSecond ?? 9;

  let text = normalizePunctuation(cue.target);
  text = reflow(text, maxCharsPerLine);

  const exceeded = checkReadingSpeed(text, cue.startMs, cue.endMs, maxCharsPerSecond);
  const flags = exceeded && !cue.flags.includes('cps-exceeded') ? [...cue.flags, 'cps-exceeded' as const] : cue.flags;

  return { ...cue, target: text, flags };
}

export function postprocessDocument(doc: SubtitleDocument, opts: PostprocessOptions = {}): SubtitleDocument {
  return { ...doc, cues: doc.cues.map((c) => postprocessCue(c, opts)) };
}
