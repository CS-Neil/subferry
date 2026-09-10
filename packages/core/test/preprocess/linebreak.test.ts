import { describe, expect, it } from 'vitest';
import { mergeLines } from '../../src/preprocess/linebreak.js';

describe('mergeLines', () => {
  it('单行文本不变', () => {
    expect(mergeLines('Hello')).toEqual({ text: 'Hello', isDialogue: false });
  });

  it('单人多行台词合并为一行', () => {
    const result = mergeLines('Hello\nWorld');
    expect(result.isDialogue).toBe(false);
    expect(result.text).toBe('Hello World');
  });

  it('每行都以 - 开头时保留多行结构（多人对白）', () => {
    const raw = '- 你好\n- 你好吗';
    const result = mergeLines(raw);
    expect(result.isDialogue).toBe(true);
    expect(result.text).toBe(raw);
  });

  it('只有部分行以 - 开头时不算多人对白，按普通多行合并', () => {
    const result = mergeLines('- 你好\n继续说话');
    expect(result.isDialogue).toBe(false);
    expect(result.text).toBe('- 你好 继续说话');
  });
});
