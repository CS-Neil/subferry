import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * 服务实例密钥字段的加密（readme.md 7.4）：AES-256-GCM，主密钥来自环境变量 APP_SECRET。
 * APP_SECRET 长度不固定，这里用 SHA-256 派生出固定的 32 字节密钥。
 *
 * 密文格式：`ivBase64:tagBase64:cipherBase64`，方便存成单个 TEXT 字段。
 */
function deriveKey(appSecret: string): Buffer {
  return createHash('sha256').update(appSecret, 'utf8').digest();
}

export function encrypt(plain: string, appSecret: string): string {
  const key = deriveKey(appSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(encoded: string, appSecret: string): string {
  const [ivB64, tagB64, cipherB64] = encoded.split(':');
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error('密文格式不正确');
  }
  const key = deriveKey(appSecret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]);
  return plain.toString('utf8');
}

/** 把密钥脱敏为 sk-****abcd 形式，接口返回时使用，永不回显明文。 */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return '****';
  return `${plain.slice(0, 3)}${'*'.repeat(4)}${plain.slice(-4)}`;
}
