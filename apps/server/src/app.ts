import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import type { DB } from './db/client.js';
import type { AppConfig } from './config.js';
import { EventsBus } from './worker/events-bus.js';
import { Scheduler } from './worker/scheduler.js';
import { createRequireAuth } from './security/auth.js';
import { PINO_REDACT_PATHS } from './security/redact.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerServiceRoutes } from './routes/services.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerEventRoutes } from './routes/events.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerTokenRoutes } from './routes/tokens.js';

export interface BuildAppDeps {
  db: DB;
  config: AppConfig;
  bus?: EventsBus;
  scheduler?: Scheduler;
  logger?: boolean;
  publicDir?: string; // 前端静态产物目录，见 deploy/Dockerfile；测试时通常不传
}

export interface AppInstance {
  app: FastifyInstance;
  bus: EventsBus;
  scheduler: Scheduler;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function buildApp(deps: BuildAppDeps): Promise<AppInstance> {
  const { db, config } = deps;
  const bus = deps.bus ?? new EventsBus();
  const scheduler = deps.scheduler ?? new Scheduler(db, config, bus);

  const app = Fastify({
    logger: deps.logger === false ? false : { level: config.logLevel, redact: PINO_REDACT_PATHS },
  });

  await app.register(cookie, { secret: config.appSecret });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });

  const requireAuth = createRequireAuth(db, config);

  registerHealthRoute(app);
  registerAuthRoutes(app, db, config);
  registerServiceRoutes(app, db, config, requireAuth);
  registerJobRoutes(app, db, config, scheduler, requireAuth);
  registerEventRoutes(app, bus, requireAuth);
  registerProjectRoutes(app, db, scheduler, requireAuth);
  registerProfileRoutes(app, db, requireAuth);
  registerTokenRoutes(app, db, requireAuth);

  if (config.authMode === 'none') {
    app.log.warn('AUTH_MODE=none：认证已关闭，仅适用于只在可信内网访问的场景！');
  }

  // 前端静态产物（apps/web/dist，见 deploy/Dockerfile 把它复制到 ./public）：整个服务保持
  // 单进程单容器，由 Fastify 直接提供，不需要额外的 Node 服务。开发环境下前端由 Vite dev
  // server 单独启动并把 /api 代理过来，这里的 publicDir 通常不存在，跳过静态托管。
  const publicDir = deps.publicDir ?? resolve(process.cwd(), 'public');
  if (existsSync(publicDir)) {
    await app.register(staticPlugin, { root: publicDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api')) {
        return reply.code(404).send({ error: 'not-found', message: '接口不存在' });
      }
      return reply.sendFile('index.html');
    });
  }

  return { app, bus, scheduler };
}
