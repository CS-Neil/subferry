/**
 * 标签保护（readme.md 4.3）：
 * - 行首样式块剥离到 leadingTags（如 SRT/ASS 常见的 {\an8}、{\pos(...)} 等，出现在文本最前面）。
 * - 行内标签（<i> <b> <u> 及类似 ASS 内联标签 {\i1} 等）替换为 ⟨1⟩ 这样的占位符，交给模型时模型
 *   只需原样保留占位符位置，不需要理解标签语法。
 * - 还原时按占位符编号把原始标签拼回对应位置；如果还原后发现占位符对不上（模型漏掉或错位），
 *   调用方应改用 `stripInlineTags` 的降级路径（见 validator.ts）：不强求保留行内标签，只保留
 *   行首标签，并在 cue 上打 'bad-placeholder' 标记。
 */

const LEADING_TAG = /^((?:\{[^{}]*\})+)/; // 形如 {\an8}{\pos(1,2)} 这样连续出现在最前面的花括号标签块
const INLINE_TAG = /<\/?[a-zA-Z][^<>]*>|\{[^{}]*\}/g; // <i> </i> 等 HTML 风格标签，以及行内出现的花括号标签

export interface StripTagsResult {
  leadingTags: string;
  source: string; // 占位符化之后的文本
  placeholders: string[]; // 按 ⟨1⟩ ⟨2⟩... 顺序对应的原始标签内容
}

/**
 * 剥离行首标签块 + 把行内标签替换为占位符。输入是字幕原始文本（可能多行，已由
 * preprocess/linebreak.ts 合并为一行）。
 */
export function stripTags(rawText: string): StripTagsResult {
  const leadingMatch = rawText.match(LEADING_TAG);
  const leadingTags = leadingMatch ? leadingMatch[1] : '';
  const rest = leadingMatch ? rawText.slice(leadingMatch[1].length) : rawText;

  const placeholders: string[] = [];
  const source = rest.replace(INLINE_TAG, (tag) => {
    placeholders.push(tag);
    return `⟨${placeholders.length}⟩`;
  });

  return { leadingTags, source, placeholders };
}

const PLACEHOLDER_TOKEN = /⟨(\d+)⟩/g;

/**
 * 把占位符还原为原始标签，拼回 leadingTags 之前（postprocess 阶段调用）。
 */
export function restoreTags(translated: string, placeholders: string[], leadingTags: string): string {
  const restored = translated.replace(PLACEHOLDER_TOKEN, (whole, numStr: string) => {
    const idx = Number(numStr) - 1;
    return placeholders[idx] ?? whole; // 找不到对应占位符时保留原样，不抛错
  });
  return leadingTags + restored;
}

/** 统计文本中出现的占位符编号集合，用于校验种类与数量是否与原文一致（validator.ts 使用）。 */
export function countPlaceholders(text: string): number[] {
  const found: number[] = [];
  for (const m of text.matchAll(PLACEHOLDER_TOKEN)) found.push(Number(m[1]));
  return found.sort((a, b) => a - b);
}

/**
 * 降级路径：占位符错乱时，去掉译文中所有占位符标记（视为行内样式丢失），只保留 leadingTags。
 * 对应 readme.md 4.6 校验表“占位符”一行的处理方式。
 */
export function stripPlaceholderMarkers(translated: string, leadingTags: string): string {
  return leadingTags + translated.replace(PLACEHOLDER_TOKEN, '');
}
