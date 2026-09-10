import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TextMorph } from '@/components/motion/text-morph';

function TokensInner() {
  const queryClient = useQueryClient();
  const { data: tokens, isLoading } = useQuery({ queryKey: ['tokens'], queryFn: api.tokens.list });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => api.tokens.create(name),
    onSuccess: async (res) => {
      setName('');
      setJustCreated(res.token);
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '创建失败'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.tokens.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tokens'] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">API Token</h1>
      <p className="text-sm text-muted-foreground">供脚本用 `Authorization: Bearer &lt;token&gt;` 调用接口（readme.md 7.2）。</p>

      {justCreated && (
        <Alert>
          <AlertTitle>创建成功，请立刻复制保存——之后不会再显示明文</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2">
            <code className="break-all rounded bg-muted px-2 py-1 text-xs">{justCreated}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(justCreated);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <TextMorph>{copied ? '已复制' : '复制'}</TextMorph>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      <div className="flex flex-col gap-2">
        {tokens?.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  创建于 {new Date(t.createdAt).toLocaleString('zh-CN')}
                  {t.lastUsedAt && ` · 最近使用 ${new Date(t.lastUsedAt).toLocaleString('zh-CN')}`}
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => remove.mutate(t.id)} disabled={remove.isPending}>
                删除
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建 token</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="tname">名称</Label>
            <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：ci-script" />
          </div>
          <Button
            onClick={() => {
              setError(null);
              setJustCreated(null);
              create.mutate();
            }}
            disabled={!name || create.isPending}
          >
            创建
          </Button>
        </CardContent>
        {error && (
          <CardContent className="pt-0">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export function TokensPage() {
  return (
    <RequireAuth>
      <TokensInner />
    </RequireAuth>
  );
}
