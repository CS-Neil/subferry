import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { SchemaForm } from '@/components/app/schema-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 新建一个翻译服务实例。国内外主流大模型都注册为预设（configSchema 里没有 baseURL，
 * 只需要填 API Key，见 packages/core/src/services/presets.ts），表单完全由 configSchema
 * 动态生成（readme.md 4.4），这里不需要为每家服务商单独写表单代码。
 */
export function CreateServiceForm({ onCreated, title = '新建翻译服务' }: { onCreated?: (id: string) => void; title?: string }) {
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
      setConfig({});
      onCreated?.(row.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '创建失败'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="serviceType">服务商</Label>
          <Select
            id="serviceType"
            value={serviceName}
            onChange={(e) => {
              const next = e.target.value;
              setServiceName(next);
              setConfig({});
              const nextType = types?.find((t) => t.name === next);
              if (nextType) setDisplayName(nextType.displayName);
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
        <Button
          onClick={() => {
            setError(null);
            create.mutate();
          }}
          disabled={create.isPending}
        >
          {create.isPending ? '创建中…' : '创建'}
        </Button>
      </CardContent>
    </Card>
  );
}
