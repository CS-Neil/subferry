import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SOURCE_LANGUAGES } from '@subferry/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Disclosure } from '@/components/motion/disclosure';

function ProfileRow({ id, name, srcLang, tgtLang }: { id: string; name: string; srcLang: string | null; tgtLang: string }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.profiles.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {id} · {srcLang ?? '自动检测'} → {tgtLang}
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
          删除
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfilesInner() {
  const queryClient = useQueryClient();
  const { data: profiles, isLoading } = useQuery({ queryKey: ['profiles'], queryFn: api.profiles.list });
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: api.services.list });

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [serviceInstanceId, setServiceInstanceId] = useState('');
  const [srcLang, setSrcLang] = useState('');
  const [batchSize, setBatchSize] = useState(40);
  const [skipReview, setSkipReview] = useState(false);
  const [glossaryAutoConfirm, setGlossaryAutoConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.profiles.create({
        id,
        name,
        serviceInstanceId: serviceInstanceId || undefined,
        srcLang: srcLang || undefined,
        options: { batchSize, skipReview, glossaryAutoConfirm },
      }),
    onSuccess: async () => {
      setId('');
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '创建失败'),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">翻译方案</h1>
      <p className="text-sm text-muted-foreground">
        保存一组常用设置（服务、语言、批大小等），新建任务时选它就不用每次重填；脚本/监控目录用 profileId
        引用同一份设置（readme.md 第6章）。
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      <div className="flex flex-col gap-2">
        {profiles?.map((p) => (
          <ProfileRow key={p.id} id={p.id} name={p.name} srcLang={p.srcLang} tgtLang={p.tgtLang} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建方案</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pid">id（用于 API 引用，如 fast-korean）</Label>
              <Input id="pid" value={id} onChange={(e) => setId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pname">名称</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="psvc">默认翻译服务</Label>
              <Select id="psvc" value={serviceInstanceId} onChange={(e) => setServiceInstanceId(e.target.value)}>
                <option value="">（不设置，创建任务时再选）</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="psrc">默认源语言</Label>
              <Select id="psrc" value={srcLang} onChange={(e) => setSrcLang(e.target.value)}>
                <option value="">自动检测</option>
                {SOURCE_LANGUAGES.filter((l) => l.value !== 'zh_cn').map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Disclosure title="高级参数">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="batchSize">每批条数</Label>
                <Input
                  id="batchSize"
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  min={20}
                  max={60}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipReview} onChange={(e) => setSkipReview(e.target.checked)} />
                翻译完成后跳过待校对，直接完成
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={glossaryAutoConfirm}
                  onChange={(e) => setGlossaryAutoConfirm(e.target.checked)}
                />
                术语自动确认（跳过人工确认步骤，适合脚本/监控目录场景）
              </label>
            </div>
          </Disclosure>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={() => {
              setError(null);
              create.mutate();
            }}
            disabled={!id || !name || create.isPending}
          >
            {create.isPending ? '创建中…' : '创建'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfilesPage() {
  return (
    <RequireAuth>
      <ProfilesInner />
    </RequireAuth>
  );
}
