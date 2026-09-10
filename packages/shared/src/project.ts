import { z } from 'zod';

/** 一部电影或一部剧（readme.md 第6章）。术语表归属于项目，同一部剧的各集共用一份术语表。 */
export const Project = z.object({
  id: z.string(),
  name: z.string(),
  synopsis: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof Project>;

export const ProjectCreate = z.object({
  name: z.string().min(1),
  synopsis: z.string().optional(),
});
export type ProjectCreate = z.infer<typeof ProjectCreate>;

export const ProjectUpdate = ProjectCreate.partial();
export type ProjectUpdate = z.infer<typeof ProjectUpdate>;

export const GlossaryEntryType = z.enum(['person', 'place', 'organization', 'term', 'other']);
export type GlossaryEntryType = z.infer<typeof GlossaryEntryType>;

export const GlossaryEntry = z.object({
  id: z.number().int(),
  projectId: z.string(),
  source: z.string(),
  target: z.string(),
  type: GlossaryEntryType,
  note: z.string().nullable(),
  confirmed: z.boolean(),
});
export type GlossaryEntry = z.infer<typeof GlossaryEntry>;

export const GlossaryEntryInput = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: GlossaryEntryType.default('other'),
  note: z.string().optional(),
  confirmed: z.boolean().default(true),
});
export type GlossaryEntryInput = z.infer<typeof GlossaryEntryInput>;
