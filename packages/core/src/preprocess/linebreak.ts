/**
 * 换行处理（readme.md 4.3）：
 * - 单人台词的多行内容先合并为一行再翻译，之后按中文规则重新折行（postprocess/reflow.ts）。
 * - 如果每一行都以 "-" 开头，说明是多人对白，保留原有的行结构，连同 "- " 前缀一起交给模型
 *   （提示词第 6 条要求模型保留 "- " 并用 \n 分行）。
 */
export interface MergeLinesResult {
  text: string; // 送去翻译的文本
  isDialogue: boolean; // true 表示保留了多行结构（多人对白），false 表示已合并为一行
}

export function mergeLines(rawText: string): MergeLinesResult {
  const lines = rawText.split('\n');
  if (lines.length <= 1) {
    return { text: rawText, isDialogue: false };
  }

  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const isDialogue = nonEmpty.length > 0 && nonEmpty.every((l) => l.trim().startsWith('-'));
  if (isDialogue) {
    return { text: rawText, isDialogue: true };
  }

  return { text: lines.map((l) => l.trim()).join(' '), isDialogue: false };
}
