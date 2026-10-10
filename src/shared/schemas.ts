import { z } from 'zod';
import { isISODate } from './dates';
import { LIST_COLORS, PRIORITIES } from './types';

const isoDate = z.string().refine(isISODate, 'Must be a date in YYYY-MM-DD format');
const title = z.string().trim().min(1, 'Title is required').max(500);
const notes = z.string().max(20_000).nullable();

export const loginSchema = z.object({ password: z.string().min(1).max(1000) });

export const listCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  color: z.enum(LIST_COLORS),
});
export type ListCreateInput = z.infer<typeof listCreateSchema>;

export const listUpdateSchema = listCreateSchema.partial();
export type ListUpdateInput = z.infer<typeof listUpdateSchema>;

export const listOrderSchema = z.object({ ids: z.array(z.string()).max(1000) });

export const taskCreateSchema = z.object({
  title,
  notes: notes.optional(),
  priority: z.enum(PRIORITIES).optional(),
  listId: z.string().nullable().optional(),
  deadline: isoDate,
  /** Omit for the automatic planned date; null = unplanned. */
  plannedDate: isoDate.nullable().optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title,
    notes,
    priority: z.enum(PRIORITIES),
    listId: z.string().nullable(),
    deadline: isoDate,
    plannedDate: isoDate.nullable(),
  })
  .partial()
  .strict();
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
