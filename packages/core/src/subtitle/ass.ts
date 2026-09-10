import type { SubtitleDocument } from './model.js';

/**
 * ASS/SSA 支持是 M2 范围（readme.md 13 章）。占位实现只用于保持 subtitle/index.ts 的注册表
 * 接口稳定，M2 开发时在此文件内实现 `按 Format: 行定位字段，Text 是最后一个字段` 的解析逻辑，
 * 不需要改动调用方代码。
 */
export function parseAss(_raw: string): SubtitleDocument {
  throw new Error('ASS/SSA 解析尚未实现（M2 范围），当前版本仅支持 SRT');
}

export function writeAss(_doc: SubtitleDocument): string {
  throw new Error('ASS/SSA 写出尚未实现（M2 范围），当前版本仅支持 SRT');
}
