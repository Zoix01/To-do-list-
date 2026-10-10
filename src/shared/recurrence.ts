import { addDays, mondayOf } from './dates';
import type { ISODate, RecurringTask } from './types';

/** The dates of one weekly instance (SPEC §6). */
export interface InstanceDates {
  /** Monday of the instance's week. */
  weekStart: ISODate;
  deadline: ISODate;
  plannedDate: ISODate | null;
}

/**
 * Fixed: deadline = planned date = the weekday in that week.
 * Flexible: deadline = Sunday of that week, unplanned.
 */
export function instanceFor(
  template: Pick<RecurringTask, 'mode' | 'weekday'>,
  weekStart: ISODate,
): InstanceDates {
  if (template.mode === 'fixed') {
    const date = addDays(weekStart, (template.weekday ?? 1) - 1);
    return { weekStart, deadline: date, plannedDate: date };
  }
  return { weekStart, deadline: addDays(weekStart, 6), plannedDate: null };
}

export interface GenerationPlan {
  create: InstanceDates[];
  /** New value for the template's `generatedThrough`. */
  generatedThrough: ISODate | null;
}

type GenerationFields = Pick<
  RecurringTask,
  'mode' | 'weekday' | 'active' | 'activeFrom' | 'generatedThrough'
>;

/**
 * Which instances to create now: the current week, plus next week right after
 * completing an instance (`includeNextWeek`). Each week is considered once
 * (tracked by `generatedThrough`), so calling this again creates nothing and a
 * deleted instance is not brought back. A fixed weekday before `activeFrom`
 * is skipped, so a template whose weekday already passed starts next week.
 */
export function planGeneration(
  template: GenerationFields,
  today: ISODate,
  { includeNextWeek = false }: { includeNextWeek?: boolean } = {},
): GenerationPlan {
  if (!template.active) return { create: [], generatedThrough: template.generatedThrough };
  const current = mondayOf(today);
  const weeks = includeNextWeek ? [current, addDays(current, 7)] : [current];
  const create: InstanceDates[] = [];
  let through = template.generatedThrough;
  for (const week of weeks) {
    if (through !== null && week <= through) continue;
    through = week;
    const instance = instanceFor(template, week);
    if (template.mode === 'fixed' && instance.deadline < template.activeFrom) continue;
    create.push(instance);
  }
  return { create, generatedThrough: through };
}
