import type { Cue, Eol, SubtitleDocument } from './model.js';

/**
 * ASS/SSA 解析器/写出器。解析思路与 srt.ts 一致：只在"重建原始 lines 数组所需的最少信息"上
 * 做文章，不经翻译直接"解析 → 写出"必须逐字节还原（readme.md 4.2）。
 *
 * - `[Script Info]`、`[V4+ Styles]` 等 `[Events]` 之前的所有内容（含 [Events] 自身的
 *   `Format:` 行）原样保存进 `doc.header`，程序完全不解读。
 * - `[Events]` 区里，按 `Format:` 行定位字段顺序；`Text` 是最后一个字段，可能含逗号，
 *   因此切分时只按前 N-1 个逗号切，剩下的整体作为 Text。写出时只替换 Text 字段，
 *   其余字段（Layer/Start/End/Style/Name/Margin.../Effect）原样写回。
 * - `Comment:` 行同样建模成 Cue（translatable=false，见 preprocess），保证能在同一套
 *   "行数组"机制里无损重建；真正未被识别的行（空行等）附加在前一条 Cue 的 trailingRaw 里
 *   一起写回，不丢失。
 * - `\N`（ASS 强制换行）在解析时转换成 `\n` 供 core 内部统一处理（合并/多人对白判断/折行），
 *   写出时再转换回来。
 */

interface AssEventMeta {
  eventKind: 'dialogue' | 'comment'; // 归一化后的种类，供内部逻辑判断（是否可翻译）
  prefix: string; // 原始的 "Dialogue:" / "Comment:" 前缀（含大小写、冒号后空白），逐字写回
  fields: string[]; // Format 顺序下的完整字段（含原始 Text），写出时只替换 textFieldIndex 位置
  textFieldIndex: number;
  trailingRaw: string[]; // 紧跟在这一行之后、下一条事件行之前的原始行（空行等），原样写回
}

const EVENTS_SECTION = /^\[Events\]\s*$/i;
const FORMAT_LINE = /^Format:\s*(.+)$/i;
const EVENT_LINE = /^(Dialogue|Comment):(\s*)(.*)$/i;
const ASS_TIME = /^(\d+):(\d{2}):(\d{2})[.,](\d{2})$/;

function assTimeToMs(t: string): number {
  const m = t.trim().match(ASS_TIME);
  if (!m) return 0;
  const [, h, mm, ss, cs] = m;
  return ((Number(h) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(cs) * 10;
}

/** 只按前 `count - 1` 个逗号切分，剩余部分（可能含逗号）作为最后一个字段。 */
function splitFixedFields(rest: string, count: number): string[] {
  const fields: string[] = [];
  let remaining = rest;
  for (let i = 0; i < count - 1; i++) {
    const idx = remaining.indexOf(',');
    if (idx === -1) {
      fields.push(remaining);
      remaining = '';
    } else {
      fields.push(remaining.slice(0, idx));
      remaining = remaining.slice(idx + 1);
    }
  }
  fields.push(remaining);
  return fields;
}

export function parseAss(raw: string): SubtitleDocument {
  const eol: Eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(eol);

  const eventsSectionIndex = lines.findIndex((l) => EVENTS_SECTION.test(l.trim()));
  if (eventsSectionIndex === -1) {
    throw new Error('ASS 解析失败：找不到 [Events] 分区');
  }
  let formatLineIndex = -1;
  let fieldNames: string[] = [];
  for (let i = eventsSectionIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(FORMAT_LINE);
    if (m) {
      formatLineIndex = i;
      fieldNames = m[1].split(',').map((s) => s.trim());
      break;
    }
  }
  if (formatLineIndex === -1) {
    throw new Error('ASS 解析失败：[Events] 分区下找不到 Format: 行');
  }

  const textIndex = fieldNames.indexOf('Text');
  const startIndex = fieldNames.indexOf('Start');
  const endIndex = fieldNames.indexOf('End');
  const styleIndex = fieldNames.indexOf('Style');
  const nameIndex = fieldNames.findIndex((f) => f === 'Name' || f === 'Actor');
  if (textIndex === -1) {
    throw new Error('ASS 解析失败：Format 行里没有 Text 字段');
  }

  const header = lines.slice(0, formatLineIndex + 1).join(eol);

  const cues: Cue[] = [];
  let nextId = 1;
  let currentTrailing: string[] | null = null;

  for (let i = formatLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const eventMatch = line.match(EVENT_LINE);
    if (!eventMatch) {
      if (currentTrailing) currentTrailing.push(line);
      continue;
    }

    const eventKind = eventMatch[1].toLowerCase() as 'dialogue' | 'comment';
    const prefix = `${eventMatch[1]}:${eventMatch[2]}`;
    const fields = splitFixedFields(eventMatch[3], fieldNames.length);
    const rawText = fields[textIndex] ?? '';
    const source = rawText.replace(/\\N/g, '\n');
    const startMs = startIndex >= 0 ? assTimeToMs(fields[startIndex]) : 0;
    const endMs = endIndex >= 0 ? assTimeToMs(fields[endIndex]) : 0;
    const style = styleIndex >= 0 ? fields[styleIndex] : undefined;
    const speaker = nameIndex >= 0 && fields[nameIndex]?.trim() ? fields[nameIndex].trim() : undefined;
    const translatable = eventKind === 'dialogue' && source.trim().length > 0;

    const assMeta: AssEventMeta = { eventKind, prefix, fields, textFieldIndex: textIndex, trailingRaw: [] };
    currentTrailing = assMeta.trailingRaw;

    cues.push({
      id: nextId++,
      rawTime: startIndex >= 0 && endIndex >= 0 ? `${fields[startIndex]} --> ${fields[endIndex]}` : '',
      startMs,
      endMs,
      speaker,
      meta: { ass: assMeta, style },
      leadingTags: '',
      source,
      placeholders: [],
      translatable,
      status: translatable ? 'pending' : 'skipped',
      flags: [],
    });
  }

  // 文件里一条事件都没有（Format 行之后直接结束）：把剩余的行原样并进 header，避免丢失。
  if (cues.length === 0 && formatLineIndex + 1 < lines.length) {
    return { format: 'ass', sourceEncoding: 'UTF-8', eol, header: lines.join(eol), cues: [] };
  }

  return { format: 'ass', sourceEncoding: 'UTF-8', eol, header, cues };
}

export function writeAss(doc: SubtitleDocument): string {
  const lines: string[] = [];
  if (doc.header) lines.push(...doc.header.split(doc.eol));

  for (const cue of doc.cues) {
    const assMeta = cue.meta.ass as AssEventMeta | undefined;
    if (!assMeta) continue; // 理论上不会发生：cues 全部来自 parseAss

    const fields = [...assMeta.fields];
    const text = cue.target ?? cue.source;
    fields[assMeta.textFieldIndex] = text.replace(/\n/g, '\\N');
    lines.push(`${assMeta.prefix}${fields.join(',')}`);
    lines.push(...assMeta.trailingRaw);
  }

  return lines.join(doc.eol);
}
