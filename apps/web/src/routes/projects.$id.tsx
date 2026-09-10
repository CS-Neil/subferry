import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GlossaryEntry } from '@subferry/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/app/require-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MorphingDialog } from '@/components/motion/morphing-dialog';

const TYPE_LABEL: Record<string, string> = {
  person: '人名',
  place: '地名',
  organization: '机构',
  term: '术语',
  other: '其他',
};

function GlossaryEditDialog({
  projectId,
  entry,
  onClose,
}: {
  projectId: string;
  entry: GlossaryEntry | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(entry?.target ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

  const save = useMutation({
    mutationFn: () => {
      if (!entry) throw new Error('no entry');
      return api.projects.glossary.update(projectId, entry.id, { target, note });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['glossary', projectId] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => {
      if (!entry) throw new Error('no entry');
      return api.projects.glossary.remove(projectId, entry.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['glossary', projectId] });
      onClose();
    },
  });

  return (
    <MorphingDialog open={entry !== null} onClose={onClose}>
      {entry && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-muted-foreground">原文</p>
            <p className="font-medium">{entry.source}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target">译名</Label>
            <Input id="target" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">说明</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              删除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </MorphingDialog>
  );
}

function AddGlossaryEntry({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState('person');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.projects.glossary.create(projectId, { source, target, type }),
    onSuccess: async () => {
      setSource('');
      setTarget('');
      await queryClient.invalidateQueries({ queryKey: ['glossary', projectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '添加失败'),
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-source">原文</Label>
        <Input id="new-source" value={source} onChange={(e) => setSource(e.target.value)} className="w-32" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-target">译名</Label>
        <Input id="new-target" value={target} onChange={(e) => setTarget(e.target.value)} className="w-32" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="new-type">类别</Label>
        <Select id="new-type" value={type} onChange={(e) => setType(e.target.value)} className="w-28">
          {Object.entries(TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <Button
        size="sm"
        onClick={() => {
          setError(null);
          add.mutate();
        }}
        disabled={!source || !target || add.isPending}
      >
        添加
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function ProjectDetailInner({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => api.projects.get(projectId) });
  const { data: glossary } = useQuery({
    queryKey: ['glossary', projectId],
    queryFn: () => api.projects.glossary.list(projectId),
  });
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<GlossaryEntry | null>(null);

  const saveSynopsis = useMutation({
    mutationFn: () => api.projects.update(projectId, { synopsis: synopsis ?? '' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  });

  if (!project) return <p className="text-sm text-muted-foreground">加载中…</p>;

  const unconfirmed = glossary?.filter((g) => !g.confirmed) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{project.name}</h1>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <Label htmlFor="synopsis">影片简介（$synopsis，会随提示词一起发给模型）</Label>
          <textarea
            id="synopsis"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={synopsis ?? project.synopsis ?? ''}
            onChange={(e) => setSynopsis(e.target.value)}
            onBlur={() => synopsis !== null && synopsis !== project.synopsis && saveSynopsis.mutate()}
          />
        </CardContent>
      </Card>

      {unconfirmed.length > 0 && (
        <Alert>
          <AlertDescription>有 {unconfirmed.length} 条术语还未确认，去对应任务的详情页确认后才会正式生效。</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">术语表</h2>
        {glossary?.length === 0 && <p className="text-sm text-muted-foreground">还没有术语条目。</p>}
        <div className="flex flex-col gap-1">
          {glossary?.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setEditingEntry(entry)}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span>
                {entry.source} → {entry.target}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{TYPE_LABEL[entry.type] ?? entry.type}</Badge>
                {!entry.confirmed && <Badge variant="warning">待确认</Badge>}
              </span>
            </button>
          ))}
        </div>
        <AddGlossaryEntry projectId={projectId} />
      </div>

      <GlossaryEditDialog projectId={projectId} entry={editingEntry} onClose={() => setEditingEntry(null)} />
    </div>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  return (
    <RequireAuth>
      <ProjectDetailInner projectId={projectId} />
    </RequireAuth>
  );
}
