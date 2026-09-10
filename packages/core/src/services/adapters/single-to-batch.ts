import type { BatchRequest, CallOptions, TranslateService } from '../types.js';

/**
 * 把只实现了 translate() 的服务适配出一个 translateBatch()：逐条调用后拼装成 id-JSON 字符串。
 * M1 的两个内置服务（openai、mock）都原生实现了 translateBatch，这个适配器暂时用不到，
 * 是为 M3 的 Claude/Gemini/DeepL 等单条接口服务预留的扩展点。
 */
export function adaptSingleToBatch(service: TranslateService): NonNullable<TranslateService['translateBatch']> {
  return async function translateBatch(req: BatchRequest, opts: CallOptions): Promise<string> {
    const entries: Record<string, string> = {};
    for (const item of req.items) {
      entries[String(item.id)] = await service.translate(item.text, req.from, req.to, opts);
    }
    return JSON.stringify(entries);
  };
}
