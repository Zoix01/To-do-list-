import {
  addDays,
  addMonths,
  endOfMonth,
  isoWeekday,
  maxDate,
  mondayOf,
  startOfMonth,
} from './dates';
import type { Habit, HabitFrequency, ISODate, Weekday } from './types';

/*
 * Habit logic (SPEC §7). Everything is expressed as a list of "periods":
 * - daily / weekdays: each scheduled day is a period, met when ticked;
 * - per_week / per_month: each calendar week (Mon–Sun) / month is a period,
 *   met when its checks reach the target.
 * Streaks and rates only look at periods, so Phase 5 can add streak freezes by
 * marking periods, without rewriting this logic.
 */

type HabitRules = Pick<Habit, 'frequency' | 'weekdays' | 'target'>;
type Checks = ReadonlySet<ISODate>;

export interface HabitPeriod {
  start: ISODate;
  end: ISODate;
  /** Checks inside the period. */
  count: number;
  met: boolean;
  /** The period containing today (still running). */
  current: boolean;
}

export function isScheduled(habit: HabitRules, date: ISODate): boolean {
  if (habit.frequency === 'weekdays') return habit.weekdays.includes(isoWeekday(date));
  return true;
}

function countBetween(checks: Checks, start: ISODate, end: ISODate): number {
  let count = 0;
  for (const date of checks) if (date >= start && date <= end) count += 1;
  return count;
}

function periodBounds(frequency: HabitFrequency, date: ISODate): [ISODate, ISODate] {
  if (frequency === 'per_week') return [mondayOf(date), addDays(mondayOf(date), 6)];
  if (frequency === 'per_month') return [startOfMonth(date), endOfMonth(date)];
  return [date, date];
}

/** Periods from the one containing `from` up to the one containing `today`, oldest first. */
export function habitPeriods(
  habit: HabitRules,
  checks: Checks,
  from: ISODate,
  today: ISODate,
): HabitPeriod[] {
  const periods: HabitPeriod[] = [];
  if (from > today) return periods;
  if (habit.frequency === 'daily' || habit.frequency === 'weekdays') {
    for (let date = from; date <= today; date = addDays(date, 1)) {
      if (!isScheduled(habit, date)) continue;
      const count = checks.has(date) ? 1 : 0;
      periods.push({ start: date, end: date, count, met: count > 0, current: date === today });
    }
    return periods;
  }
  const target = Math.max(1, habit.target ?? 1);
  let [start, end] = periodBounds(habit.frequency, from);
  while (start <= today) {
    const count = countBetween(checks, start, end);
    periods.push({ start, end, count, met: count >= target, current: today <= end });
    const next = habit.frequency === 'per_week' ? addDays(start, 7) : addMonths(start, 1);
    [start, end] = periodBounds(habit.frequency, next);
  }
  return periods;
}

function earliest(checks: Checks, fallback: ISODate): ISODate {
  let first = fallback;
  for (const date of checks) if (date < first) first = date;
  return first;
}

/**
 * Consecutive met periods counting back from today. A current period that is
 * not met yet (today not ticked, week/month not finished) doesn't break it.
 */
export function currentStreak(habit: HabitRules, checks: Checks, today: ISODate): number {
  const periods = habitPeriods(habit, checks, earliest(checks, today), today);
  let streak = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i]!;
    if (period.current && !period.met) continue;
    if (!period.met) break;
    streak += 1;
  }
  return streak;
}

/** Longest run of consecutive met periods ever. */
export function bestStreak(habit: HabitRules, checks: Checks, today: ISODate): number {
  let best = 0;
  let run = 0;
  for (const period of habitPeriods(habit, checks, earliest(checks, today), today)) {
    if (period.met) {
      run += 1;
      best = Math.max(best, run);
    } else if (!period.current) {
      run = 0;
    }
  }
  return best;
}

export function isDueToday(habit: HabitRules, checks: Checks, today: ISODate): boolean {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return isScheduled(habit, today);
  const [start, end] = periodBounds(habit.frequency, today);
  return countBetween(checks, start, end) < Math.max(1, habit.target ?? 1);
}

/** Today screen: due today, or already ticked today (so it can be un-ticked). */
export function showOnToday(habit: HabitRules, checks: Checks, today: ISODate): boolean {
  return checks.has(today) || isDueToday(habit, checks, today);
}

export interface HabitProgress {
  done: number;
  target: number;
  /** "this week" / "this month" */
  label: string;
}

/** "2/4 this week" for per_week / per_month habits; null otherwise. */
export function habitProgress(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
): HabitProgress | null {
  if (habit.frequency !== 'per_week' && habit.frequency !== 'per_month') return null;
  const [start, end] = periodBounds(habit.frequency, today);
  return {
    done: countBetween(checks, start, end),
    target: Math.max(1, habit.target ?? 1),
    label: habit.frequency === 'per_week' ? 'this week' : 'this month',
  };
}

export interface CompletionRate {
  met: number;
  total: number;
  /** 0–1, or null when there is nothing to measure yet. */
  rate: number | null;
  /** "last 30 days" / "last 12 weeks" / "last 12 months" */
  window: string;
}

/**
 * Share of met periods over the last 30 days (or 12 weeks / 12 months), counting
 * only from `startedOn` (habit creation, or the earliest check if earlier).
 * The current period counts only if it is already met.
 */
export function completionRate(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  startedOn: ISODate,
): CompletionRate {
  const start = earliest(checks, startedOn);
  let windowStart: ISODate;
  let window: string;
  if (habit.frequency === 'per_week') {
    windowStart = addDays(mondayOf(today), -7 * 11);
    window = 'last 12 weeks';
  } else if (habit.frequency === 'per_month') {
    windowStart = addMonths(startOfMonth(today), -11);
    window = 'last 12 months';
  } else {
    windowStart = addDays(today, -29);
    window = 'last 30 days';
  }
  const periods = habitPeriods(habit, checks, maxDate(windowStart, start), today).filter(
    (period) => !period.current || period.met,
  );
  const met = periods.filter((period) => period.met).length;
  return { met, total: periods.length, rate: periods.length ? met / periods.length : null, window };
}

/**
 * Checks the frequency settings and returns them cleaned up (unused fields
 * cleared, weekdays sorted), or an error message.
 */
export function normalizeHabitRules(
  rules: Pick<Habit, 'frequency'> & { weekdays?: Weekday[]; target?: number | null },
): { ok: true; rules: HabitRules } | { ok: false; error: string } {
  const { frequency } = rules;
  if (frequency === 'daily') return { ok: true, rules: { frequency, weekdays: [], target: null } };
  if (frequency === 'weekdays') {
    const weekdays = [...new Set(rules.weekdays ?? [])].sort((a, b) => a - b);
    if (weekdays.length === 0) return { ok: false, error: 'Choose at least one weekday' };
    return { ok: true, rules: { frequency, weekdays, target: null } };
  }
  const max = frequency === 'per_week' ? 7 : 31;
  const target = rules.target;
  if (!target || !Number.isInteger(target) || target < 1 || target > max) {
    return { ok: false, error: `Target must be between 1 and ${max}` };
  }
  return { ok: true, rules: { frequency, weekdays: [], target } };
}

const UNITS: Record<HabitFrequency, [string, string]> = {
  daily: ['day', 'days'],
  weekdays: ['day', 'days'],
  per_week: ['week', 'weeks'],
  per_month: ['month', 'months'],
};

/** "12 days", "1 week", "3 months" */
export function formatStreak(count: number, frequency: HabitFrequency): string {
  const [one, many] = UNITS[frequency];
  return `${count} ${count === 1 ? one : many}`;
}
