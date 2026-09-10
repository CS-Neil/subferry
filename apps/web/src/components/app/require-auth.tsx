import { type ReactNode, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * M1 没有做 TanStack Router 的 beforeLoad 级别路由守卫（那需要把 auth 状态放进 router
 * context，属于可以留到 M2 一起打磨的小优化）；这里用一个简单的运行时检查组件包裹
 * 需要登录的页面，未登录时跳转到 /login。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['authStatus'], queryFn: api.auth.status });

  useEffect(() => {
    if (!isLoading && data && !data.loggedIn) {
      void navigate({ to: '/login' });
    }
  }, [isLoading, data, navigate]);

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">加载中…</div>;
  }
  if (!data?.loggedIn) {
    return null;
  }
  return <>{children}</>;
}
