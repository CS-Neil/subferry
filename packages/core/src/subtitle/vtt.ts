import type { SubtitleDocument } from './model.js';

/**
 * WebVTT 支持是 M2 范围（readme.md 13 章）。占位实现只用于保持 subtitle/index.ts 的注册表
 * 接口稳定，M2 开发时在此文件内实现保留 cue 标识和 cue settings 的解析逻辑。
 */
export function parseVtt(_raw: string): SubtitleDocument {
  throw new Error('WebVTT 解析尚未实现（M2 范围），当前版本仅支持 SRT');
}

export function writeVtt(_doc: SubtitleDocument): string {
  throw new Error('WebVTT 写出尚未实现（M2 范围），当前版本仅支持 SRT');
}
