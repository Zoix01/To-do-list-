import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { taskCreateSchema, taskIdsSchema, taskUpdateSchema } from '../../shared/schemas';
import {
  applyPlanningChange,
  deadlineError,
  newTaskPlanning,
  plannedDateError,
} from '../../shared/tasks';
import type { Task } from '../../shared/types';
import { tasks } from '../db/schema';
import type { AppEnv } from '../env';
import { assertListExists, emptyToNull } from '../helpers';
import { badRequest, jsonError, notFound, readBody } from '../http';
import { ensureWeeklyInstances } from '../weekly';

export const taskRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const db = c.get('db');
    if (c.req.query('status') === 'completed') {
      return c.json(
        await db
          .select()
          .from(tasks)
          .where(isNotNull(tasks.completedAt))
          .orderBy(desc(tasks.completedAt)),
      );
    }
    // Weekly tasks for the current week are created lazily here (SPEC §6).
    await ensureWeeklyInstances(db, c.get('today'));
    return c.json(
      await db.select().from(tasks).where(isNull(tasks.completedAt)).orderBy(asc(tasks.deadline)),
    );
  })
  .post('/', async (c) => {
    const input = await readBody(c, taskCreateSchema);
    const today = c.get('today');
    const error =
      deadlineError(input.deadline, today) ?? plannedDateError(input.plannedDate ?? null, today);
    if (error) throw badRequest(error);
    const db = c.get('db');
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
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(tasks).values(task);
    return c.json(task, 201);
  })
  .post('/delete-completed', async (c) => {
    // Deletes the given tasks, but only those that are completed.
    const { ids } = await readBody(c, taskIdsSchema);
    const db = c.get('db');
    // D1 allows at most 100 bound parameters per statement.
    const statements = [];
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      statements.push(
        db.delete(tasks).where(and(inArray(tasks.id, chunk), isNotNull(tasks.completedAt))),
      );
    }
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
    return c.body(null, 204);
  })
  .patch('/:id', async (c) => {
    const input = await readBody(c, taskUpdateSchema);
    const db = c.get('db');
    const existing = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, c.req.param('id')))
      .get();
    if (!existing) throw notFound('Task not found');
    if (existing.completedAt) throw jsonError(409, 'Completed tasks cannot be edited');

    const today = c.get('today');
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
    return c.json(task);
  })
  .post('/:id/complete', async (c) => {
    const now = new Date().toISOString();
    const [task] = await c
      .get('db')
      .update(tasks)
      .set({ completedAt: now, updatedAt: now })
      .where(and(eq(tasks.id, c.req.param('id')), isNull(tasks.completedAt)))
      .returning();
    if (!task) throw notFound('Open task not found');
    // Completing a weekly instance creates next week's right away (SPEC §6).
    if (task.recurringId) {
      await ensureWeeklyInstances(c.get('db'), c.get('today'), {
        templateIds: [task.recurringId],
        includeNextWeek: true,
      });
    }
    return c.json(task);
  })
  .post('/:id/uncomplete', async (c) => {
    // Dates are left untouched, so the task comes back with its original dates.
    const [task] = await c
      .get('db')
      .update(tasks)
      .set({ completedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(tasks.id, c.req.param('id')), isNotNull(tasks.completedAt)))
      .returning();
    if (!task) throw notFound('Completed task not found');
    return c.json(task);
  })
  .delete('/:id', async (c) => {
    const [task] = await c
      .get('db')
      .delete(tasks)
      .where(eq(tasks.id, c.req.param('id')))
      .returning({ id: tasks.id });
    if (!task) throw notFound('Task not found');
    return c.body(null, 204);
  });
