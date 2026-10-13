import { asc, eq, isNull } from 'drizzle-orm';
import type { TaskCreateInput, TaskUpdateInput } from '../../shared/schemas';
import {
  applyPlanningChange,
  deadlineError,
  newTaskPlanning,
  plannedDateError,
} from '../../shared/tasks';
import type { ISODate, Task } from '../../shared/types';
import { tasks } from '../db/schema';
import type { Db } from '../env';
import { assertListExists, emptyToNull } from '../helpers';
import { badRequest, jsonError, notFound } from '../http';
import { ensureWeeklyInstances } from '../weekly';

/*
 * Task rules shared by the app's API and the Claude connector (SPEC §5.1, §9),
 * so both follow exactly the same checks. Errors are thrown as HTTP errors
 * with a readable message.
 */

/** Open tasks, creating this week's weekly instances first (SPEC §6). */
export async function loadOpenTasks(db: Db, today: ISODate): Promise<Task[]> {
  await ensureWeeklyInstances(db, today);
  return db.select().from(tasks).where(isNull(tasks.completedAt)).orderBy(asc(tasks.deadline));
}

export async function createTask(db: Db, today: ISODate, input: TaskCreateInput): Promise<Task> {
  const error =
    deadlineError(input.deadline, today) ?? plannedDateError(input.plannedDate ?? null, today);
  if (error) throw badRequest(error);
  await assertListExists(db, input.listId);

  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    listId: input.listId ?? null,
    title: input.title,
    notes: emptyToNull(input.notes),
    priority: input.priority ?? 'medium',
    ...newTaskPlanning(input.deadline, input.plannedDate),
    recurringId: null,
    weekStart: null,
    occurrence: 0,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(tasks).values(task);
  return task;
}

export async function updateTask(
  db: Db,
  today: ISODate,
  id: string,
  input: TaskUpdateInput,
): Promise<Task> {
  const existing = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!existing) throw notFound('Task not found');
  if (existing.completedAt) throw jsonError(409, 'Completed tasks cannot be edited');

  if (input.deadline !== undefined) {
    const error = deadlineError(input.deadline, today, existing.deadline);
    if (error) throw badRequest(error);
  }
  if (input.plannedDate !== undefined) {
    const error = plannedDateError(input.plannedDate, today, existing.plannedDate);
    if (error) throw badRequest(error);
  }
  if (input.listId !== undefined) await assertListExists(db, input.listId);

  const { deadline, plannedDate, ...rest } = input;
  const [task] = await db
    .update(tasks)
    .set({
      ...rest,
      ...(input.notes !== undefined && { notes: emptyToNull(input.notes) }),
      ...applyPlanningChange(existing, { deadline, plannedDate }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tasks.id, existing.id))
    .returning();
  return task!;
}
