import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextEffect } from '@/components/motion/text-effect';
import { AnimatedGroup, AnimatedGroupItem } from '@/components/motion/animated-group';

function ProjectsInner() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  const [name, setName] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.projects.create({ name, synopsis: synopsis || undefined }),
    onSuccess: async () => {
      setName('');
      setSynopsis('');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '创建失败'),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">项目</h1>
      <p className="text-sm text-muted-foreground">
        同一部剧的各集放在同一个项目下，共用并逐步完善同一份术语表（readme.md 4.7）。
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && projects?.length === 0 && <TextEffect className="text-sm text-muted-foreground">还没有项目，在下面创建一个。</TextEffect>}

      <AnimatedGroup className="flex flex-col gap-3">
        {projects?.map((p) => (
          <AnimatedGroupItem key={p.id}>
            <Link to="/projects/$projectId" params={{ projectId: p.id }}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-col gap-1 py-4">
                  <span className="font-medium">{p.name}</span>
                  {p.synopsis && <span className="text-xs text-muted-foreground">{p.synopsis}</span>}
                </CardContent>
              </Card>
            </Link>
          </AnimatedGroupItem>
        ))}
      </AnimatedGroup>

      <Card>
        <CardHeader>
          <CardTitle>新建项目</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pname">名称</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：深夜食堂 第二季" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="synopsis">简介（可选，会作为提示词里的 $synopsis 给模型参考）</Label>
            <Input id="synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={() => { setError(null); create.mutate(); }} disabled={!name || create.isPending}>
            {create.isPending ? '创建中…' : '创建'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectsPage() {
  return (
    <RequireAuth>
      <ProjectsInner />
    </RequireAuth>
  );
}
