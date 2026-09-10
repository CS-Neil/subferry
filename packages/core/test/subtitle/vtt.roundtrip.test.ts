import { describe, expect, it } from 'vitest';
import { parseVtt, writeVtt } from '../../src/subtitle/vtt.js';

function roundtrip(raw: string) {
  const doc = parseVtt(raw);
  const out = writeVtt(doc);
  expect(out).toBe(raw);
  return doc;
}

describe('WebVTT 无损往返', () => {
  it('基本文件：WEBVTT 头 + 一条 cue', () => {
    const raw = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.500', '어디 가?', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues).toHaveLength(1);
    expect(doc.cues[0].source).toBe('어디 가?');
  });

  it('cue 标识（identifier）原样保留', () => {
    const raw = ['WEBVTT', '', 'intro-1', '00:00:01.000 --> 00:00:02.000', 'Hello', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].meta.vtt).toMatchObject({ identifier: 'intro-1' });
  });

  it('cue settings（position/line 等）随时间行整体保留', () => {
    const raw = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000 position:50% line:1', 'Hi', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].rawTime).toBe('00:00:01.000 --> 00:00:02.000 position:50% line:1');
  });

  it('多行字幕', () => {
    const raw = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Line one', 'Line two', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].source).toBe('Line one\nLine two');
  });

  it('NOTE 块原样保留（不解析其内容）', () => {
    const raw = [
      'WEBVTT',
      '',
      'NOTE 这是一个注释',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'Hello',
      '',
    ].join('\n');
    roundtrip(raw);
  });

  it('没有小时位的时间戳也能正确解析毫秒', () => {
    const raw = ['WEBVTT', '', '01:02.345 --> 01:05.000', 'x', ''].join('\n');
    const doc = parseVtt(raw);
    expect(doc.cues[0].startMs).toBe(62345);
    expect(doc.cues[0].endMs).toBe(65000);
  });

  it('CRLF 换行', () => {
    const raw = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Ciao', ''].join('\r\n');
    roundtrip(raw);
  });

  it('没有结尾换行也能还原', () => {
    const raw = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Hello'].join('\n');
    roundtrip(raw);
  });

  it('多条 cue，之间用两个空行分隔也能还原', () => {
    const raw = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'A',
      '',
      '',
      '00:00:03.000 --> 00:00:04.000',
      'B',
      '',
    ].join('\n');
    roundtrip(raw);
  });
});
