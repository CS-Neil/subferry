/**
 * 前端"源语言"下拉框用的常见语言列表，以及语言键到人类可读名称的映射（用于渲染提示词里的
 * $from/$to，见 packages/core/src/prompts/default.ts 的调用方）。key 与 packages/core 的
 * LangKey 是同一套字符串（不强制枚举，未来遇到列表之外的语言时后端仍然接受任意字符串）。
 */
export interface LanguageOption {
  value: string;
  label: string;
}

export const SOURCE_LANGUAGES: LanguageOption[] = [
  { value: 'ko', label: '韩语' },
  { value: 'ja', label: '日语' },
  { value: 'en', label: '英语' },
  { value: 'it', label: '意大利语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'es', label: '西班牙语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'ru', label: '俄语' },
  { value: 'th', label: '泰语' },
  { value: 'vi', label: '越南语' },
  { value: 'id', label: '印尼语' },
  { value: 'ar', label: '阿拉伯语' },
  { value: 'hi', label: '印地语' },
  { value: 'zh_cn', label: '中文' },
];

export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  SOURCE_LANGUAGES.map((l) => [l.value, l.label]),
);
