import { z } from 'zod';

/**
 * 服务配置表单的单个字段描述，前端据此用 configSchema 动态生成表单（readme.md 2.2 / 4.4）。
 */
export const ConfigField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'select']),
  secret: z.boolean().default(false), // true 时加密存储，接口永不回显明文
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(), // type === 'select' 时使用
  placeholder: z.string().optional(),
  description: z.string().optional(),
});
export type ConfigField = z.infer<typeof ConfigField>;

export const ServiceCapabilities = z.object({
  batch: z.boolean(),
  jsonMode: z.boolean(),
  stream: z.boolean(),
  maxBatchSize: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
});
export type ServiceCapabilities = z.infer<typeof ServiceCapabilities>;

export const ServiceInfo = z.object({
  name: z.string(), // 服务类型标识，如 'openai'、'mock'
  displayName: z.string(),
  capabilities: ServiceCapabilities,
  configSchema: z.array(ConfigField),
});
export type ServiceInfo = z.infer<typeof ServiceInfo>;

/**
 * 服务实例（对应 readme.md 第6章 service_instances 表）。id 形如 name@xxx，同一服务类型可配置多份。
 */
export const ServiceInstanceCreate = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_-]+@[a-zA-Z0-9_-]+$/, 'id 格式应为 name@id，例如 openai@default'),
  serviceName: z.string(),
  displayName: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  rpm: z.number().int().positive().default(60),
  maxConcurrency: z.number().int().positive().default(3),
  enabled: z.boolean().default(true),
});
export type ServiceInstanceCreate = z.infer<typeof ServiceInstanceCreate>;

export const ServiceInstanceUpdate = ServiceInstanceCreate.partial().omit({ id: true });
export type ServiceInstanceUpdate = z.infer<typeof ServiceInstanceUpdate>;

/**
 * 接口返回给前端的服务实例视图：密钥字段已脱敏为 sk-****abcd 形式，永不回显明文。
 */
export const ServiceInstanceView = z.object({
  id: z.string(),
  serviceName: z.string(),
  displayName: z.string(),
  config: z.record(z.string(), z.unknown()),
  rpm: z.number().int(),
  maxConcurrency: z.number().int(),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type ServiceInstanceView = z.infer<typeof ServiceInstanceView>;
