import { describe, expect, it } from 'vitest';
import { parseAss, writeAss } from '../../src/subtitle/ass.js';

/**
 * 硬性回归基准（readme.md 4.2），与 SRT 一样：不经翻译直接"解析 → 写出"必须与输入逐字节一致。
 */
function roundtrip(raw: string) {
  const doc = parseAss(raw);
  const out = writeAss(doc);
  expect(out).toBe(raw);
  return doc;
}

const HEADER_LINES = [
  '[Script Info]',
  'Title: Test',
  'ScriptType: v4.00+',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
];
const HEADER = HEADER_LINES.join('\n');

describe('ASS 无损往返', () => {
  it('基本对话行', () => {
    const raw = [HEADER, 'Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,어디 가?', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues).toHaveLength(1);
    expect(doc.cues[0].source).toBe('어디 가?');
    expect(doc.cues[0].translatable).toBe(true);
  });

  it('Comment 行原样保留，不参与翻译', () => {
    const raw = [
      HEADER,
      'Comment: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,这是注释',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,안녕',
      '',
    ].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues).toHaveLength(2);
    expect(doc.cues[0].translatable).toBe(false);
    expect(doc.cues[0].status).toBe('skipped');
    expect(doc.cues[1].translatable).toBe(true);
  });

  it('Text 字段本身含逗号，切分时不会被打断', () => {
    const raw = [HEADER, 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,你好, 世界, 再见', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].source).toBe('你好, 世界, 再见');
  });

  it('\\N 转换为内部换行，写出时转换回来', () => {
    const raw = [HEADER, 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,第一行\\N第二行', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].source).toBe('第一行\n第二行');
  });

  it('行内标签原样保留在 source 里（预处理阶段才会占位符化）', () => {
    const raw = [HEADER, 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8}Hello {\\i1}World{\\i0}', ''].join(
      '\n',
    );
    const doc = roundtrip(raw);
    expect(doc.cues[0].source).toBe('{\\an8}Hello {\\i1}World{\\i0}');
  });

  it('Name/Actor 字段作为 speaker', () => {
    const raw = [HEADER, 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,민수,0,0,0,,어디 가?', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].speaker).toBe('민수');
  });

  it('Style 字段透传到 meta.style，供 skipStyles 使用', () => {
    const raw = [HEADER, 'Dialogue: 0,0:00:01.00,0:00:02.00,OP,,0,0,0,,Opening Theme', ''].join('\n');
    const doc = roundtrip(raw);
    expect(doc.cues[0].meta.style).toBe('OP');
  });

  it('CRLF 换行', () => {
    const raw = [...HEADER_LINES, 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Ciao', ''].join('\r\n');
    roundtrip(raw);
  });

  it('多个空行/尾随内容原样保留', () => {
    const raw = [
      HEADER,
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,A',
      '',
      '',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,B',
      '',
    ].join('\n');
    roundtrip(raw);
  });

  it('小写 dialogue/comment 前缀也能逐字写回', () => {
    const raw = [HEADER, 'dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,test', ''].join('\n');
    roundtrip(raw);
  });

  it('startMs/endMs 从 Start/End 字段正确解析', () => {
    const raw = [HEADER, 'Dialogue: 0,0:01:02.34,0:01:05.00,Default,,0,0,0,,x', ''].join('\n');
    const doc = parseAss(raw);
    expect(doc.cues[0].startMs).toBe(62340);
    expect(doc.cues[0].endMs).toBe(65000);
  });
});
