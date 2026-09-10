import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { SchemaForm } from '@/components/app/schema-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TextShimmer } from '@/components/motion/text-shimmer';

function NewServiceInline({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { data: types } = useQuery({ queryKey: ['serviceTypes'], queryFn: api.services.types });
  const [serviceName, setServiceName] = useState('mock');
  const [displayName, setDisplayName] = useState('Mock（测试用，无需密钥）');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const selected = types?.find((t) => t.name === serviceName);

  const create = useMutation({
    mutationFn: () =>
      api.services.create({
        id: `${serviceName}@${Date.now().toString(36)}`,
        serviceName,
        displayName,
        config,
      }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ['services'] });
      onCreated(row.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '创建失败'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>还没有翻译服务，先创建一个</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="serviceType">服务类型</Label>
          <Select
            id="serviceType"
            value={serviceName}
            onChange={(e) => {
              setServiceName(e.target.value);
              setConfig({});
            }}
          >
            {types?.map((t) => (
              <option key={t.name} value={t.name}>
                {t.displayName}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">显示名称</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        {selected && <SchemaForm schema={selected.configSchema} value={config} onChange={setConfig} />}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button onClick={() => { setError(null); create.mutate(); }} disabled={create.isPending}>
          {create.isPending ? '创建中…' : '创建并使用'}
        </Button>
      </CardContent>
    </Card>
  );
}

function NewJobInner() {
  const navigate = useNavigate();
  const { data: services, isLoading } = useQuery({ queryKey: ['services'], queryFn: api.services.list });

  const [file, setFile] = useState<File | null>(null);
  const [serviceInstanceId, setServiceInstanceId] = useState('');
  const [srcLang, setSrcLang] = useState('');
  const [tgtLang, setTgtLang] = useState('zh_cn');
  const [error, setError] = useState<string | null>(null);

  const effectiveServiceId = serviceInstanceId || services?.[0]?.id || '';

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请先选择字幕文件');
      return api.jobs.upload(file, { serviceInstanceId: effectiveServiceId, srcLang: srcLang || undefined, tgtLang });
    },
    onSuccess: (res) => void navigate({ to: '/jobs/$jobId', params: { jobId: res.jobId } }),
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>;

  if (!services || services.length === 0) {
    return <NewServiceInline onCreated={(id) => setServiceInstanceId(id)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">新建任务</h1>

      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
      >
        <p className="text-sm text-muted-foreground">拖入 .srt 字幕文件，或点击选择</p>
        <input
          type="file"
          accept=".srt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {file && <p className="text-sm">已选择：{file.name}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service">翻译服务</Label>
          <Select id="service" value={effectiveServiceId} onChange={(e) => setServiceInstanceId(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}（{s.serviceName}）
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="srcLang">源语言（留空自动检测）</Label>
          <Input id="srcLang" placeholder="ko / it / …" value={srcLang} onChange={(e) => setSrcLang(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tgtLang">目标语言</Label>
          <Input id="tgtLang" value={tgtLang} onChange={(e) => setTgtLang(e.target.value)} />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={() => {
          setError(null);
          upload.mutate();
        }}
        disabled={!file || upload.isPending}
      >
        {upload.isPending ? <TextShimmer duration={1.2}>上传中…</TextShimmer> : '开始翻译'}
      </Button>
    </div>
  );
}

export function NewJobPage() {
  return (
    <RequireAuth>
      <NewJobInner />
    </RequireAuth>
  );
}
