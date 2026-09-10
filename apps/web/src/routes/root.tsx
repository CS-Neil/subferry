import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AnimatedBackground } from '@/components/motion/animated-background';

const NAV_ITEMS = [
  { to: '/', label: '任务列表', match: (p: string) => p === '/' },
  { to: '/jobs/new', label: '新建任务', match: (p: string) => p === '/jobs/new' },
  { to: '/projects', label: '项目', match: (p: string) => p.startsWith('/projects') },
  { to: '/profiles', label: '翻译方案', match: (p: string) => p === '/profiles' },
  { to: '/services', label: '服务设置', match: (p: string) => p === '/services' },
  { to: '/tokens', label: 'API Token', match: (p: string) => p === '/tokens' },
] as const;

export function RootLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data } = useQuery({ queryKey: ['authStatus'], queryFn: api.auth.status });

  const handleLogout = async () => {
    await api.auth.logout();
    queryClient.clear();
    void navigate({ to: '/login' });
  };

  const current = NAV_ITEMS.find((item) => item.match(location.pathname))?.to ?? '/';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-base font-semibold">
            字渡 SubFerry
          </Link>
          {data?.loggedIn && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <AnimatedBackground
                id="top-nav"
                value={current}
                onChange={(to) => void navigate({ to })}
                items={NAV_ITEMS.map((item) => ({ value: item.to, label: item.label }))}
              />
              {data.username && <span className="text-muted-foreground">{data.username}</span>}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
