export type AuthMode = 'single' | 'multi' | 'none';

export interface AppConfig {
  port: number;
  dataDir: string;
  appSecret: string;
  authMode: AuthMode;
  adminPassword?: string;
  baseUrl?: string;
  maxActiveJobs: number;
  logLevel: string;
  tz: string;
}

/**
 * 从环境变量加载配置（对应 readme.md 10.1）。M1 只读取表中列出的一部分变量；
 * FILE_RETENTION_DAYS / WATCH_ROOTS / HTTPS_PROXY 等是 M2/M3 才生效的变量，暂不读取。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appSecret = env.APP_SECRET;
  if (!appSecret || Buffer.byteLength(appSecret, 'utf8') < 32) {
    throw new Error(
      'APP_SECRET 未设置或长度不足 32 字节（用于加密服务实例密钥、签名会话）。' +
        '生成方法：openssl rand -base64 48',
    );
  }

  const authMode = (env.AUTH_MODE ?? 'single') as AuthMode;
  if (!['single', 'multi', 'none'].includes(authMode)) {
    throw new Error(`AUTH_MODE 取值非法：${authMode}，应为 single / multi / none`);
  }

  return {
    port: Number(env.PORT ?? 8080),
    dataDir: env.DATA_DIR ?? './data',
    appSecret,
    authMode,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    baseUrl: env.BASE_URL || undefined,
    maxActiveJobs: Number(env.MAX_ACTIVE_JOBS ?? 2),
    logLevel: env.LOG_LEVEL ?? 'info',
    tz: env.TZ ?? 'UTC',
  };
}
