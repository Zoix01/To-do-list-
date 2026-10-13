import { asc } from 'drizzle-orm';
import type { HabitWithChecks, ISODate } from '../../shared/types';
import { habitChecks, habits } from '../db/schema';
import type { Db } from '../env';
import { loadMarks, settleAllFreezes } from './inventory';

/**
 * Habits with their checks, frozen periods and armed freezes, after settling
 * freezes up to today (SPEC §7, §13.9). Shared by the app's API and the Claude
 * connector. Also returns the vacation days, which pause every habit.
 */
export async function loadHabits(
  db: Db,
  today: ISODate,
): Promise<{ habits: HabitWithChecks[]; vacation: ISODate[] }> {
  await settleAllFreezes(db, today);
  const [rows, checks] = await db.batch([
    db.select().from(habits).orderBy(asc(habits.createdAt)),
    db.select().from(habitChecks).orderBy(asc(habitChecks.date)),
  ]);
  const marks = await loadMarks(db);
  const byHabit = new Map<string, string[]>();
  for (const check of checks) {
    const dates = byHabit.get(check.habitId);
    if (dates) dates.push(check.date);
    else byHabit.set(check.habitId, [check.date]);
  }
  return {
    habits: rows.map((habit) => ({
      ...habit,
      checks: byHabit.get(habit.id) ?? [],
      frozen: [...(marks.frozen.get(habit.id) ?? [])].sort(),
      armedFreezes: marks.armed.get(habit.id) ?? 0,
    })),
    vacation: [...marks.vacation].sort(),
  };
}
