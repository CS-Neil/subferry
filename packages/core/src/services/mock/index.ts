import type { CallOptions, BatchRequest, TranslateService } from '../types.js';
import { ServiceHttpError } from '../types.js';

/**
 * 内置 mock 翻译服务，双重用途（见 packages/core/test/services/mock.test.ts 与
 * pipeline 故障注入测试）：
 *
 * 1. 生产可选的真实服务类型：配置几乎为空（可选前缀），译文 = 前缀 + 原文。
 *    这让端到端验证完全不需要真实 API Key（apps/server 的"测试连接"接口对 mock 类型必定成功）。
 * 2. 故障注入：通过 config.faults 声明要模拟的故障类型，config.failTimes 控制故障只在
 *    前 N 次调用中触发（之后恢复正常，用于验证"重试后恢复"的路径）；不设置则每次都触发
 *    （用于验证"最终标记失败"的路径）。
 */
export type MockFault =
  | 'missing-id'
  | 'merge-ids'
  | 'empty'
  | 'bad-placeholder'
  | 'non-json'
  | 'refuse'
  | 'rate-limit-429'
  | 'timeout';

export interface MockCallCounter {
  count: number;
}

export interface MockConfig {
  prefix?: string;
  faults?: MockFault[];
  failTimes?: number;
  counter?: MockCallCounter; // 由测试代码创建并传入，用于断言调用次数（例如验证重启恢复不重复调用）
}

/**
 * 生成"看起来像译文"的假翻译：保留占位符 ⟨N⟩、数字、空白和 "-"（多人对白前缀、prompt 规则6
 * 要求保留），其余文字替换成中文字符。这样默认（无故障）输出既能证明占位符在整条链路中被正确
 * 保留/还原，又不会被 validator.ts 的"残留原文"校验（检测韩文谚文/大段拉丁字母占比）误判为
 * 未翻译——如果直接原样回显原文，对真实的韩语/意大利语源文本会被正确地判定为"没有翻译"，
 * 这不是 bug，而是校验规则在如实工作，所以 mock 需要产出真正"不含源语言文字"的假译文。
 */
function mockTranslate(text: string, prefix: string): string {
  const body = text.replace(/[^\s⟨⟩0-9-]+/gu, (run) => '译'.repeat(Math.min(run.length, 4)));
  return `${prefix}${body}`;
}

export const mockService: TranslateService = {
  info: {
    name: 'mock',
    displayName: '模拟服务（测试用）',
    capabilities: { batch: true, jsonMode: true, stream: false, maxBatchSize: 60 },
    configSchema: [
      { key: 'prefix', label: '译文前缀', type: 'string', default: '【译】', secret: false, required: false },
    ],
  },
  Language: { zh_cn: 'Chinese (Simplified)', ko: 'Korean', it: 'Italian', en: 'English' },

  async translate(text, _from, _to, opts) {
    const config = (opts.config ?? {}) as MockConfig;
    return `${config.prefix ?? '【译】'}${text}`;
  },

  async translateBatch(req: BatchRequest, opts: CallOptions) {
    const config = (opts.config ?? {}) as MockConfig;
    const counter = config.counter ?? { count: 0 };
    counter.count += 1;

    const withinFaultWindow = counter.count <= (config.failTimes ?? Infinity);
    const fault = withinFaultWindow ? config.faults?.[0] : undefined;

    if (fault === 'timeout') {
      await new Promise<never>((_resolve, reject) => {
        if (opts.signal?.aborted) {
          reject(new Error('aborted'));
          return;
        }
        opts.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    if (fault === 'rate-limit-429') {
      throw new ServiceHttpError('mock: 429 Too Many Requests', 429, 50);
    }
    if (fault === 'refuse') {
      return "I'm sorry, but I cannot translate this content.";
    }
    if (fault === 'non-json') {
      return 'sorry, here is your translation but not as json';
    }

    const prefix = config.prefix ?? '【译】';
    const entries: Record<string, string> = {};
    for (const item of req.items) {
      entries[String(item.id)] = mockTranslate(item.text, prefix);
    }

    if (fault === 'missing-id' && req.items.length > 0) {
      delete entries[String(req.items[0].id)];
    }
    if (fault === 'merge-ids' && req.items.length > 1) {
      const [a, b] = req.items;
      entries[String(a.id)] = `${mockTranslate(a.text, prefix)} ${mockTranslate(b.text, '')}`;
      delete entries[String(b.id)];
    }
    if (fault === 'empty' && req.items.length > 0) {
      entries[String(req.items[0].id)] = '';
    }
    if (fault === 'bad-placeholder' && req.items.length > 0) {
      entries[String(req.items[0].id)] = `${entries[String(req.items[0].id)]}⟨99⟩`;
    }

    return JSON.stringify(entries);
  },
};
