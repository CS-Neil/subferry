import { describe, expect, it } from 'vitest';
import { Cue, SubtitleDocument, JobOptions, JobStatus, ServiceInstanceCreate } from '../src/index.js';

describe('Cue schema', () => {
  it('accepts a well-formed cue', () => {
    const cue = {
      id: 1,
      rawTime: '00:00:01,000 --> 00:00:02,500',
      startMs: 1000,
      endMs: 2500,
      meta: {},
      leadingTags: '',
      source: '어디 가?',
      placeholders: [],
      translatable: true,
      status: 'pending',
      flags: [],
    };
    expect(Cue.safeParse(cue).success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const cue = {
      id: 1,
      rawTime: '00:00:01,000 --> 00:00:02,500',
      startMs: 1000,
      endMs: 2500,
      meta: {},
      leadingTags: '',
      source: 'x',
      placeholders: [],
      translatable: true,
      status: 'not-a-status',
      flags: [],
    };
    expect(Cue.safeParse(cue).success).toBe(false);
  });
});

describe('SubtitleDocument schema', () => {
  it('accepts a document with cues', () => {
    const doc = {
      format: 'srt',
      sourceEncoding: 'UTF-8',
      eol: '\n',
      header: '',
      cues: [],
    };
    expect(SubtitleDocument.safeParse(doc).success).toBe(true);
  });
});

describe('JobOptions schema', () => {
  it('fills in defaults', () => {
    const parsed = JobOptions.parse({});
    expect(parsed.batchSize).toBe(40);
    expect(parsed.mode).toBe('standard');
  });

  it('rejects batchSize out of range', () => {
    expect(JobOptions.safeParse({ batchSize: 5 }).success).toBe(false);
  });
});

describe('JobStatus', () => {
  it('accepts the M1/M2 state machine values', () => {
    for (const s of [
      'queued',
      'parsing',
      'awaiting_glossary',
      'translating',
      'awaiting_review',
      'done',
      'failed',
      'paused',
      'canceled',
    ]) {
      expect(JobStatus.safeParse(s).success).toBe(true);
    }
  });
  it('rejects M3-only states（LLM 审校轮尚未实现）', () => {
    expect(JobStatus.safeParse('reviewing').success).toBe(false);
  });
});

describe('ServiceInstanceCreate', () => {
  it('validates id format name@id', () => {
    expect(
      ServiceInstanceCreate.safeParse({
        id: 'openai@default',
        serviceName: 'openai',
        displayName: 'OpenAI',
      }).success,
    ).toBe(true);
    expect(
      ServiceInstanceCreate.safeParse({
        id: 'invalid id',
        serviceName: 'openai',
        displayName: 'OpenAI',
      }).success,
    ).toBe(false);
  });
});
