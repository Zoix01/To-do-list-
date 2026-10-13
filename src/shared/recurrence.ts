import { addDays, endOfMonth, mondayOf, startOfMonth } from './dates';
import type { ISODate, RecurringMode, RecurringPeriod, RecurringTask, Weekday } from './types';

/** Most tasks a "N times a month" template can create (SPEC §6.1). */
export const MAX_TIMES_PER_MONTH = 10;

/** The dates of one recurring instance (SPEC §6). */
export interface InstanceDates {
  /** Start of the instance's period: its Monday, or the 1st for monthly ones. */
  weekStart: ISODate;
  /** Tells instances of one period apart: day of month, k of N, or 0 for weekly. */
  occurrence: number;
  deadline: ISODate;
  plannedDate: ISODate | null;
}

type Schedule = Pick<RecurringTask, 'period' | 'mode' | 'weekday' | 'monthDays' | 'timesPerMonth'>;

/** Start of the week or month containing `date`. */
export function periodStartOf(period: RecurringPeriod, date: ISODate): ISODate {
  return period === 'month' ? startOfMonth(date) : mondayOf(date);
}

/**
 * Weekly. Fixed: deadline = planned date = the weekday in that week.
 * Flexible: deadline = Sunday of that week, unplanned.
 */
export function instanceFor(
  template: Pick<RecurringTask, 'mode' | 'weekday'>,
  weekStart: ISODate,
): InstanceDates {
  if (template.mode === 'fixed') {
    const date = addDays(weekStart, (template.weekday ?? 1) - 1);
    return { weekStart, occurrence: 0, deadline: date, plannedDate: date };
  }
  return { weekStart, occurrence: 0, deadline: addDays(weekStart, 6), plannedDate: null };
}

/**
 * Monthly (SPEC §6.1). Set days: planned and due on each day (29–31 clamp to the
 * month's last day; one task per date). N times: unplanned, due on day
 * ⌊30·k/N⌋ for k < N and on the last day for k = N.
 */
export function monthlyInstances(template: Schedule, monthStart: ISODate): InstanceDates[] {
  const last = endOfMonth(monthStart);
  const lastDay = Number(last.slice(8));
  const onDay = (day: number) => addDays(monthStart, Math.min(day, lastDay) - 1);
  const instances: InstanceDates[] = [];
  if (template.mode === 'fixed') {
    const seen = new Set<ISODate>();
    for (const day of [...template.monthDays].sort((a, b) => a - b)) {
      const date = onDay(day);
      if (seen.has(date)) continue;
      seen.add(date);
      instances.push({ weekStart: monthStart, occurrence: day, deadline: date, plannedDate: date });
    }
    return instances;
  }
  const times = Math.max(1, template.timesPerMonth ?? 1);
  for (let k = 1; k <= times; k++) {
    const deadline = k === times ? last : onDay(Math.max(1, Math.floor((30 * k) / times)));
    instances.push({ weekStart: monthStart, occurrence: k, deadline, plannedDate: null });
  }
  return instances;
}

/** How many tasks a template creates per period (for monthly: per month). */
export function tasksPerPeriod(template: Schedule): number {
  if (template.period === 'week') return 1;
  return template.mode === 'fixed'
    ? template.monthDays.length
    : Math.max(1, template.timesPerMonth ?? 1);
}

export interface GenerationPlan {
  create: InstanceDates[];
  /** New value for the template's `generatedThrough`. */
  generatedThrough: ISODate | null;
}

type GenerationFields = Schedule &
  Pick<RecurringTask, 'active' | 'activeFrom' | 'generatedThrough'>;

/**
 * Which instances to create now: the current period, plus next week right after
 * completing a weekly instance (`includeNextWeek`; monthly ones wait for their
 * month). Each period is considered once (tracked by `generatedThrough`), so
 * calling this again creates nothing and a deleted instance is not brought back.
 * Dates before `activeFrom` are skipped: a fixed weekday that already passed
 * waits for next week, and a monthly template starts with the rest of the month.
 */
export function planGeneration(
  template: GenerationFields,
  today: ISODate,
  { includeNextWeek = false }: { includeNextWeek?: boolean } = {},
): GenerationPlan {
  if (!template.active) return { create: [], generatedThrough: template.generatedThrough };
  const current = periodStartOf(template.period, today);
  const periods =
    template.period === 'week' && includeNextWeek ? [current, addDays(current, 7)] : [current];
  const create: InstanceDates[] = [];
  let through = template.generatedThrough;
  for (const period of periods) {
    if (through !== null && period <= through) continue;
    through = period;
    if (template.period === 'month') {
      create.push(
        ...monthlyInstances(template, period).filter((i) => i.deadline >= template.activeFrom),
      );
      continue;
    }
    const instance = instanceFor(template, period);
    if (template.mode === 'fixed' && instance.deadline < template.activeFrom) continue;
    create.push(instance);
  }
  return { create, generatedThrough: through };
}

/**
 * Checks a template's schedule and returns it cleaned up (unused fields
 * cleared, days sorted), or an error message.
 */
export function normalizeSchedule(input: {
  period?: RecurringPeriod;
  mode: RecurringMode;
  weekday?: Weekday | null;
  monthDays?: number[];
  timesPerMonth?: number | null;
}): { ok: true; schedule: Schedule } | { ok: false; error: string } {
  const period = input.period ?? 'week';
  const empty = { weekday: null, monthDays: [], timesPerMonth: null };
  if (period === 'week') {
    if (input.mode === 'flexible')
      return { ok: true, schedule: { period, mode: 'flexible', ...empty } };
    if (!input.weekday) return { ok: false, error: 'Choose a day' };
    return { ok: true, schedule: { period, mode: 'fixed', ...empty, weekday: input.weekday } };
  }
  if (input.mode === 'fixed') {
    const days = [...new Set(input.monthDays ?? [])].sort((a, b) => a - b);
    if (days.length === 0) return { ok: false, error: 'Choose at least one day' };
    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) {
      return { ok: false, error: 'Days must be between 1 and 31' };
    }
    return { ok: true, schedule: { period, mode: 'fixed', ...empty, monthDays: days } };
  }
  const times = input.timesPerMonth;
  if (!times || !Number.isInteger(times) || times < 1 || times > MAX_TIMES_PER_MONTH) {
    return { ok: false, error: `Times must be between 1 and ${MAX_TIMES_PER_MONTH}` };
  }
  return { ok: true, schedule: { period, mode: 'flexible', ...empty, timesPerMonth: times } };
}

/** "Every Tue", "Any day", "On the 1st and 15th", "3× a month" */
export function describeSchedule(
  template: Schedule,
  weekdayName: (day: Weekday) => string,
): string {
  if (template.period === 'week') {
    return template.mode === 'fixed' && template.weekday
      ? `Every ${weekdayName(template.weekday)}`
      : 'Any day';
  }
  if (template.mode === 'flexible') return `${template.timesPerMonth ?? 1}× a month`;
  const days = template.monthDays.map(ordinal);
  const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days.at(-1)}` : days[0];
  return `On the ${list}`;
}

function ordinal(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${day}${suffix}`;
}
