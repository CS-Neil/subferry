/**
 * 字幕文档与条目的数据模型。类型的唯一事实来源是 @subferry/shared（前后端共用同一套 zod schema），
 * 这里只做 re-export，方便 core 内部用相对路径 `./model.js` 引用而不必到处写包名。
 */
export type {
  SubtitleDocument,
  SubtitleFormat,
  Eol,
  Cue,
  CueMeta,
  CueStatus,
  CueFlag,
} from '@subferry/shared';
