import type { Cue, SubtitleDocument } from '../subtitle/model.js';
import { mergeLines } from './linebreak.js';
import { stripTags } from './tags.js';
import { classifyCue } from './filters.js';

export * from './tags.js';
export * from './linebreak.js';
export * from './filters.js';

export interface PreprocessOptions {
  skipStyles?: string[]; // ASS 专用（M2），M1 对 SRT 恒为空
}

/**
 * 对单条 cue 做预处理：合并多行、过滤判断、标签占位符化。不修改原始解析结果的语义——
 * 如果条目被判定为不可翻译（skipped），直接原样保留 source/leadingTags/placeholders，
 * 保证写出时（target 始终为空）逐字回退到原文。
 */
export function preprocessCue(cue: Cue, opts: PreprocessOptions = {}): Cue {
  const merged = mergeLines(cue.source);
  const style = typeof cue.meta.style === 'string' ? cue.meta.style : undefined;
  const classified = classifyCue(merged.text, { style, skipStyles: opts.skipStyles });

  if (!classified.translatable) {
    return { ...cue, translatable: false, status: 'skipped' };
  }

  const stripped = stripTags(merged.text);
  return {
    ...cue,
    translatable: true,
    leadingTags: stripped.leadingTags,
    source: stripped.source,
    placeholders: stripped.placeholders,
  };
}

export function preprocessDocument(doc: SubtitleDocument, opts: PreprocessOptions = {}): SubtitleDocument {
  return { ...doc, cues: doc.cues.map((c) => preprocessCue(c, opts)) };
}
