import { describe, expect, it } from 'vitest';
import { makeBilingualText } from '../../src/postprocess/bilingual.js';

describe('makeBilingualText', () => {
  it('zh-top：中文在上，原文在下', () => {
    expect(makeBilingualText('你好', 'Hello', 'zh-top', 'srt')).toBe('你好\nHello');
  });

  it('src-top：原文在上，中文在下', () => {
    expect(makeBilingualText('你好', 'Hello', 'src-top', 'srt')).toBe('Hello\n你好');
  });

  it('ASS 格式给原文加缩放样式', () => {
    const result = makeBilingualText('你好', 'Hello', 'zh-top', 'ass');
    expect(result).toBe('你好\n{\\fscx70\\fscy70}Hello{\\r}');
  });

  it('SRT/VTT 不加样式', () => {
    expect(makeBilingualText('你好', 'Hello', 'zh-top', 'vtt')).toBe('你好\nHello');
  });
});
