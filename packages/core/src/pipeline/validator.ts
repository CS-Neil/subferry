import type { Cue, CueFlag } from '../subtitle/model.js';
import { countPlaceholders, restoreTags, stripPlaceholderMarkers } from '../preprocess/tags.js';

/**
 * 容错解析：去掉 Markdown 代码围栏，截取第一个完整的 JSON 对象（readme.md 4.6）。
 */
export type ParseResult =
  | { ok: true; data: Record<string, string> }
  | { ok: false; error: 'no-json-object-found' | 'unbalanced-braces' | 'not-an-object' | 'json-parse-error' };

export function parseModelOutput(raw: string): ParseResult {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  if (start === -1) return { ok: false, error: 'no-json-object-found' };

  let depth = 0;
  let end = -1;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return { ok: false, error: 'unbalanced-braces' };

  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'not-an-object' };
    }
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      data[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'json-parse-error' };
  }
}

const REFUSAL_PATTERNS = [
  /i(?:'m| am) sorry,? but/i,
  /i cannot(?: translate)?/i,
  /as an ai/i,
  /无法(?:提供|翻译|协助)/,
  /抱歉[，,]?\s*(?:我)?无法/,
];

/** 拒答检测：识别拒绝翻译的回复（对整批原始响应文本检测，不依赖 JSON 是否能解析）。 */
export function isRefusal(raw: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(raw));
}

function isKoreanLike(from: string): boolean {
  return /^ko/i.test(from) || from.includes('한국') || from.includes('Korean') || from.includes('韩');
}

const RESIDUAL_THRESHOLD = 0.4;

/** 残留原文检测：韩文字符或大段拉丁字母占比不能过高（经验阈值，见 readme.md 4.6）。 */
export function residualSourceRatio(translated: string, from: string): number {
  const total = translated.replace(/\s/g, '').length;
  if (total === 0) return 0;
  if (isKoreanLike(from)) {
    const hangul = (translated.match(/[가-힣]/g) ?? []).length;
    return hangul / total;
  }
  const latin = (translated.match(/[A-Za-z]/g) ?? []).length;
  return latin / total;
}

function lengthRatioAbnormal(source: string, translated: string): boolean {
  if (source.length === 0) return false;
  const ratio = translated.length / source.length;
  return ratio < 0.2 || ratio > 3;
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export interface AcceptedCue {
  text: string; // 已还原标签的最终译文
  flags: CueFlag[];
}

export interface ValidateResult {
  accepted: Map<number, AcceptedCue>;
  needsRetry: Map<number, string>; // id -> 失败原因，用于补译请求中说明上次的问题
  extraIds: number[]; // 输入中没有但模型返回了的 id，丢弃并记录日志
  refused: boolean; // 整批被识别为拒答
}

export function validateBatch(raw: string, items: Cue[], opts: { from: string }): ValidateResult {
  const accepted = new Map<number, AcceptedCue>();
  const needsRetry = new Map<number, string>();

  if (isRefusal(raw)) {
    for (const cue of items) needsRetry.set(cue.id, 'refused');
    return { accepted, needsRetry, extraIds: [], refused: true };
  }

  const parsed = parseModelOutput(raw);
  if (!parsed.ok) {
    for (const cue of items) needsRetry.set(cue.id, `parse-error:${parsed.error}`);
    return { accepted, needsRetry, extraIds: [], refused: false };
  }

  const batchIds = new Set(items.map((c) => c.id));
  const extraIds = Object.keys(parsed.data)
    .map(Number)
    .filter((id) => !Number.isNaN(id) && !batchIds.has(id));

  for (const cue of items) {
    const text = parsed.data[String(cue.id)];
    if (text === undefined) {
      needsRetry.set(cue.id, 'missing-id');
      continue;
    }
    if (text.trim().length === 0) {
      needsRetry.set(cue.id, 'empty');
      continue;
    }
    if (residualSourceRatio(text, opts.from) > RESIDUAL_THRESHOLD) {
      needsRetry.set(cue.id, 'residual-source');
      continue;
    }

    const flags: CueFlag[] = [];
    const gotPlaceholders = countPlaceholders(text);
    const wantPlaceholders = cue.placeholders.map((_, i) => i + 1);
    const placeholderOk = arraysEqual(gotPlaceholders, wantPlaceholders);

    const finalText = placeholderOk
      ? restoreTags(text, cue.placeholders, cue.leadingTags)
      : stripPlaceholderMarkers(text, cue.leadingTags);
    if (!placeholderOk) flags.push('bad-placeholder');
    if (lengthRatioAbnormal(cue.source, text)) flags.push('length-mismatch');

    accepted.set(cue.id, { text: finalText, flags });
  }

  return { accepted, needsRetry, extraIds, refused: false };
}
