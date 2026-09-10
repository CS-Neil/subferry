import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * 根据 ConfigField[] 动态生成表单（readme.md 4.4："配置面板由 configSchema 自动生成"）。
 * M1 只覆盖 string / number / boolean 三种字段类型，select 类型留给 M2 服务增多后再完善。
 *
 * schema 的字段类型故意只声明组件真正用到的部分（且 secret/required 设为可选）：
 * @subferry/shared 的 ConfigField 是 zod schema 的输出类型（default() 令 secret/required
 * 在输出里恒为必填 boolean），这里用一个结构上更宽松的本地类型接收它，避免为了一次展示
 * 就耦合到 schema 包的精确形状。
 */
export interface SchemaFormField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  secret?: boolean;
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
}

export function SchemaForm({
  schema,
  value,
  onChange,
}: {
  schema: SchemaFormField[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3">
      {schema.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={field.key}>
            {field.label}
            {field.required && <span className="ml-0.5 text-destructive">*</span>}
          </Label>
          {field.type === 'boolean' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                id={field.key}
                type="checkbox"
                checked={Boolean(value[field.key] ?? field.default ?? false)}
                onChange={(e) => set(field.key, e.target.checked)}
              />
              {field.description}
            </label>
          ) : (
            <Input
              id={field.key}
              type={field.type === 'number' ? 'number' : field.secret ? 'password' : 'text'}
              placeholder={field.placeholder ?? (field.default !== undefined ? String(field.default) : undefined)}
              value={(value[field.key] as string | number | undefined) ?? ''}
              required={field.required}
              onChange={(e) => set(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          )}
          {field.description && field.type !== 'boolean' && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function useSchemaFormState(initial: Record<string, unknown> = {}) {
  return useState<Record<string, unknown>>(initial);
}
