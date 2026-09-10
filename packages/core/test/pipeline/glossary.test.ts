import { describe, expect, it } from 'vitest';
import { extractGlossaryCandidates, parseGlossaryOutput } from '../../src/pipeline/glossary.js';
import { mockService } from '../../src/services/mock/index.js';
import { defaultHttpClient } from '../../src/services/http-client.js';
import type { TranslateService } from '../../src/services/types.js';

describe('parseGlossaryOutput', () => {
  it('解析标准 JSON 数组', () => {
    const result = parseGlossaryOutput('[{"source":"민수","target":"敏秀","type":"person","note":"男主角"}]');
    expect(result).toEqual([{ source: '민수', target: '敏秀', type: 'person', note: '男主角' }]);
  });

  it('去掉 Markdown 代码围栏，截取第一个完整数组', () => {
    const result = parseGlossaryOutput('```json\n[{"source":"a","target":"b","type":"other"}]\n```');
    expect(result).toHaveLength(1);
  });

  it('缺少 source/target 的元素被丢弃', () => {
    const result = parseGlossaryOutput('[{"source":"","target":"x"},{"source":"a","target":""}]');
    expect(result).toHaveLength(0);
  });

  it('type 不合法时回退为 other', () => {
    const result = parseGlossaryOutput('[{"source":"a","target":"b","type":"nonsense"}]');
    expect(result[0].type).toBe('other');
  });

  it('非 JSON 输入返回空数组，不抛异常', () => {
    expect(parseGlossaryOutput('抱歉，我不太理解')).toEqual([]);
  });

  it('空数组输出正确解析为空', () => {
    expect(parseGlossaryOutput('[]')).toEqual([]);
  });
});

describe('extractGlossaryCandidates', () => {
  it('服务不支持 chat 时返回空数组，不抛异常', async () => {
    const noChatService: TranslateService = { ...mockService, chat: undefined };
    const result = await extractGlossaryCandidates(['안녕'], noChatService, {
      config: {},
      http: defaultHttpClient,
    });
    expect(result).toEqual([]);
  });

  it('用 mock 服务返回固定候选术语，按 source 去重', async () => {
    const candidates = [
      { source: '민수', target: '敏秀', type: 'person' as const },
      { source: '민수', target: '重复', type: 'person' as const }, // 重复 source，应被去重
    ];
    const result = await extractGlossaryCandidates(['민수야 어디 가?'], mockService, {
      config: { mockGlossaryResponse: candidates },
      http: defaultHttpClient,
    });
    expect(result).toEqual([{ source: '민수', target: '敏秀', type: 'person' }]);
  });

  it('空文本输入直接返回空数组，不调用服务', async () => {
    const result = await extractGlossaryCandidates(['', '   '], mockService, {
      config: { mockGlossaryResponse: [{ source: 'x', target: 'y', type: 'other' as const }] },
      http: defaultHttpClient,
    });
    expect(result).toEqual([]);
  });

  it('按 chunkLines 分批调用', async () => {
    let callCount = 0;
    const countingService: TranslateService = {
      ...mockService,
      async chat(system, user, opts) {
        callCount++;
        return mockService.chat!(system, user, opts);
      },
    };
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i}`);
    await extractGlossaryCandidates(lines, countingService, { config: {}, http: defaultHttpClient }, { chunkLines: 10 });
    expect(callCount).toBe(3); // 25 行，每批10行 -> 3批
  });
});
