import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { isISODate } from '../../shared/dates';
import { normalizeHabitRules } from '../../shared/habits';
import { habitCreateSchema, habitUpdateSchema } from '../../shared/schemas';
import { WEIGHT_DEFAULT } from '../../shared/economy';
import type { EarnedReward, Habit, HabitWithChecks } from '../../shared/types';
import { habitChecks, habits } from '../db/schema';
import type { AppEnv, Db } from '../env';
import { badRequest, notFound, readBody } from '../http';
import { assertCosmeticsAvailable } from '../services/cosmetics';
import { loadHabits } from '../services/habits';
import { payTick } from '../services/rewards';
import { rewardsContext } from './rewards';

async function findHabit(db: Db, id: string): Promise<Habit> {
  const habit = await db.select().from(habits).where(eq(habits.id, id)).get();
  if (!habit) throw notFound('Habit not found');
  return habit;
}

/** Habits and their checks (SPEC §7, §8.4). */
export const habitRoutes = new Hono<AppEnv>()
  .get('/', async (c) =>
    c.json<HabitWithChecks[]>((await loadHabits(c.get('db'), c.get('today'))).habits),
  )
  .post('/', async (c) => {
    const input = await readBody(c, habitCreateSchema);
    await assertCosmeticsAvailable(c.get('db'), { color: input.color, icon: input.icon });
    const normalized = normalizeHabitRules(input);
    if (!normalized.ok) throw badRequest(normalized.error);
    const habit: Habit = {
      id: crypto.randomUUID(),
      name: input.name,
      color: input.color,
      icon: input.icon ?? null,
      ...normalized.rules,
      archived: false,
      weight: input.weight ?? WEIGHT_DEFAULT,
      createdAt: new Date().toISOString(),
    };
    await c.get('db').insert(habits).values(habit);
    return c.json<HabitWithChecks>({ ...habit, checks: [], frozen: [], armedFreezes: 0 }, 201);
  })
  .patch('/:id', async (c) => {
    const input = await readBody(c, habitUpdateSchema);
    const db = c.get('db');
    const existing = await findHabit(db, c.req.param('id'));
    await assertCosmeticsAvailable(db, { color: input.color, icon: input.icon });
    const normalized = normalizeHabitRules({
      frequency: input.frequency ?? existing.frequency,
      weekdays: input.weekdays ?? existing.weekdays,
      target: input.target !== undefined ? input.target : existing.target,
    });
    if (!normalized.ok) throw badRequest(normalized.error);
    const [habit] = await db
      .update(habits)
      .set({ ...input, ...normalized.rules })
      .where(eq(habits.id, existing.id))
      .returning();
    return c.json(habit);
  })
  .delete('/:id', async (c) => {
    const db = c.get('db');
    const habit = await findHabit(db, c.req.param('id'));
    await db.batch([
      db.delete(habitChecks).where(eq(habitChecks.habitId, habit.id)),
      db.delete(habits).where(eq(habits.id, habit.id)),
    ]);
    return c.body(null, 204);
  })
  // Tick a day (idempotent). Future days can't be ticked. Returns what the tick earned (SPEC §13.4).
  .put('/:id/checks/:date', async (c) => {
    const date = c.req.param('date');
    if (!isISODate(date)) throw badRequest('Invalid date');
    if (date > c.get('today')) throw badRequest('Future days can’t be ticked');
    const db = c.get('db');
    const habit = await findHabit(db, c.req.param('id'));
    const before = await db
      .select({ date: habitChecks.date })
      .from(habitChecks)
      .where(eq(habitChecks.habitId, habit.id));
    await db.insert(habitChecks).values({ habitId: habit.id, date }).onConflictDoNothing();
    const checksBefore = new Set(before.map((check) => check.date));
    return c.json<EarnedReward>(await payTick(rewardsContext(c), habit, checksBefore, date));
  })
  // Un-tick a day (idempotent).
  .delete('/:id/checks/:date', async (c) => {
    await c
      .get('db')
      .delete(habitChecks)
      .where(
        and(eq(habitChecks.habitId, c.req.param('id')), eq(habitChecks.date, c.req.param('date'))),
      );
    return c.body(null, 204);
  });
