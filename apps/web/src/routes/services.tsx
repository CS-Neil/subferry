import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { CreateServiceForm } from '@/components/app/create-service-form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

function ServiceRow({ id, displayName, serviceName, enabled }: { id: string; displayName: string; serviceName: string; enabled: boolean }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const test = useMutation({
    mutationFn: () => api.services.test(id),
    onSuccess: (res) => setMessage(res.ok ? '连接成功' : `连接失败：${res.message ?? '未知错误'}`),
    onError: (err) => setMessage(err instanceof ApiError ? `连接失败：${err.message}` : '连接失败'),
  });
  const remove = useMutation({
    mutationFn: () => api.services.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {serviceName} · {id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!enabled && <Badge variant="outline">已停用</Badge>}
            <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? '测试中…' : '测试连接'}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              删除
            </Button>
          </div>
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}

function ServicesInner() {
  const { data: services, isLoading } = useQuery({ queryKey: ['services'], queryFn: api.services.list });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">服务设置</h1>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && services?.length === 0 && (
        <Alert>
          <AlertDescription>还没有翻译服务，在下面添加一个——国内外主流大模型都只需要填 API Key。</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {services?.map((s) => (
          <ServiceRow key={s.id} id={s.id} displayName={s.displayName} serviceName={s.serviceName} enabled={s.enabled} />
        ))}
      </div>

      <CreateServiceForm />
    </div>
  );
}

export function ServicesPage() {
  return (
    <RequireAuth>
      <ServicesInner />
    </RequireAuth>
  );
}
