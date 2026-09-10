import { describe, expect, it } from 'vitest';
import { parseModelOutput, validateBatch, isRefusal, residualSourceRatio } from '../../src/pipeline/validator.js';
import type { Cue } from '../../src/subtitle/model.js';

function makeCue(id: number, source: string, placeholders: string[] = [], leadingTags = ''): Cue {
  return {
    id,
    rawTime: 'x',
    startMs: 0,
    endMs: 1000,
    meta: {},
    leadingTags,
    source,
    placeholders,
    translatable: true,
    status: 'pending',
    flags: [],
  };
}

describe('parseModelOutput', () => {
  it('解析标准 JSON', () => {
    const r = parseModelOutput('{"1":"你好"}');
    expect(r).toEqual({ ok: true, data: { '1': '你好' } });
  });

  it('去掉 Markdown 代码围栏', () => {
    const r = parseModelOutput('```json\n{"1":"你好"}\n```');
    expect(r.ok).toBe(true);
  });

  it('截取第一个完整 JSON 对象，忽略前后多余文字', () => {
    const r = parseModelOutput('这是结果：{"1":"你好"} 谢谢');
    expect(r).toEqual({ ok: true, data: { '1': '你好' } });
  });

  it('非 JSON 输入返回失败', () => {
    expect(parseModelOutput('没有json').ok).toBe(false);
  });

  it('数组不算合法对象', () => {
    expect(parseModelOutput('[1,2,3]').ok).toBe(false);
  });
});

describe('isRefusal', () => {
  it('识别常见拒答话术', () => {
    expect(isRefusal("I'm sorry, but I cannot translate this content.")).toBe(true);
    expect(isRefusal('抱歉，我无法翻译这段内容。')).toBe(true);
  });
  it('正常译文不误判', () => {
    expect(isRefusal('{"1":"你好"}')).toBe(false);
  });
});

describe('residualSourceRatio', () => {
  it('韩语源：中文译文中残留大量谚文视为未翻译', () => {
    expect(residualSourceRatio('어디 가?', 'ko')).toBeGreaterThan(0.4);
    expect(residualSourceRatio('你要去哪', 'ko')).toBe(0);
  });
  it('意大利语源：残留大量拉丁字母视为未翻译', () => {
    expect(residualSourceRatio('Come stai oggi', 'it')).toBeGreaterThan(0.4);
    expect(residualSourceRatio('你今天怎么样', 'it')).toBe(0);
  });
});

describe('validateBatch', () => {
  it('正常情况：全部接受，占位符正确还原', () => {
    const cue = makeCue(1, '⟨1⟩你好', ['<i>'], '');
    const raw = JSON.stringify({ '1': '⟨1⟩你好' });
    const result = validateBatch(raw, [cue], { from: 'ko' });
    expect(result.accepted.get(1)?.text).toBe('<i>你好');
    expect(result.needsRetry.size).toBe(0);
  });

  it('缺失 id 进入补译', () => {
    const cue = makeCue(1, '你好');
    const result = validateBatch('{}', [cue], { from: 'ko' });
    expect(result.needsRetry.get(1)).toBe('missing-id');
  });

  it('多余 id 被丢弃并记录', () => {
    const cue = makeCue(1, 'hi');
    const result = validateBatch(JSON.stringify({ '1': '你好', '99': '多余的' }), [cue], { from: 'ko' });
    expect(result.extraIds).toEqual([99]);
    expect(result.accepted.get(1)?.text).toBe('你好');
  });

  it('空译文进入补译', () => {
    const cue = makeCue(1, 'hi');
    const result = validateBatch(JSON.stringify({ '1': '   ' }), [cue], { from: 'ko' });
    expect(result.needsRetry.get(1)).toBe('empty');
  });

  it('占位符数量不一致时回退去除行内样式并打标记', () => {
    const cue = makeCue(1, '⟨1⟩你好⟨2⟩', ['<i>', '</i>'], '');
    const raw = JSON.stringify({ '1': '⟨1⟩你好' }); // 缺了一个占位符
    const result = validateBatch(raw, [cue], { from: 'ko' });
    const accepted = result.accepted.get(1)!;
    expect(accepted.flags).toContain('bad-placeholder');
    expect(accepted.text).toBe('你好'); // 占位符标记被去掉，不强行拼回标签
  });

  it('拒答整批标记为 refused', () => {
    const cue = makeCue(1, 'hi');
    const result = validateBatch("I'm sorry, but I cannot help with that.", [cue], { from: 'ko' });
    expect(result.refused).toBe(true);
    expect(result.needsRetry.get(1)).toBe('refused');
  });

  it('长度比例异常只打标记，不进入补译', () => {
    const cue = makeCue(1, '这是一句比较长的原文用来测试长度比例');
    const result = validateBatch(JSON.stringify({ '1': '短' }), [cue], { from: 'ko' });
    expect(result.needsRetry.size).toBe(0);
    expect(result.accepted.get(1)?.flags).toContain('length-mismatch');
  });
});
