/**
 * 折行（readme.md 4.8）：每行字数上限默认 16 字，超出时在接近中点的空格或标点处折行。
 * 按 \n 分行独立处理，这样多人对白（每行以 "- " 开头）的行结构不会被打乱。
 * M1 只做一次拆分（一行拆成两行）；极长的单行文本需要多级折行是较少见的场景，留作后续增强。
 */
const BREAK_CHARS = /[\s，,。.！!？?、]/;

function reflowLine(line: string, maxCharsPerLine: number): string {
  if (line.length <= maxCharsPerLine) return line;

  const mid = Math.floor(line.length / 2);
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 1; i < line.length - 1; i++) {
    if (BREAK_CHARS.test(line[i])) {
      const dist = Math.abs(i - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  }

  if (bestIdx === -1) {
    // 找不到合适的标点/空格，退回中点硬切
    return `${line.slice(0, mid)}\n${line.slice(mid)}`;
  }

  const isSpace = /\s/.test(line[bestIdx]);
  const cut = isSpace ? bestIdx : bestIdx + 1; // 标点留在上一行末尾，空格本身丢弃
  return `${line.slice(0, cut).trimEnd()}\n${line.slice(cut).trimStart()}`;
}

export function reflow(text: string, maxCharsPerLine = 16): string {
  return text
    .split('\n')
    .map((line) => reflowLine(line, maxCharsPerLine))
    .join('\n');
}
