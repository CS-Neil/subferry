import { eq } from 'drizzle-orm';
import type { ServiceInstanceView } from '@subferry/shared';
import type { DB } from './client.js';
import { serviceInstances } from './schema.js';
import { encrypt, decrypt, maskSecret } from '../security/crypto.js';

export type ServiceInstanceRow = typeof serviceInstances.$inferSelect;

export function listServiceInstanceRows(db: DB): ServiceInstanceRow[] {
  return db.select().from(serviceInstances).all();
}

export function getServiceInstanceRow(db: DB, id: string): ServiceInstanceRow | undefined {
  return db.select().from(serviceInstances).where(eq(serviceInstances.id, id)).get();
}

/** 解密后的完整配置（含明文密钥），只供服务端内部发起真实请求时使用，绝不通过接口返回。 */
export function loadFullConfig(row: ServiceInstanceRow, appSecret: string): Record<string, unknown> {
  const nonSecret = JSON.parse(row.configJson) as Record<string, unknown>;
  const secret = row.secretEnc ? (JSON.parse(decrypt(row.secretEnc, appSecret)) as Record<string, unknown>) : {};
  return { ...nonSecret, ...secret };
}

/** 接口返回给前端的视图：密钥字段脱敏为 sk-****abcd 形式（readme.md 第6章）。 */
export function toServiceInstanceView(row: ServiceInstanceRow, appSecret: string): ServiceInstanceView {
  const nonSecret = JSON.parse(row.configJson) as Record<string, unknown>;
  let masked: Record<string, unknown> = {};
  if (row.secretEnc) {
    try {
      const secret = JSON.parse(decrypt(row.secretEnc, appSecret)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(secret)) {
        masked[k] = typeof v === 'string' ? maskSecret(v) : '****';
      }
    } catch {
      // APP_SECRET 变更过导致解密失败：不阻断展示，密钥字段留空即可，用户需要重新填写
      masked = {};
    }
  }
  return {
    id: row.id,
    serviceName: row.serviceName,
    displayName: row.displayName,
    config: { ...nonSecret, ...masked },
    rpm: row.rpm,
    maxConcurrency: row.maxConcurrency,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}

export function splitConfigForStorage(
  config: Record<string, unknown>,
  secretKeys: Set<string>,
  appSecret: string,
): { configJson: string; secretEnc: string | null } {
  const nonSecret: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secretKeys.has(k)) secret[k] = v;
    else nonSecret[k] = v;
  }
  const secretEnc = Object.keys(secret).length > 0 ? encrypt(JSON.stringify(secret), appSecret) : null;
  return { configJson: JSON.stringify(nonSecret), secretEnc };
}

export function deleteServiceInstance(db: DB, id: string): void {
  db.delete(serviceInstances).where(eq(serviceInstances.id, id)).run();
}
