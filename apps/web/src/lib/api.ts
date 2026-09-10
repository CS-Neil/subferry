import {
  AuthStatus,
  Cue,
  JobSummary,
  ServiceInfo,
  ServiceInstanceView,
  UploadJobResponse,
  Project,
  GlossaryEntry,
  Profile,
  ApiTokenView,
  ApiTokenCreated,
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

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

const Ok = z.object({ ok: z.boolean() });
const CuesPage = z.object({ total: z.number(), items: z.array(Cue) });

export const api = {
  auth: {
    status: () => request('/api/auth/status', {}, AuthStatus),
    init: (username: string, password: string) =>
      request('/api/auth/init', jsonInit('POST', { username, password }), z.object({ id: z.number(), username: z.string() })),
    login: (username: string, password: string) =>
      request('/api/auth/login', jsonInit('POST', { username, password }), z.object({ id: z.number(), username: z.string() })),
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
      proxyUrl?: string;
      enabled?: boolean;
    }) => request('/api/services', jsonInit('POST', body), ServiceInstanceView),
    update: (
      id: string,
      body: Partial<{
        displayName: string;
        config: Record<string, unknown>;
        rpm: number;
        maxConcurrency: number;
        proxyUrl: string;
        enabled: boolean;
      }>,
    ) => request(`/api/services/${encodeURIComponent(id)}`, jsonInit('PUT', body), ServiceInstanceView),
    remove: (id: string) => request(`/api/services/${encodeURIComponent(id)}`, { method: 'DELETE' }, z.undefined()),
    test: (id: string) =>
      request(
        `/api/services/${encodeURIComponent(id)}/test`,
        { method: 'POST' },
        z.object({ ok: z.boolean(), message: z.string().optional(), sample: z.string().optional() }),
      ),
  },

  jobs: {
    list: () => request('/api/jobs', {}, z.array(JobSummary)),
    get: (id: string) => request(`/api/jobs/${id}`, {}, JobSummary),
    upload: async (
      file: File,
      fields: {
        serviceInstanceId?: string;
        profileId?: string;
        projectId?: string;
        srcLang?: string;
        tgtLang?: string;
        options?: Partial<JobOptions>;
      },
    ) => {
      const form = new FormData();
      form.set('file', file, file.name);
      if (fields.serviceInstanceId) form.set('serviceInstanceId', fields.serviceInstanceId);
      if (fields.profileId) form.set('profileId', fields.profileId);
      if (fields.projectId) form.set('projectId', fields.projectId);
      if (fields.srcLang) form.set('srcLang', fields.srcLang);
      if (fields.tgtLang) form.set('tgtLang', fields.tgtLang);
      if (fields.options) form.set('options', JSON.stringify(fields.options));
      return request('/api/jobs', { method: 'POST', body: form }, UploadJobResponse);
    },
    pause: (id: string) => request(`/api/jobs/${id}/pause`, { method: 'POST' }, Ok),
    resume: (id: string) => request(`/api/jobs/${id}/resume`, { method: 'POST' }, Ok),
    cancel: (id: string) => request(`/api/jobs/${id}/cancel`, { method: 'POST' }, Ok),
    retryFailed: (id: string) => request(`/api/jobs/${id}/retry-failed`, { method: 'POST' }, Ok),
    confirm: (id: string) => request(`/api/jobs/${id}/confirm`, { method: 'POST' }, Ok),
    confirmGlossary: (id: string) => request(`/api/jobs/${id}/glossary/confirm`, { method: 'POST' }, Ok),
    reparse: (id: string, encoding: string) => request(`/api/jobs/${id}/reparse`, jsonInit('POST', { encoding }), Ok),
    cues: (id: string, params: { offset?: number; limit?: number; filter?: 'flagged' } = {}) => {
      const qs = new URLSearchParams();
      if (params.offset !== undefined) qs.set('offset', String(params.offset));
      if (params.limit !== undefined) qs.set('limit', String(params.limit));
      if (params.filter) qs.set('filter', params.filter);
      return request(`/api/jobs/${id}/cues?${qs.toString()}`, {}, CuesPage);
    },
    updateCue: (id: string, idx: number, target: string) =>
      request(`/api/jobs/${id}/cues/${idx}`, jsonInit('PATCH', { target }), Ok),
    retranslateCue: (id: string, idx: number) => request(`/api/jobs/${id}/cues/${idx}/retranslate`, { method: 'POST' }, Ok),
    downloadUrl: (id: string) => `/api/jobs/${id}/download`,
  },

  projects: {
    list: () => request('/api/projects', {}, z.array(Project)),
    get: (id: string) => request(`/api/projects/${id}`, {}, Project),
    create: (body: { name: string; synopsis?: string }) => request('/api/projects', jsonInit('POST', body), Project),
    update: (id: string, body: { name?: string; synopsis?: string }) =>
      request(`/api/projects/${id}`, jsonInit('PUT', body), Project),
    glossary: {
      list: (projectId: string) => request(`/api/projects/${projectId}/glossary`, {}, z.array(GlossaryEntry)),
      create: (
        projectId: string,
        body: { source: string; target: string; type?: string; note?: string; confirmed?: boolean },
      ) => request(`/api/projects/${projectId}/glossary`, jsonInit('POST', body), GlossaryEntry),
      update: (
        projectId: string,
        entryId: number,
        body: Partial<{ source: string; target: string; type: string; note: string; confirmed: boolean }>,
      ) => request(`/api/projects/${projectId}/glossary/${entryId}`, jsonInit('PUT', body), GlossaryEntry),
      remove: (projectId: string, entryId: number) =>
        request(`/api/projects/${projectId}/glossary/${entryId}`, { method: 'DELETE' }, z.undefined()),
    },
  },

  profiles: {
    list: () => request('/api/profiles', {}, z.array(Profile)),
    get: (id: string) => request(`/api/profiles/${id}`, {}, Profile),
    create: (body: {
      id: string;
      name: string;
      serviceInstanceId?: string;
      srcLang?: string;
      tgtLang?: string;
      options?: Partial<JobOptions>;
      reviewEnabled?: boolean;
    }) => request('/api/profiles', jsonInit('POST', body), Profile),
    update: (
      id: string,
      body: Partial<{
        name: string;
        serviceInstanceId: string;
        srcLang: string;
        tgtLang: string;
        options: Partial<JobOptions>;
        reviewEnabled: boolean;
      }>,
    ) => request(`/api/profiles/${id}`, jsonInit('PUT', body), Profile),
    remove: (id: string) => request(`/api/profiles/${id}`, { method: 'DELETE' }, z.undefined()),
  },

  tokens: {
    list: () => request('/api/tokens', {}, z.array(ApiTokenView)),
    create: (name: string) => request('/api/tokens', jsonInit('POST', { name }), ApiTokenCreated),
    remove: (id: number) => request(`/api/tokens/${id}`, { method: 'DELETE' }, z.undefined()),
  },
};

export { ApiError };
