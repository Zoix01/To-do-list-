import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { normalizeSchedule } from '../../shared/recurrence';
import { recurringCreateSchema, recurringUpdateSchema } from '../../shared/schemas';
import { IMPORTANCE_DEFAULT } from '../../shared/economy';
import type { RecurringTask } from '../../shared/types';
import { recurringTasks } from '../db/schema';
import type { AppEnv } from '../env';
import { assertListExists, emptyToNull } from '../helpers';
import { badRequest, notFound, readBody } from '../http';
import { ensureWeeklyInstances } from '../weekly';

/** Recurring (weekly and monthly) task templates (SPEC §6, §8.5). */
export const recurringRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    return c.json(
      await c.get('db').select().from(recurringTasks).orderBy(asc(recurringTasks.createdAt)),
    );
  })
  .post('/', async (c) => {
    const input = await readBody(c, recurringCreateSchema);
    const normalized = normalizeSchedule(input);
    if (!normalized.ok) throw badRequest(normalized.error);
    const db = c.get('db');
    await assertListExists(db, input.listId);
    const template: RecurringTask = {
      id: crypto.randomUUID(),
      listId: input.listId ?? null,
      title: input.title,
      notes: emptyToNull(input.notes),
      priority: input.priority ?? 'medium',
      ...normalized.schedule,
      active: true,
      activeFrom: c.get('today'),
      generatedThrough: null,
      importance: input.importance ?? IMPORTANCE_DEFAULT,
      createdAt: new Date().toISOString(),
    };
    await db.insert(recurringTasks).values(template);
    // Create this week's task right away (if its weekday hasn't passed).
    await ensureWeeklyInstances(db, c.get('today'), { templateIds: [template.id] });
    return c.json(
      await db.select().from(recurringTasks).where(eq(recurringTasks.id, template.id)).get(),
      201,
    );
  })
  .patch('/:id', async (c) => {
    const input = await readBody(c, recurringUpdateSchema);
    const db = c.get('db');
    const existing = await db
      .select()
      .from(recurringTasks)
      .where(eq(recurringTasks.id, c.req.param('id')))
      .get();
    if (!existing) throw notFound('Recurring task not found');
    if (input.listId !== undefined) await assertListExists(db, input.listId);

    const normalized = normalizeSchedule({
      period: input.period ?? existing.period,
      mode: input.mode ?? existing.mode,
      weekday: input.weekday !== undefined ? input.weekday : existing.weekday,
      monthDays: input.monthDays ?? existing.monthDays,
      timesPerMonth:
        input.timesPerMonth !== undefined ? input.timesPerMonth : existing.timesPerMonth,
    });
    if (!normalized.ok) throw badRequest(normalized.error);
    const resumed = input.active === true && !existing.active;

    const [template] = await db
      .update(recurringTasks)
      .set({
        ...input,
        ...(input.notes !== undefined && { notes: emptyToNull(input.notes) }),
        ...normalized.schedule,
        // Resuming counts as a new start, so a passed weekday waits until next week.
        ...(resumed && { activeFrom: c.get('today') }),
      })
      .where(eq(recurringTasks.id, existing.id))
      .returning();
    if (resumed) await ensureWeeklyInstances(db, c.get('today'), { templateIds: [existing.id] });
    return c.json(template);
  })
  .delete('/:id', async (c) => {
    // Already-created tasks stay (SPEC §6).
    const [template] = await c
      .get('db')
      .delete(recurringTasks)
      .where(eq(recurringTasks.id, c.req.param('id')))
      .returning({ id: recurringTasks.id });
    if (!template) throw notFound('Recurring task not found');
    return c.body(null, 204);
  });
