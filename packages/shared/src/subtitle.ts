import { z } from 'zod';

/**
 * 字幕格式。M1 只实现 srt，ass/ssa/vtt 保留占位以维持接口稳定（见 packages/core/src/subtitle）。
 */
export const SubtitleFormat = z.enum(['srt', 'vtt', 'ass', 'ssa']);
export type SubtitleFormat = z.infer<typeof SubtitleFormat>;

export const Eol = z.enum(['\n', '\r\n']);
export type Eol = z.infer<typeof Eol>;

/**
 * 条目状态机。对应 readme.md 4.2。
 */
export const CueStatus = z.enum(['pending', 'done', 'failed', 'edited', 'skipped']);
export type CueStatus = z.infer<typeof CueStatus>;

/**
 * 校验/后处理过程中可能打在条目上的标记，供校对页展示（M1 只用日志/详情页文字提示，未做完整校对表格）。
 */
export const CueFlag = z.enum([
  'bad-placeholder', // 占位符种类或数量不一致，已回退为去除行内样式
  'length-mismatch', // 译文长度比例异常
  'refused', // 命中拒答特征
  'cps-exceeded', // 阅读速度超过阈值
  'failed', // 多次重试/拆批后仍失败，保留原文
]);
export type CueFlag = z.infer<typeof CueFlag>;

/**
 * ASS 行其余字段、VTT cue settings 等格式相关的附加信息。M1 只解析 SRT，此字段透传保存但不解读。
 */
export const CueMeta = z.record(z.string(), z.unknown());
export type CueMeta = z.infer<typeof CueMeta>;

export const Cue = z.object({
  id: z.number().int().nonnegative(), // 文档内顺序号，也是发给模型的 id
  rawTime: z.string(), // 原始时间字符串，写出时逐字写回
  startMs: z.number().int().nonnegative(), // 仅用于分批与阅读速度计算，只读
  endMs: z.number().int().nonnegative(),
  speaker: z.string().optional(),
  meta: CueMeta,
  leadingTags: z.string(), // 行首样式标签，如 {\an8}，不交给模型
  source: z.string(), // 清洗与占位符化后的文本
  placeholders: z.array(z.string()), // 占位符对应的原始标签，按 ⟨1⟩ ⟨2⟩... 顺序
  translatable: z.boolean(),
  target: z.string().optional(),
  status: CueStatus,
  flags: z.array(CueFlag),
});
export type Cue = z.infer<typeof Cue>;

export const SubtitleDocument = z.object({
  format: SubtitleFormat,
  sourceEncoding: z.string(),
  eol: Eol,
  header: z.string(), // 原样保存的文档头部（VTT 头等；ASS 头部留给 M2）
  cues: z.array(Cue),
});
export type SubtitleDocument = z.infer<typeof SubtitleDocument>;
