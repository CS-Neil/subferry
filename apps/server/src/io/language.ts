import { franc } from 'franc-min';

/**
 * 语言检测（readme.md 4.1）：对全片文本抽样后用 franc-min 检测，结果用于自动填写源语言，
 * 用户可以修改。franc 返回 ISO 639-3 代码，这里只映射 M1 用得到的几种。
 */
const FRANC_TO_LANG_KEY: Record<string, string> = {
  kor: 'ko',
  ita: 'it',
  eng: 'en',
  jpn: 'ja',
  cmn: 'zh_cn',
};

export function detectLanguage(sampleText: string): string | undefined {
  const code = franc(sampleText, { minLength: 10 });
  if (code === 'und') return undefined;
  return FRANC_TO_LANG_KEY[code] ?? code;
}
