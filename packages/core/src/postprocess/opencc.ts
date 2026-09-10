import { Converter } from 'opencc-js';

/**
 * 繁简转换（readme.md 4.8："繁简转换：可选 OpenCC"）。翻译模型默认输出简体中文，
 * 's2t' 用于需要繁体输出的场景，'t2s' 是极少数模型意外输出繁体时的兜底。
 * 转换器按需惰性创建并缓存（opencc-js 构造转换器有一定开销，一个进程内只建一次）。
 */
export type OpenccMode = 'none' | 's2t' | 't2s';

type Conv = (text: string) => string;
let s2t: Conv | undefined;
let t2s: Conv | undefined;

// s2t/t2s 是模块级 let（跨调用缓存转换器），TS 不会为闭包外的可变绑定做控制流收窄，
// 这里的非空断言是安全的：紧邻的上一行刚确保过它不是 undefined。
function getS2T(): Conv {
  if (!s2t) s2t = Converter({ from: 'cn', to: 't' });
  return s2t!;
}

function getT2S(): Conv {
  if (!t2s) t2s = Converter({ from: 't', to: 'cn' });
  return t2s!;
}

export function convertOpenCC(text: string, mode: OpenccMode): string {
  if (mode === 'none' || text.length === 0) return text;
  return mode === 's2t' ? getS2T()(text) : getT2S()(text);
}
