/**
 * 日志脱敏（readme.md 7.4）：自动脱敏 Authorization 头和密钥字段。
 */
export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const SENSITIVE_KEY = /apikey|secret|password|token|authorization/i;

/** 递归脱敏一个对象里键名匹配敏感模式的字段，用于手写日志（例如打印服务实例配置）时兜底。 */
export function redactObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactObject(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[Redacted]' : redactObject(v);
  }
  return out as T;
}
