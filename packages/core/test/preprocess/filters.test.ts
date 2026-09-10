import { describe, expect, it } from 'vitest';
import { classifyCue } from '../../src/preprocess/filters.js';

describe('classifyCue', () => {
  it('空文本标记为 skipped(empty)', () => {
    expect(classifyCue('   ')).toEqual({ translatable: false, reason: 'empty' });
  });

  it('纯音乐符号行标记为 skipped(music)', () => {
    expect(classifyCue('♪ ~ ♪')).toEqual({ translatable: false, reason: 'music' });
  });

  it('含文字的音乐行仍然可翻译', () => {
    expect(classifyCue('♪ 사랑해 ♪')).toEqual({ translatable: true });
  });

  it('带 \\\\k 卡拉OK特效的行标记为 skipped(karaoke)', () => {
    expect(classifyCue('{\\k50}안{\\k30}녕')).toEqual({ translatable: false, reason: 'karaoke' });
  });

  it('用户排除的样式标记为 skipped(skipped-style)', () => {
    expect(classifyCue('OP Theme', { style: 'OP', skipStyles: ['OP', 'ED'] })).toEqual({
      translatable: false,
      reason: 'skipped-style',
    });
  });

  it('普通文本可翻译', () => {
    expect(classifyCue('어디 가?')).toEqual({ translatable: true });
  });
});
