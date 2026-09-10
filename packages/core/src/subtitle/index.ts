import type { SubtitleDocument, SubtitleFormat } from './model.js';
import { parseSrt, writeSrt } from './srt.js';
import { parseAss, writeAss } from './ass.js';
import { parseVtt, writeVtt } from './vtt.js';

export * from './model.js';
export { parseSrt, writeSrt } from './srt.js';
export { parseAss, writeAss } from './ass.js';
export { parseVtt, writeVtt } from './vtt.js';

interface FormatHandlers {
  parse(raw: string): SubtitleDocument;
  write(doc: SubtitleDocument): string;
}

/**
 * 格式注册表：M2 加 ASS/VTT 完整实现时只需要在这里保持映射即可，调用方（parseSubtitle/writeSubtitle）
 * 不需要改动。
 */
const formats: Record<SubtitleFormat, FormatHandlers> = {
  srt: { parse: parseSrt, write: writeSrt },
  ass: { parse: parseAss, write: writeAss },
  ssa: { parse: parseAss, write: writeAss },
  vtt: { parse: parseVtt, write: writeVtt },
};

export function parseSubtitle(format: SubtitleFormat, raw: string): SubtitleDocument {
  return formats[format].parse(raw);
}

export function writeSubtitle(doc: SubtitleDocument): string {
  return formats[doc.format].write(doc);
}
