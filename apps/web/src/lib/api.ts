import {
  AuthStatus,
  JobSummary,
  ServiceInfo,
  ServiceInstanceView,
  UploadJobResponse,
  type JobOptions,
} from '@subferry/shared';
import { z } from 'zod';

/**
 * 基于 fetch 的 API 客户端。类型来自 @subferry/shared 的 zod schema，响应体都经过
 * `.parse()` 校验，前后端契约漂移时会在这里第一时间报错，而不是把 undefined 悄悄传到界面上。
 */
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return schema.parse(json);
}

const Ok = z.object({ ok: z.boolean() });

export const api = {
  auth: {
    status: () => request('/api/auth/status', {}, AuthStatus),
    init: (username: string, password: string) =>
      request(
        '/api/auth/init',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) },
        z.object({ id: z.number(), username: z.string() }),
      ),
    login: (username: string, password: string) =>
      request(
        '/api/auth/login',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) },
        z.object({ id: z.number(), username: z.string() }),
      ),
    logout: () => request('/api/auth/logout', { method: 'POST' }, Ok),
  },

  services: {
    types: () => request('/api/service-types', {}, z.array(ServiceInfo)),
    list: () => request('/api/services', {}, z.array(ServiceInstanceView)),
    create: (body: {
      id: string;
      serviceName: string;
      displayName: string;
      config: Record<string, unknown>;
      rpm?: number;
      maxConcurrency?: number;
      enabled?: boolean;
    }) =>
      request(
        '/api/services',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
        ServiceInstanceView,
      ),
    remove: (id: string) => request(`/api/services/${encodeURIComponent(id)}`, { method: 'DELETE' }, z.undefined()),
    test: (id: string) =>
      request(`/api/services/${encodeURIComponent(id)}/test`, { method: 'POST' }, z.object({ ok: z.boolean(), message: z.string().optional(), sample: z.string().optional() })),
  },

  jobs: {
    list: () => request('/api/jobs', {}, z.array(JobSummary)),
    get: (id: string) => request(`/api/jobs/${id}`, {}, JobSummary),
    upload: async (
      file: File,
      fields: { serviceInstanceId: string; srcLang?: string; tgtLang?: string; options?: Partial<JobOptions> },
    ) => {
      const form = new FormData();
      form.set('file', file, file.name);
      form.set('serviceInstanceId', fields.serviceInstanceId);
      if (fields.srcLang) form.set('srcLang', fields.srcLang);
      if (fields.tgtLang) form.set('tgtLang', fields.tgtLang);
      if (fields.options) form.set('options', JSON.stringify(fields.options));
      return request('/api/jobs', { method: 'POST', body: form }, UploadJobResponse);
    },
    pause: (id: string) => request(`/api/jobs/${id}/pause`, { method: 'POST' }, Ok),
    resume: (id: string) => request(`/api/jobs/${id}/resume`, { method: 'POST' }, Ok),
    cancel: (id: string) => request(`/api/jobs/${id}/cancel`, { method: 'POST' }, Ok),
    retryFailed: (id: string) => request(`/api/jobs/${id}/retry-failed`, { method: 'POST' }, Ok),
    downloadUrl: (id: string) => `/api/jobs/${id}/download?mode=zh`,
  },
};

export { ApiError };
