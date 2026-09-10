import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SOURCE_LANGUAGES } from '@subferry/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextShimmer } from '@/components/motion/text-shimmer';

function NewJobInner() {
  const navigate = useNavigate();
  const { data: services, isLoading } = useQuery({ queryKey: ['services'], queryFn: api.services.list });

  const [file, setFile] = useState<File | null>(null);
  const [serviceInstanceId, setServiceInstanceId] = useState('');
  const [srcLang, setSrcLang] = useState(''); // 空字符串代表自动检测
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
    return (
      <Alert>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>还没有翻译服务，先去"服务设置"添加一个（国内外主流大模型都只需要填 API Key）。</span>
          <Link to="/services" className={buttonVariants({ size: 'sm' })}>
            去添加
          </Link>
        </AlertDescription>
      </Alert>
    );
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
          <Label htmlFor="srcLang">源语言</Label>
          <Select id="srcLang" value={srcLang} onChange={(e) => setSrcLang(e.target.value)}>
            <option value="">自动检测</option>
            {SOURCE_LANGUAGES.filter((l) => l.value !== 'zh_cn').map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
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
