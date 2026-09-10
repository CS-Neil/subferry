import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { CreateServiceForm } from '@/components/app/create-service-form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TextMorph } from '@/components/motion/text-morph';

function ServiceRow({
  id,
  displayName,
  serviceName,
  enabled,
  proxyUrl,
}: {
  id: string;
  displayName: string;
  serviceName: string;
  enabled: boolean;
  proxyUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [editingProxy, setEditingProxy] = useState(false);
  const [proxyValue, setProxyValue] = useState(proxyUrl ?? '');

  const test = useMutation({
    mutationFn: () => api.services.test(id),
    onSuccess: (res) => setMessage(res.ok ? '连接成功' : `连接失败：${res.message ?? '未知错误'}`),
    onError: (err) => setMessage(err instanceof ApiError ? `连接失败：${err.message}` : '连接失败'),
  });
  const remove = useMutation({
    mutationFn: () => api.services.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });
  const saveProxy = useMutation({
    mutationFn: () => api.services.update(id, { proxyUrl: proxyValue }),
    onSuccess: () => {
      setEditingProxy(false);
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {serviceName} · {id}
              {proxyUrl && ` · 代理：${proxyUrl}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!enabled && <Badge variant="outline">已停用</Badge>}
            <Button variant="outline" size="sm" onClick={() => setEditingProxy((v) => !v)}>
              代理
            </Button>
            <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
              <TextMorph>{test.isPending ? '测试中…' : message?.startsWith('连接成功') ? '连接成功' : '测试连接'}</TextMorph>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              删除
            </Button>
          </div>
        </div>
        {editingProxy && (
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor={`proxy-${id}`}>实例代理地址（只对这个实例生效，留空则走全局代理/直连）</Label>
              <Input
                id={`proxy-${id}`}
                placeholder="http://127.0.0.1:7890"
                value={proxyValue}
                onChange={(e) => setProxyValue(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => saveProxy.mutate()} disabled={saveProxy.isPending}>
              保存
            </Button>
          </div>
        )}
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
          <ServiceRow
            key={s.id}
            id={s.id}
            displayName={s.displayName}
            serviceName={s.serviceName}
            enabled={s.enabled}
            proxyUrl={s.proxyUrl}
          />
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
