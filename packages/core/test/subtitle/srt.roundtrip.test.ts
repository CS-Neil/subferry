import { describe, expect, it } from 'vitest';
import { parseSrt, writeSrt } from '../../src/subtitle/srt.js';

/**
 * 硬性回归基准（readme.md 4.2）：不经翻译直接“解析 → 写出”，结果必须与输入逐字节一致。
 * 这里的每个样本都要求 writeSrt(parseSrt(raw)) === raw。
 */
function roundtrip(raw: string) {
  const doc = parseSrt(raw);
  const out = writeSrt(doc);
  expect(out).toBe(raw);
  return doc;
}

describe('SRT 无损往返', () => {
  it('标准 LF、末尾带换行的单行字幕', () => {
    const raw = '1\n00:00:01,000 --> 00:00:02,500\n어디 가?\n\n2\n00:00:03,000 --> 00:00:04,000\n집에 가.\n';
    roundtrip(raw);
  });

  it('CRLF 换行', () => {
    const raw =
      '1\r\n00:00:01,000 --> 00:00:02,500\r\nCiao\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nCome stai?\r\n';
    roundtrip(raw);
  });

  it('多行台词、行内标签 <i>，末尾无换行', () => {
    const raw = '1\n00:00:01,000 --> 00:00:03,000\n<i>Hello</i>\nWorld';
    const doc = roundtrip(raw);
    expect(doc.cues[0].source).toBe('<i>Hello</i>\nWorld');
  });

  it('多人对白（- 开头）保留行结构', () => {
    const raw = '1\n00:00:01,000 --> 00:00:03,000\n- 你好\n- 你好吗\n';
    roundtrip(raw);
  });

  it('字幕间有两个空行的情形也能精确还原', () => {
    const raw = '1\n00:00:01,000 --> 00:00:02,000\nA\n\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n';
    roundtrip(raw);
  });

  it('时间行带位置坐标信息时原样保留', () => {
    const raw = '1\n00:00:01,000 --> 00:00:02,000 X1:100 X2:200 Y1:50 Y2:80\n字幕\n';
    const doc = roundtrip(raw);
    expect(doc.cues[0].rawTime).toBe('00:00:01,000 --> 00:00:02,000 X1:100 X2:200 Y1:50 Y2:80');
  });

  it('原始序号不连续时也逐字写回（而不是重新编号）', () => {
    const raw = '5\n00:00:01,000 --> 00:00:02,000\nA\n\n8\n00:00:03,000 --> 00:00:04,000\nB\n';
    roundtrip(raw);
  });

  it('纯音乐符号行原样保留', () => {
    const raw = '1\n00:00:01,000 --> 00:00:02,000\n♪ ~ ♪\n';
    roundtrip(raw);
  });

  it('空字符串输入往返为空字符串', () => {
    roundtrip('');
  });

  it('startMs/endMs 从时间行中正确解析（供分批与阅读速度计算使用）', () => {
    const raw = '1\n00:01:02,345 --> 00:01:05,000\nx\n';
    const doc = parseSrt(raw);
    expect(doc.cues[0].startMs).toBe(62345);
    expect(doc.cues[0].endMs).toBe(65000);
  });

  it('id 从 1 开始按文档顺序连续编号，供发给模型使用', () => {
    const raw = '5\n00:00:01,000 --> 00:00:02,000\nA\n\n8\n00:00:03,000 --> 00:00:04,000\nB\n';
    const doc = parseSrt(raw);
    expect(doc.cues.map((c) => c.id)).toEqual([1, 2]);
  });
});
