import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { RootLayout } from './routes/root';
import { LoginPage } from './routes/login';
import { JobsListPage } from './routes/jobs';
import { NewJobPage } from './routes/jobs.new';
import { JobDetailPage } from './routes/jobs.$id';

/**
 * 用 TanStack Router 的代码式 API（而不是文件路由 + @tanstack/router-plugin 的生成器）：
 * M1 页面数量少，手写路由树比额外接入一个构建插件更省事，行为完全一致。
 */
const rootRoute = createRootRoute({ component: RootLayout });

const jobsIndexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: JobsListPage });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const jobsNewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/jobs/new', component: NewJobPage });
const jobDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/jobs/$jobId', component: JobDetailPage });

const routeTree = rootRoute.addChildren([jobsIndexRoute, loginRoute, jobsNewRoute, jobDetailRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
