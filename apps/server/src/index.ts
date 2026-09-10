import { join } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { users } from './db/schema.js';
import { buildApp } from './app.js';
import { recoverInterruptedJobs } from './worker/recovery.js';
import { hashPassword, isInitialized } from './security/auth.js';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 20_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = openDb({ file: join(config.dataDir, 'subferry.db') });

  // AUTH_MODE=single 且设置了 ADMIN_PASSWORD 时自动创建管理员账号（readme.md 7.4）；
  // 否则前端首次访问会进入初始化页面，调用 POST /api/auth/init 手动设置。
  if (config.adminPassword && !isInitialized(db)) {
    const passwordHash = await hashPassword(config.adminPassword);
    db.insert(users)
      .values({ username: 'admin', passwordHash, role: 'admin', createdAt: new Date().toISOString() })
      .run();
  }

  const recoveredCount = recoverInterruptedJobs(db);

  const { app, scheduler } = await buildApp({ db, config });
  if (recoveredCount > 0) {
    app.log.info(`启动恢复：${recoveredCount} 个中断的任务已重新排队`);
  }
  scheduler.poke();

  await app.listen({ port: config.port, host: '0.0.0.0' });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`收到 ${signal}，开始优雅退出（最多等待 ${GRACEFUL_SHUTDOWN_TIMEOUT_MS / 1000} 秒）`);
    await scheduler.shutdown(GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
