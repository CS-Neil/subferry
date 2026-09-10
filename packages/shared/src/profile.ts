import { z } from 'zod';
import { JobOptions } from './job.js';

/**
 * 翻译方案（readme.md 第6章 profiles 表）：网页、API、监控目录共用的预设。创建任务时把
 * 当时的方案内容拍平成快照写进 jobs.options_json，之后修改方案不影响进行中的任务。
 * `reviewEnabled`（M3 的 LLM 审校轮开关）目前只是存储，尚未接入实际的审校逻辑。
 */
export const Profile = z.object({
  id: z.string(),
  name: z.string(),
  serviceInstanceId: z.string().nullable(),
  srcLang: z.string().nullable(),
  tgtLang: z.string(),
  options: JobOptions,
  reviewEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileCreate = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, 'id 只能包含小写字母、数字、下划线、短横线'),
  name: z.string().min(1),
  serviceInstanceId: z.string().optional(),
  srcLang: z.string().optional(),
  tgtLang: z.string().default('zh_cn'),
  options: JobOptions.partial().optional(),
  reviewEnabled: z.boolean().default(false),
});
export type ProfileCreate = z.infer<typeof ProfileCreate>;

export const ProfileUpdate = ProfileCreate.partial().omit({ id: true });
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
