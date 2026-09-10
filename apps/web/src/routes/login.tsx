import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextScramble } from '@/components/motion/text-scramble';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({ queryKey: ['authStatus'], queryFn: api.auth.status });

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const afterSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    void navigate({ to: '/' });
  };

  const initMutation = useMutation({
    mutationFn: () => api.auth.init(username, password),
    onSuccess: afterSuccess,
    onError: (err) => setError(err instanceof ApiError ? err.message : '初始化失败'),
  });
  const loginMutation = useMutation({
    mutationFn: () => api.auth.login(username, password),
    onSuccess: afterSuccess,
    onError: (err) => setError(err instanceof ApiError ? err.message : '登录失败'),
  });

  if (isLoading || !status) {
    return <div className="text-sm text-muted-foreground">加载中…</div>;
  }

  const needsInit = !status.initialized;
  const pending = initMutation.isPending || loginMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsInit) initMutation.mutate();
    else loginMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold">
        <TextScramble text="字渡 SubFerry" />
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {needsInit ? '首次访问，设置管理员密码' : '登录以继续'}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">用户名</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={needsInit ? 8 : undefined}
            required
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? '请稍候…' : needsInit ? '创建管理员账号' : '登录'}
        </Button>
      </form>
    </div>
  );
}
