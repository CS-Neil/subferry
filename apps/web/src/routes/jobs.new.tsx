import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SOURCE_LANGUAGES, type JobOptions } from '@subferry/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextShimmer } from '@/components/motion/text-shimmer';
import { GlowEffect } from '@/components/motion/glow-effect';
import { Disclosure } from '@/components/motion/disclosure';

const ACCEPT_EXTENSIONS = '.srt,.ass,.ssa,.vtt';

function NewJobInner() {
  const navigate = useNavigate();
  const { data: services, isLoading } = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: api.profiles.list });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [profileId, setProfileId] = useState('');
  const [serviceInstanceId, setServiceInstanceId] = useState('');
  const [srcLang, setSrcLang] = useState(''); // 空字符串代表自动检测
  const [projectId, setProjectId] = useState('');
  const [outputMode, setOutputMode] = useState<JobOptions['outputMode']>('zh');
  const [opencc, setOpencc] = useState<JobOptions['opencc']>('none');
  const [skipReview, setSkipReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usingProfile = Boolean(profileId);
  const effectiveServiceId = serviceInstanceId || services?.[0]?.id || '';

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请先选择字幕文件');
      return api.jobs.upload(file, {
        profileId: profileId || undefined,
        serviceInstanceId: usingProfile ? undefined : effectiveServiceId,
        srcLang: usingProfile ? undefined : srcLang || undefined,
        projectId: projectId || undefined,
        options: { outputMode, opencc, skipReview },
      });
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

      <GlowEffect active={dragging}>
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) setFile(dropped);
          }}
        >
          <p className="text-sm text-muted-foreground">拖入字幕文件（.srt/.ass/.ssa/.vtt），或点击选择</p>
          <input type="file" accept={ACCEPT_EXTENSIONS} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          {file && <p className="text-sm">已选择：{file.name}</p>}
        </div>
      </GlowEffect>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile">翻译方案（可选）</Label>
          <Select id="profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">不使用方案，手动选择</option>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project">项目（可选，用于术语表）</Label>
          <Select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">不关联项目</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {usingProfile ? (
        <p className="text-xs text-muted-foreground">翻译服务和源语言将使用方案 "{profiles?.find((p) => p.id === profileId)?.name}" 里保存的设置。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
      )}

      <Disclosure title="高级参数">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="outputMode">输出模式</Label>
            <Select id="outputMode" value={outputMode} onChange={(e) => setOutputMode(e.target.value as JobOptions['outputMode'])}>
              <option value="zh">仅中文</option>
              <option value="zh-top">双语，中文在上</option>
              <option value="src-top">双语，原文在上</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opencc">繁简转换</Label>
            <Select id="opencc" value={opencc} onChange={(e) => setOpencc(e.target.value as JobOptions['opencc'])}>
              <option value="none">不转换</option>
              <option value="s2t">简体转繁体</option>
              <option value="t2s">繁体转简体</option>
            </Select>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipReview} onChange={(e) => setSkipReview(e.target.checked)} />
          翻译完成后跳过待校对，直接完成
        </label>
      </Disclosure>

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
