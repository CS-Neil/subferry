import { describe, expect, it } from 'vitest';
import { stripTags, restoreTags, countPlaceholders, stripPlaceholderMarkers } from '../../src/preprocess/tags.js';

describe('stripTags / restoreTags 往返', () => {
  it('剥离行首标签块，行内标签占位符化', () => {
    const { leadingTags, source, placeholders } = stripTags('{\\an8}<i>Hello</i> World');
    expect(leadingTags).toBe('{\\an8}');
    expect(source).toBe('⟨1⟩Hello⟨2⟩ World');
    expect(placeholders).toEqual(['<i>', '</i>']);
  });

  it('还原后与原文语义等价（占位符替换回真实标签）', () => {
    const { leadingTags, source, placeholders } = stripTags('{\\an8}<i>Hello</i> World');
    // 假设模型只是原样保留占位符，未真正翻译
    const restored = restoreTags(source, placeholders, leadingTags);
    expect(restored).toBe('{\\an8}<i>Hello</i> World');
  });

  it('占位符编号在翻译后仍能正确映射回原标签', () => {
    const { placeholders } = stripTags('<i>안녕</i>');
    const translated = '⟨1⟩你好⟨2⟩'; // 假设 </i> 是第二个占位符
    // 用第一个例子验证顺序
    expect(placeholders[0]).toBe('<i>');
    const restored = restoreTags(translated, ['<i>', '</i>'], '');
    expect(restored).toBe('<i>你好</i>');
  });

  it('countPlaceholders 返回排序后的编号集合', () => {
    expect(countPlaceholders('⟨2⟩text⟨1⟩')).toEqual([1, 2]);
  });

  it('stripPlaceholderMarkers 去除占位符标记，只保留 leadingTags（降级路径）', () => {
    const result = stripPlaceholderMarkers('⟨1⟩你好⟨2⟩', '{\\an8}');
    expect(result).toBe('{\\an8}你好');
  });

  it('没有标签的纯文本保持不变', () => {
    const { leadingTags, source, placeholders } = stripTags('안녕하세요');
    expect(leadingTags).toBe('');
    expect(source).toBe('안녕하세요');
    expect(placeholders).toEqual([]);
  });
});
