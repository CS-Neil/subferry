import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { RootLayout } from './routes/root';
import { LoginPage } from './routes/login';
import { JobsListPage } from './routes/jobs';
import { NewJobPage } from './routes/jobs.new';
import { JobDetailPage } from './routes/jobs.$id';
import { JobReviewPage } from './routes/jobs.$id.review';
import { ServicesPage } from './routes/services';
import { ProjectsPage } from './routes/projects';
import { ProjectDetailPage } from './routes/projects.$id';
import { ProfilesPage } from './routes/profiles';
import { TokensPage } from './routes/tokens';

/**
 * 用 TanStack Router 的代码式 API（而不是文件路由 + @tanstack/router-plugin 的生成器）：
 * 页面数量不算多，手写路由树比额外接入一个构建插件更省事，行为完全一致。
 */
const rootRoute = createRootRoute({ component: RootLayout });

const jobsIndexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: JobsListPage });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const jobsNewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/jobs/new', component: NewJobPage });
const jobDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/jobs/$jobId', component: JobDetailPage });
const jobReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$jobId/review',
  component: JobReviewPage,
});
const servicesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/services', component: ServicesPage });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects', component: ProjectsPage });
const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
});
const profilesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profiles', component: ProfilesPage });
const tokensRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tokens', component: TokensPage });

const routeTree = rootRoute.addChildren([
  jobsIndexRoute,
  loginRoute,
  jobsNewRoute,
  jobDetailRoute,
  jobReviewRoute,
  servicesRoute,
  projectsRoute,
  projectDetailRoute,
  profilesRoute,
  tokensRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
