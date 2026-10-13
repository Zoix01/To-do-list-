import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { taskCreateSchema, taskIdsSchema, taskUpdateSchema } from '../../shared/schemas';
import { tasks } from '../db/schema';
import type { AppEnv } from '../env';
import { notFound, readBody } from '../http';
import { payWeekly } from '../services/rewards';
import { createTask, loadOpenTasks, updateTask } from '../services/tasks';
import { rewardsContext } from './rewards';
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
    return c.json(await loadOpenTasks(db, c.get('today')));
  })
  .post('/', async (c) => {
    const input = await readBody(c, taskCreateSchema);
    return c.json(await createTask(c.get('db'), c.get('today'), input), 201);
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
    return c.json(await updateTask(c.get('db'), c.get('today'), c.req.param('id'), input));
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
      // Weekly tasks earn coins (SPEC §13.4); the reward rides along for the toast.
      return c.json({ ...task, reward: await payWeekly(rewardsContext(c), task) });
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
