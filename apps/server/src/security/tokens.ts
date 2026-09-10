import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** API Token 的生成与哈希（readme.md 7.2/7.4）：只存哈希值，明文只在创建时返回一次。 */
const TOKEN_PREFIX = 'sf_';

export function generateApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isApiTokenFormat(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length > TOKEN_PREFIX.length + 16;
}

export function safeEqualHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
