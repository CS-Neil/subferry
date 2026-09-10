import type { CallOptions, TranslateService } from '../services/types.js';

/**
 * 术语表自动提取（readme.md 4.7）：翻译前把全片原文分段发给模型，提取人名、地名、机构名、
 * 专有名词和常用称呼，返回候选译名、类别和说明。不走 translateBatch 的 id-JSON 协议——
 * 术语提取的输出形状（候选词数组）和翻译批次完全不同，因此走 TranslateService.chat()
 * 这个通用单次对话接口，用专门的提示词。
 */
export type GlossaryEntryType = 'person' | 'place' | 'organization' | 'term' | 'other';

export interface GlossaryCandidate {
  source: string;
  target: string;
  type: GlossaryEntryType;
  note?: string;
}

const VALID_TYPES: readonly GlossaryEntryType[] = ['person', 'place', 'organization', 'term', 'other'];

const GLOSSARY_SYSTEM_PROMPT = `你是影视字幕术语提取助手。从用户提供的台词片段中提取人名、地名、机构名、专有名词和常用称呼，
给出建议的中文译名、类别（person/place/organization/term/other）和一句话说明。

只输出一个 JSON 数组，每个元素形如 {"source":"原文","target":"建议译名","type":"person","note":"说明"}。
不要输出任何其他内容，不要重复相同的 source；没有需要标注的术语时输出空数组 []。`;

function renderGlossaryUserMessage(lines: string[]): string {
  return lines.map((t, i) => `${i + 1}: ${t}`).join('\n');
}

/** 容错解析：去掉代码围栏，截取第一个完整的 JSON 数组，忽略解析失败/形状不对的元素。 */
export function parseGlossaryOutput(raw: string): GlossaryCandidate[] {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('[');
  if (start === -1) return [];

  let depth = 0;
  let end = -1;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '[') depth++;
    else if (stripped[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const result: GlossaryCandidate[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const source = typeof obj.source === 'string' ? obj.source.trim() : '';
    const target = typeof obj.target === 'string' ? obj.target.trim() : '';
    if (!source || !target) continue;
    const type = VALID_TYPES.includes(obj.type as GlossaryEntryType) ? (obj.type as GlossaryEntryType) : 'other';
    const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;
    result.push({ source, target, type, note });
  }
  return result;
}

function dedupeCandidates(candidates: GlossaryCandidate[]): GlossaryCandidate[] {
  const bySource = new Map<string, GlossaryCandidate>();
  for (const c of candidates) {
    if (!bySource.has(c.source)) bySource.set(c.source, c);
  }
  return [...bySource.values()];
}

export interface ExtractGlossaryOptions {
  chunkLines?: number; // 每次请求携带的行数，默认150，避免单次请求文本过长
}

/**
 * 对外主入口：分段调用 service.chat 提取候选术语并去重（按 source 保留第一次出现的候选）。
 * 服务不支持 chat（未实现该方法）时直接返回空数组——上层应把这种情况当作"跳过术语提取"处理。
 */
export async function extractGlossaryCandidates(
  sourceTexts: string[],
  service: TranslateService,
  callOptions: CallOptions,
  opts: ExtractGlossaryOptions = {},
): Promise<GlossaryCandidate[]> {
  if (!service.chat) return [];
  const nonEmpty = sourceTexts.filter((t) => t.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const chunkLines = opts.chunkLines ?? 150;
  const chunks: string[][] = [];
  for (let i = 0; i < nonEmpty.length; i += chunkLines) {
    chunks.push(nonEmpty.slice(i, i + chunkLines));
  }

  const all: GlossaryCandidate[] = [];
  for (const chunk of chunks) {
    const raw = await service.chat(GLOSSARY_SYSTEM_PROMPT, renderGlossaryUserMessage(chunk), callOptions);
    all.push(...parseGlossaryOutput(raw));
  }
  return dedupeCandidates(all);
}
