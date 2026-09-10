import { describe, expect, it } from 'vitest';
import { normalizePunctuation } from '../../src/postprocess/zh-rules.js';
import { reflow } from '../../src/postprocess/reflow.js';
import { checkReadingSpeed } from '../../src/postprocess/cps.js';
import { postprocessCue } from '../../src/postprocess/index.js';
import type { Cue } from '../../src/subtitle/model.js';

describe('normalizePunctuation', () => {
  it('去掉句末句号', () => {
    expect(normalizePunctuation('你好。')).toBe('你好');
    expect(normalizePunctuation('Hello.')).toBe('Hello');
  });
  it('问号叹号转全角', () => {
    expect(normalizePunctuation('你好吗?')).toBe('你好吗？');
    expect(normalizePunctuation('太好了!')).toBe('太好了！');
  });
  it('全角数字转半角', () => {
    expect(normalizePunctuation('第１２条')).toBe('第12条');
  });
  it('句中逗号替换为空格', () => {
    expect(normalizePunctuation('你好，世界')).toBe('你好 世界');
  });
});

describe('reflow', () => {
  it('不超过上限时不折行', () => {
    expect(reflow('短句子', 16)).toBe('短句子');
  });
  it('超出上限时在空格处折行', () => {
    const text = 'a'.repeat(10) + ' ' + 'b'.repeat(10);
    const out = reflow(text, 16);
    expect(out).toContain('\n');
    const [first, second] = out.split('\n');
    expect(first.length).toBeLessThanOrEqual(16);
    expect(second.length).toBeLessThanOrEqual(16);
  });
  it('多人对白按行独立折行，不打乱行结构', () => {
    const text = '- ' + 'a'.repeat(20) + '\n- 短';
    const out = reflow(text, 16);
    const lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('- 短');
  });
});

describe('checkReadingSpeed', () => {
  it('低于阈值不标记', () => {
    expect(checkReadingSpeed('你好', 0, 2000, 9)).toBe(false);
  });
  it('超过阈值标记为 true', () => {
    expect(checkReadingSpeed('一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十', 0, 1000, 9)).toBe(true);
  });
});

describe('postprocessCue', () => {
  function makeDoneCue(target: string, startMs = 0, endMs = 3000): Cue {
    return {
      id: 1,
      rawTime: 'x',
      startMs,
      endMs,
      meta: {},
      leadingTags: '',
      source: 'src',
      placeholders: [],
      translatable: true,
      target,
      status: 'done',
      flags: [],
    };
  }

  it('只处理 done 状态的条目', () => {
    const cue = { ...makeDoneCue('你好。'), status: 'skipped' as const, target: undefined };
    expect(postprocessCue(cue)).toEqual(cue);
  });

  it('对 done 条目应用标点规范与折行', () => {
    const cue = makeDoneCue('你好，世界。');
    const result = postprocessCue(cue);
    expect(result.target).toBe('你好 世界');
  });

  it('阅读速度超限时追加 cps-exceeded 标记', () => {
    const cue = makeDoneCue('一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十', 0, 1000);
    const result = postprocessCue(cue);
    expect(result.flags).toContain('cps-exceeded');
  });
});
