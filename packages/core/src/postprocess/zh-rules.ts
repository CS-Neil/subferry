/**
 * 标点规范（readme.md 4.8）：去掉句末句号；句中逗号可替换为空格；问号、叹号使用全角；数字使用半角。
 */
export function normalizePunctuation(text: string): string {
  let out = text;
  // 句中逗号（，或 ,）替换为空格（保留最后一个字符处的逗号判断在下面的"句末"逻辑之前处理）
  out = out.replace(/[，,]/g, ' ').replace(/ {2,}/g, ' ').trim();
  // 问号、叹号统一为全角
  out = out.replace(/\?/g, '？').replace(/!/g, '！');
  // 数字统一为半角（把全角数字 ０-９ 转回半角）
  out = out.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 去掉句末句号（中文句号、英文句号），问号/叹号结尾不受影响
  out = out.replace(/[。.]+$/g, '');
  return out;
}
