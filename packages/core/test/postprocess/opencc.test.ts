import { describe, expect, it } from 'vitest';
import { convertOpenCC } from '../../src/postprocess/opencc.js';

describe('convertOpenCC', () => {
  it('none 模式不改动文本', () => {
    expect(convertOpenCC('简体字', 'none')).toBe('简体字');
  });

  it('s2t 把简体转换为繁体', () => {
    const result = convertOpenCC('汉字', 's2t');
    expect(result).not.toBe('汉字');
    expect(result).toBe('漢字');
  });

  it('t2s 把繁体转换为简体', () => {
    const result = convertOpenCC('漢字', 't2s');
    expect(result).toBe('汉字');
  });

  it('空字符串直接返回', () => {
    expect(convertOpenCC('', 's2t')).toBe('');
  });
});
