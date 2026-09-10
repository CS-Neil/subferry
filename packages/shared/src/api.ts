import { z } from 'zod';
import { JobOptions } from './job.js';

export const InitRequest = z.object({
  username: z.string().min(1).default('admin'),
  password: z.string().min(8),
});
export type InitRequest = z.infer<typeof InitRequest>;

export const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthStatus = z.object({
  initialized: z.boolean(),
  authMode: z.enum(['single', 'multi', 'none']),
  loggedIn: z.boolean(),
  username: z.string().nullable(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

export const UploadJobResponse = z.object({
  jobId: z.string(),
});
export type UploadJobResponse = z.infer<typeof UploadJobResponse>;

export const CreateJobOptions = z.object({
  serviceInstanceId: z.string(),
  srcLang: z.string().optional(),
  tgtLang: z.string().default('zh_cn'),
  options: JobOptions.partial().optional(),
});
export type CreateJobOptions = z.infer<typeof CreateJobOptions>;

/**
 * SSE 事件 payload。type='status' 时任务状态变化；type='progress' 时进度数字更新；
 * type='batch' 时某一批次完成（前端据此决定是否播放局部动效）。
 */
export const JobEventPayload = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    jobId: z.string(),
    status: z.string(),
    error: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('progress'),
    jobId: z.string(),
    doneCues: z.number().int(),
    translatableCues: z.number().int(),
    failedCues: z.number().int(),
  }),
  z.object({
    type: z.literal('batch'),
    jobId: z.string(),
    idFrom: z.number().int(),
    idTo: z.number().int(),
    status: z.string(),
  }),
]);
export type JobEventPayload = z.infer<typeof JobEventPayload>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
