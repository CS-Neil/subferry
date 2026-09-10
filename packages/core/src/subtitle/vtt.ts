import type { Cue, Eol, SubtitleDocument } from './model.js';

/**
 * WebVTT 解析器/写出器。与 srt.ts / ass.ts 同一思路：只重建"逐字还原原始行数组"所需的
 * 最少信息。保留 cue 标识（identifier）和 cue settings（readme.md 4.2）——cue settings
 * 是时间行本身的一部分（"start --> end position:50% line:1"），整行存进 `rawTime`，
 * 写出时逐字写回，不解读。
 *
 * `WEBVTT` 头、其后的 NOTE/STYLE/REGION 块，以及散落在两条 cue 之间的任何非标准内容，
 * 统一按"追加到前一个 cue 的 trailingRaw（还没出现 cue 时归入 header）"的方式无损保存，
 * 不需要专门解析 NOTE/STYLE 的语法。
 */
interface VttCueMeta {
  identifier?: string; // cue 标识行（可选），逐字写回
  trailingRaw: string[]; // 紧跟在这条 cue 之后、下一条 cue 之前的原始行（空行、NOTE 块等）
}

function isTimingLine(line: string): boolean {
  return line.includes('-->');
}

function vttTimeToMs(raw: string): number {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return 0;
  const [, h, mm, ss, ms] = m;
  return ((Number(h ?? 0) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms);
}

export function parseVtt(raw: string): SubtitleDocument {
  const eol: Eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(eol);

  const headerLines: string[] = [];
  const cues: Cue[] = [];
  let nextId = 1;
  let currentTrailing: string[] | null = null;

  let i = 0;
  while (i < lines.length) {
    const hasIdentifier =
      !isTimingLine(lines[i]) && lines[i].trim() !== '' && i + 1 < lines.length && isTimingLine(lines[i + 1]);
    const isCueStart = isTimingLine(lines[i]) || hasIdentifier;

    if (!isCueStart) {
      (currentTrailing ?? headerLines).push(lines[i]);
      i++;
      continue;
    }

    let identifier: string | undefined;
    if (hasIdentifier) {
      identifier = lines[i];
      i++;
    }
    const timingLine = lines[i];
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    const source = textLines.join('\n');
    const [startRaw, restRaw] = timingLine.split('-->');
    const endRaw = restRaw?.trim().split(/\s+/)[0] ?? '';

    const meta: VttCueMeta = { identifier, trailingRaw: [] };
    currentTrailing = meta.trailingRaw;

    cues.push({
      id: nextId++,
      rawTime: timingLine,
      startMs: startRaw ? vttTimeToMs(startRaw) : 0,
      endMs: endRaw ? vttTimeToMs(endRaw) : 0,
      meta: { vtt: meta },
      leadingTags: '',
      source,
      placeholders: [],
      translatable: source.trim().length > 0,
      status: source.trim().length > 0 ? 'pending' : 'skipped',
      flags: [],
    });
  }

  return { format: 'vtt', sourceEncoding: 'UTF-8', eol, header: headerLines.join(eol), cues };
}

export function writeVtt(doc: SubtitleDocument): string {
  const lines: string[] = [];
  if (doc.header) lines.push(...doc.header.split(doc.eol));

  for (const cue of doc.cues) {
    const meta = cue.meta.vtt as VttCueMeta | undefined;
    if (!meta) continue;

    if (meta.identifier !== undefined) lines.push(meta.identifier);
    lines.push(cue.rawTime);
    const text = cue.target ?? cue.source;
    lines.push(...text.split('\n'));
    lines.push(...meta.trailingRaw);
  }

  return lines.join(doc.eol);
}
