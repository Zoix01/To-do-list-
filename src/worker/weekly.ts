import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { planGeneration } from '../shared/recurrence';
import type { ISODate } from '../shared/types';
import { recurringTasks, tasks } from './db/schema';
import type { Db } from './env';

/**
 * Creates the weekly instances that are due now (SPEC §6): the current week for
 * every active template, plus next week when `includeNextWeek` (after completing
 * an instance). Safe to call on every load: each week is generated once
 * (generatedThrough), and the unique (recurringId, weekStart) index stops
 * duplicates even if two requests race.
 */
export async function ensureWeeklyInstances(
  db: Db,
  today: ISODate,
  options: { templateIds?: string[]; includeNextWeek?: boolean } = {},
): Promise<void> {
  const conditions: SQL[] = [eq(recurringTasks.active, true)];
  if (options.templateIds) conditions.push(inArray(recurringTasks.id, options.templateIds));
  const templates = await db
    .select()
    .from(recurringTasks)
    .where(and(...conditions));

  const statements: BatchItem<'sqlite'>[] = [];
  const now = new Date().toISOString();
  for (const template of templates) {
    const plan = planGeneration(template, today, { includeNextWeek: options.includeNextWeek });
    if (plan.generatedThrough === template.generatedThrough) continue;
    for (const instance of plan.create) {
      statements.push(
        db
          .insert(tasks)
          .values({
            id: crypto.randomUUID(),
            listId: template.listId,
            title: template.title,
            notes: template.notes,
            priority: template.priority,
            deadline: instance.deadline,
            plannedDate: instance.plannedDate,
            plannedManual: false,
            recurringId: template.id,
            weekStart: instance.weekStart,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing(),
      );
    }
    statements.push(
      db
        .update(recurringTasks)
        .set({ generatedThrough: plan.generatedThrough })
        .where(eq(recurringTasks.id, template.id)),
    );
  }
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}
