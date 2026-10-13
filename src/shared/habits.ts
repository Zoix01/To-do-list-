import {
  addDays,
  addMonths,
  daysBetween,
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
 * Phase 5 marks periods (SPEC §13.9): a period covered by a streak freeze is
 * "frozen", one paused by vacation days is "paused". Both keep a streak going
 * without adding to it.
 */

type HabitRules = Pick<Habit, 'frequency' | 'weekdays' | 'target'>;
type Checks = ReadonlySet<ISODate>;

/** Streak freezes used (by period start) and vacation days (SPEC §13.9). */
export interface HabitMarks {
  frozen: ReadonlySet<ISODate>;
  vacation: ReadonlySet<ISODate>;
}

export const NO_MARKS: HabitMarks = { frozen: new Set(), vacation: new Set() };

/** A habit's marks from the API: its frozen periods and the vacation days. */
export function marksOf(
  habit: { frozen?: readonly ISODate[] },
  vacation: Iterable<ISODate> = [],
): HabitMarks {
  return { frozen: new Set(habit.frozen ?? []), vacation: new Set(vacation) };
}

export type PeriodState = 'met' | 'missed' | 'frozen' | 'paused' | 'open';

export interface HabitPeriod {
  start: ISODate;
  end: ISODate;
  /** Checks inside the period. */
  count: number;
  /** Checks needed: the target, reduced by vacation days for per_week / per_month. */
  target: number;
  met: boolean;
  /**
   * met; missed; frozen (a freeze covered the miss); paused (vacation);
   * open (the running period, not met yet: it doesn't break a streak).
   */
  state: PeriodState;
  /** The period containing today (still running). */
  current: boolean;
}

/** Frozen and paused periods neither break a streak nor add to it. */
function isSkipped(period: HabitPeriod): boolean {
  return period.state === 'frozen' || period.state === 'paused' || period.state === 'open';
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

/**
 * The per_week / per_month target, reduced proportionally to the vacation days
 * in the period, rounded down (SPEC §13.9). 0 means the period is paused.
 */
export function effectiveTarget(
  habit: HabitRules,
  start: ISODate,
  end: ISODate,
  vacation: ReadonlySet<ISODate>,
): number {
  const target = Math.max(1, habit.target ?? 1);
  const days = daysBetween(start, end) + 1;
  const off = countBetween(vacation, start, end);
  return off === 0 ? target : Math.floor((target * (days - off)) / days);
}

/** Periods from the one containing `from` up to the one containing `today`, oldest first. */
export function habitPeriods(
  habit: HabitRules,
  checks: Checks,
  from: ISODate,
  today: ISODate,
  marks: HabitMarks = NO_MARKS,
): HabitPeriod[] {
  const periods: HabitPeriod[] = [];
  if (from > today) return periods;
  const period = (start: ISODate, end: ISODate, count: number, target: number): HabitPeriod => {
    const current = start <= today && today <= end;
    const met = target > 0 && count >= target;
    let state: PeriodState;
    if (target === 0) state = 'paused';
    else if (met) state = 'met';
    else if (marks.frozen.has(start)) state = 'frozen';
    else state = current ? 'open' : 'missed';
    return { start, end, count, target, met, state, current };
  };
  if (habit.frequency === 'daily' || habit.frequency === 'weekdays') {
    for (let date = from; date <= today; date = addDays(date, 1)) {
      if (!isScheduled(habit, date)) continue;
      // A vacation day is paused, even if ticked (it doesn't add to the streak).
      const target = marks.vacation.has(date) ? 0 : 1;
      periods.push(period(date, date, checks.has(date) ? 1 : 0, target));
    }
    return periods;
  }
  let [start, end] = periodBounds(habit.frequency, from);
  while (start <= today) {
    const target = effectiveTarget(habit, start, end, marks.vacation);
    periods.push(period(start, end, countBetween(checks, start, end), target));
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
 * not met yet (today not ticked, week/month not finished) doesn't break it, and
 * neither do frozen or paused periods.
 */
export function currentStreak(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  marks: HabitMarks = NO_MARKS,
): number {
  const periods = habitPeriods(habit, checks, earliest(checks, today), today, marks);
  let streak = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i]!;
    if (period.met) streak += 1;
    else if (!isSkipped(period)) break;
  }
  return streak;
}

/** Longest run of consecutive met periods ever. */
export function bestStreak(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  marks: HabitMarks = NO_MARKS,
): number {
  let best = 0;
  let run = 0;
  for (const period of habitPeriods(habit, checks, earliest(checks, today), today, marks)) {
    if (period.met) {
      run += 1;
      best = Math.max(best, run);
    } else if (!isSkipped(period)) {
      run = 0;
    }
  }
  return best;
}

function containsDate(period: HabitPeriod, date: ISODate): boolean {
  return period.start <= date && date <= period.end;
}

/**
 * Consecutive met periods right before the period containing `date`: the
 * streak a tick on `date` builds on (Phase 5 streak multiplier, SPEC §13.4).
 */
export function streakBefore(
  habit: HabitRules,
  checks: Checks,
  date: ISODate,
  marks: HabitMarks = NO_MARKS,
): number {
  const periods = habitPeriods(habit, checks, earliest(checks, date), date, marks);
  let i = periods.length - 1;
  if (i >= 0 && containsDate(periods[i]!, date)) i -= 1;
  let streak = 0;
  for (; i >= 0; i--) {
    const period = periods[i]!;
    if (period.met) streak += 1;
    else if (!isSkipped(period)) break;
  }
  return streak;
}

export interface RunsAround {
  /** Met periods in the run directly before the period containing `date`. */
  before: number;
  /** The run including the period containing `date`, if that period is met. */
  run: { start: ISODate; length: number } | null;
  /** Met periods in the run directly after it. */
  after: number;
}

/**
 * The streak runs touching the period that contains `date`, looking at periods
 * up to `until` (today). A weekdays habit's day off has no period: run is null.
 */
export function runsAround(
  habit: HabitRules,
  checks: Checks,
  date: ISODate,
  until: ISODate,
  marks: HabitMarks = NO_MARKS,
): RunsAround {
  const periods = habitPeriods(habit, checks, earliest(checks, date), maxDate(date, until), marks);
  const index = periods.findIndex((period) => containsDate(period, date));
  if (index < 0) return { before: 0, run: null, after: 0 };
  const inRun = (period: HabitPeriod) => period.met || isSkipped(period);
  let first = index;
  while (first > 0 && inRun(periods[first - 1]!)) first -= 1;
  let last = index;
  while (last < periods.length - 1 && inRun(periods[last + 1]!)) last += 1;
  const metIn = (from: number, to: number) =>
    periods.slice(from, to + 1).filter((period) => period.met).length;
  const before = metIn(first, index - 1);
  const after = metIn(index + 1, last);
  if (!periods[index]!.met) return { before, run: null, after };
  const runStart = periods.slice(first, last + 1).find((period) => period.met)!.start;
  return { before, run: { start: runStart, length: before + 1 + after }, after };
}

export function isDueToday(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  marks: HabitMarks = NO_MARKS,
): boolean {
  // On a vacation day nothing is due (SPEC §13.9).
  if (marks.vacation.has(today)) return false;
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return isScheduled(habit, today);
  const [start, end] = periodBounds(habit.frequency, today);
  return countBetween(checks, start, end) < effectiveTarget(habit, start, end, marks.vacation);
}

/** Today screen: due today, or already ticked today (so it can be un-ticked). */
export function showOnToday(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  marks: HabitMarks = NO_MARKS,
): boolean {
  return checks.has(today) || isDueToday(habit, checks, today, marks);
}

export interface HabitProgress {
  done: number;
  target: number;
  /** "this week" / "this month" */
  label: string;
}

/** "2/4 this week" for per_week / per_month habits (target reduced by vacation days); null otherwise. */
export function habitProgress(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  marks: HabitMarks = NO_MARKS,
): HabitProgress | null {
  if (habit.frequency !== 'per_week' && habit.frequency !== 'per_month') return null;
  const [start, end] = periodBounds(habit.frequency, today);
  return {
    done: countBetween(checks, start, end),
    target: effectiveTarget(habit, start, end, marks.vacation),
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
 * The current period counts only if it is already met; frozen and paused
 * periods don't count.
 */
export function completionRate(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  startedOn: ISODate,
  marks: HabitMarks = NO_MARKS,
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
  const periods = habitPeriods(habit, checks, maxDate(windowStart, start), today, marks).filter(
    (period) => period.state === 'met' || period.state === 'missed',
  );
  const met = periods.filter((period) => period.met).length;
  return { met, total: periods.length, rate: periods.length ? met / periods.length : null, window };
}

// ---------------------------------------------------------------- Streak freezes (SPEC §13.9)

export interface ArmedFreeze {
  id: string;
  /** The day it was armed: it can only cover periods ending on or after it. */
  armedOn: ISODate;
}

export interface UsedFreeze extends ArmedFreeze {
  periodStart: ISODate;
}

export interface FreezeSettlement {
  /** Used freezes whose period got met by a back-fill: they go back to armed. */
  release: string[];
  /** Armed freezes used now, and the missed period each covers. */
  consume: { freezeId: string; periodStart: ISODate }[];
}

/**
 * Settles a habit's freezes up to today: an armed freeze covers a period that
 * ended missed, if it was armed by the period's end and there is a streak of at
 * least 1 to protect (oldest armed freeze first). A frozen period that has
 * since been met releases its freeze.
 */
export function settleFreezes(
  habit: HabitRules,
  checks: Checks,
  today: ISODate,
  vacation: ReadonlySet<ISODate>,
  used: UsedFreeze[],
  armed: ArmedFreeze[],
): FreezeSettlement {
  const usedByPeriod = new Map(used.map((freeze) => [freeze.periodStart, freeze]));
  const firstDay = [...used.map((f) => f.armedOn), ...armed.map((f) => f.armedOn)].sort()[0];
  if (!firstDay) return { release: [], consume: [] };

  // Release freezes whose period is met now.
  const periods = habitPeriods(habit, checks, earliest(checks, firstDay), today, {
    frozen: new Set(),
    vacation,
  });
  const release: string[] = [];
  const pool = [...armed];
  const frozen = new Set<ISODate>();
  for (const [periodStart, freeze] of usedByPeriod) {
    const period = periods.find((p) => p.start === periodStart);
    if (period?.met) {
      release.push(freeze.id);
      pool.push(freeze);
    } else {
      frozen.add(periodStart);
    }
  }
  pool.sort((a, b) => a.armedOn.localeCompare(b.armedOn));

  const consume: FreezeSettlement['consume'] = [];
  let run = 0;
  for (const period of periods) {
    if (period.met) run += 1;
    else if (period.state === 'paused' || period.current || frozen.has(period.start)) continue;
    else {
      const index = pool.findIndex((freeze) => freeze.armedOn <= period.end);
      if (run > 0 && index >= 0) {
        const [freeze] = pool.splice(index, 1);
        consume.push({ freezeId: freeze!.id, periodStart: period.start });
      } else {
        run = 0;
      }
    }
  }
  return { release, consume };
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
