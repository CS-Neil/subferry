import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export function RootLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['authStatus'], queryFn: api.auth.status });

  const handleLogout = async () => {
    await api.auth.logout();
    queryClient.clear();
    void navigate({ to: '/login' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-base font-semibold">
            字渡 SubFerry
          </Link>
          {data?.loggedIn && (
            <nav className="flex items-center gap-4 text-sm">
              <Link to="/" className="text-muted-foreground hover:text-foreground" activeProps={{ className: 'text-foreground font-medium' }}>
                任务列表
              </Link>
              <Link
                to="/jobs/new"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: 'text-foreground font-medium' }}
              >
                新建任务
              </Link>
              {data.username && <span className="text-muted-foreground">{data.username}</span>}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                退出登录
              </Button>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
