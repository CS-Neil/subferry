import { z } from 'zod';

/** API Token（readme.md 第6章 api_tokens 表）：供脚本调用，只保存哈希值，创建后只显示一次明文。 */
export const ApiTokenView = z.object({
  id: z.number().int(),
  name: z.string(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiTokenView = z.infer<typeof ApiTokenView>;

export const ApiTokenCreate = z.object({
  name: z.string().min(1),
});
export type ApiTokenCreate = z.infer<typeof ApiTokenCreate>;

/** 创建成功后的一次性响应：明文 token 只在这一次返回，之后再也拿不到。 */
export const ApiTokenCreated = ApiTokenView.extend({
  token: z.string(),
});
export type ApiTokenCreated = z.infer<typeof ApiTokenCreated>;
