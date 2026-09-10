import type { Cue, Eol, SubtitleDocument } from './model.js';

/**
 * SRT 解析器/写出器。设计原则（readme.md 4.2）：解析只抽取文本与必要的时间信息，
 * 其余内容原样保存；不经翻译直接“解析 → 写出”，结果必须与输入逐字节一致。
 *
 * 实现思路：把原始文本按检测到的 eol 切分成 `lines` 数组，每个 cue 只记录“重建这一段 lines
 * 所需的最少信息”（原始序号文本、原始时间行整行、文本行、紧随其后的空行数量）。写出时按同样的
 * 结构重新拼出 lines 数组再 `join(eol)`——只要没有调用翻译（target 始终为 undefined），
 * 拼出来的 lines 与解析时切出来的完全一致，天然保证逐字节还原，不需要额外的“diff 补丁”。
 *
 * 范围限制：不处理文件级 BOM（由服务端 io/encoding.ts 在解码阶段处理），也不保留“第一个字幕块之前
 * 的前导空行”（真实 SRT 文件几乎不会出现，作为已知的简化点在此注明）。
 */

const TIME_LINE = /^\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/;

interface SrtCueMeta {
  index: string; // 原始序号文本，可能与 cue.id 不同（例如文件本身编号不连续），写出时逐字写回
  blankLinesAfter: number; // 紧跟在这条字幕文本之后、下一条序号行之前的空行数量（含文件末尾的情形）
}

function timeToMs(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!m) return 0;
  const [, hh, mm, ss, ms] = m;
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms);
}

export function parseSrt(raw: string): SubtitleDocument {
  const eol: Eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(eol);

  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++; // 跳过前导空行（不保留，见文件顶部说明）

  const cues: Cue[] = [];
  let nextId = 1;

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    const indexLine = lines[i];
    i++;
    if (i >= lines.length) break; // 序号行后没有时间行了，视为末尾脏数据，丢弃

    const timeLine = lines[i];
    const timeMatch = timeLine.match(TIME_LINE);
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    let blankLinesAfter = 0;
    while (i < lines.length && lines[i].trim() === '') {
      blankLinesAfter++;
      i++;
    }

    const source = textLines.join('\n');
    const srtMeta: SrtCueMeta = { index: indexLine, blankLinesAfter };

    cues.push({
      id: nextId++,
      rawTime: timeLine,
      startMs: timeMatch ? timeToMs(timeMatch[1]) : 0,
      endMs: timeMatch ? timeToMs(timeMatch[2]) : 0,
      meta: { srt: srtMeta },
      leadingTags: '', // 行首样式标签的剥离是预处理阶段的工作，见 preprocess/tags.ts
      source,
      placeholders: [],
      translatable: source.trim().length > 0,
      status: 'pending',
      flags: [],
    });
  }

  return {
    format: 'srt',
    sourceEncoding: 'UTF-8', // 真实检测结果由服务端 io/encoding.ts 解码后覆盖此字段
    eol,
    header: '',
    cues,
  };
}

export function writeSrt(doc: SubtitleDocument): string {
  const lines: string[] = [];

  if (doc.header) {
    lines.push(...doc.header.split(doc.eol));
  }

  for (const cue of doc.cues) {
    const srtMeta = (cue.meta.srt as SrtCueMeta | undefined) ?? {
      index: String(cue.id),
      blankLinesAfter: 1,
    };

    lines.push(srtMeta.index);
    lines.push(cue.rawTime);

    const text = cue.target ?? cue.source;
    const textLines = text.split('\n');
    lines.push(...textLines);

    for (let b = 0; b < srtMeta.blankLinesAfter; b++) lines.push('');
  }

  return lines.join(doc.eol);
}
