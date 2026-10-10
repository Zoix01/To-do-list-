import { dateInZone, daysBetween, formatShortDate, isISODate, mondayOf } from './dates';
import type { ISODate, List, Priority, Task, TaskFlag } from './types';

// ---------------------------------------------------------------------------
// Planned date (SPEC §5.1)
// ---------------------------------------------------------------------------

// There is no automatic planned date: a task is planned only when I set one.

export interface Planning {
  deadline: ISODate;
  plannedDate: ISODate | null;
  plannedManual: boolean;
}

/** Planning fields for a new task: unplanned unless a planned date is given. */
export function newTaskPlanning(
  deadline: ISODate,
  plannedDate: ISODate | null | undefined,
): Planning {
  return {
    deadline,
    plannedDate: plannedDate ?? null,
    plannedManual: plannedDate !== undefined && plannedDate !== null,
  };
}

/**
 * Applies a deadline and/or planned-date change. Setting `plannedDate`
 * (including null = unplan) marks it manual; a deadline change never moves
 * the planned date.
 */
export function applyPlanningChange(
  current: Planning,
  change: { deadline?: ISODate; plannedDate?: ISODate | null },
): Planning {
  const deadline = change.deadline ?? current.deadline;
  if (change.plannedDate !== undefined) {
    return { deadline, plannedDate: change.plannedDate, plannedManual: true };
  }
  return { deadline, plannedDate: current.plannedDate, plannedManual: current.plannedManual };
}

/**
 * Returns an error message, or null if the deadline is acceptable.
 * A deadline in the past is rejected unless it is the task's unchanged
 * current deadline (pass `currentDeadline` when editing).
 */
export function deadlineError(
  deadline: ISODate,
  today: ISODate,
  currentDeadline?: ISODate,
): string | null {
  if (!isISODate(deadline)) return 'Deadline must be a valid date';
  if (currentDeadline !== undefined && deadline === currentDeadline) return null;
  if (deadline < today) return 'Deadline cannot be in the past';
  return null;
}

/**
 * Returns an error message, or null if the planned date is acceptable.
 * null (unplanned) is always fine. A past date is rejected unless it is the
 * task's unchanged current planned date (pass `currentPlanned` when editing).
 */
export function plannedDateError(
  plannedDate: ISODate | null,
  today: ISODate,
  currentPlanned?: ISODate | null,
): string | null {
  if (plannedDate === null) return null;
  if (!isISODate(plannedDate)) return 'Planned date must be a valid date';
  if (currentPlanned !== undefined && plannedDate === currentPlanned) return null;
  if (plannedDate < today) return 'Planned date cannot be in the past';
  return null;
}

// ---------------------------------------------------------------------------
// Flags (SPEC §5.2)
// ---------------------------------------------------------------------------

type FlagFields = Pick<Task, 'deadline' | 'plannedDate' | 'completedAt'>;

export function taskFlag(task: FlagFields, today: ISODate): TaskFlag {
  if (task.completedAt !== null) return null;
  if (task.deadline < today) return 'overdue';
  if (task.plannedDate !== null && task.plannedDate < today) return 'missed_plan';
  return null;
}

export function isPlannedAfterDeadline(task: Pick<Task, 'deadline' | 'plannedDate'>): boolean {
  return task.plannedDate !== null && task.plannedDate > task.deadline;
}

// ---------------------------------------------------------------------------
// Deadline label (SPEC §8.1)
// ---------------------------------------------------------------------------

export function deadlineLabel(deadline: ISODate, today: ISODate): string {
  const days = daysBetween(today, deadline);
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days >= 2 && days <= 6) return `due in ${days} days`;
  return `due ${formatShortDate(deadline)}`;
}

// ---------------------------------------------------------------------------
// Sorting (SPEC §8.3)
// ---------------------------------------------------------------------------

/** Czech collation: diacritics and "ch" after "h". */
export const czechCollator = new Intl.Collator('cs');

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function urgency(task: Pick<Task, 'priority' | 'deadline'>, today: ISODate): number {
  const days = daysBetween(today, task.deadline);
  return PRIORITY_WEIGHT[task.priority] / Math.max(days, 0.5);
}

type SortFields = Pick<
  Task,
  'id' | 'title' | 'priority' | 'deadline' | 'plannedDate' | 'completedAt'
>;

function overdueRank(task: SortFields, today: ISODate): number {
  const flag = taskFlag(task, today);
  return flag === 'overdue' ? 0 : flag === 'missed_plan' ? 1 : 2;
}

/** Red first (most overdue first), then orange (oldest plan first), then the rest. */
function compareOverdue(a: SortFields, b: SortFields, today: ISODate): number {
  const rankA = overdueRank(a, today);
  const rankB = overdueRank(b, today);
  if (rankA !== rankB) return rankA - rankB;
  if (rankA === 0) return compareStrings(a.deadline, b.deadline);
  if (rankA === 1) return compareStrings(a.plannedDate ?? '', b.plannedDate ?? '');
  return 0;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTail(a: SortFields, b: SortFields): number {
  return czechCollator.compare(a.title, b.title) || compareStrings(a.id, b.id);
}

export function compareByDeadline(a: SortFields, b: SortFields, today: ISODate): number {
  return compareOverdue(a, b, today) || compareStrings(a.deadline, b.deadline) || compareTail(a, b);
}

export function compareByUrgency(a: SortFields, b: SortFields, today: ISODate): number {
  return (
    compareOverdue(a, b, today) ||
    urgency(b, today) - urgency(a, today) ||
    compareStrings(a.deadline, b.deadline) ||
    compareTail(a, b)
  );
}

export type SortMode = 'deadline' | 'urgency' | 'list' | 'priority';

export interface PriorityGroup<T> {
  priority: Priority;
  tasks: T[];
}

/** High → medium → low; all three groups always present (drop targets); each by deadline. */
export function groupByPriority<T extends SortFields>(
  tasks: readonly T[],
  today: ISODate,
): PriorityGroup<T>[] {
  return (['high', 'medium', 'low'] as const).map((priority) => ({
    priority,
    tasks: tasks
      .filter((task) => task.priority === priority)
      .sort((a, b) => compareByDeadline(a, b, today)),
  }));
}

export function sortTasks<T extends SortFields>(
  tasks: readonly T[],
  mode: 'deadline' | 'urgency',
  today: ISODate,
): T[] {
  const compare = mode === 'deadline' ? compareByDeadline : compareByUrgency;
  return [...tasks].sort((a, b) => compare(a, b, today));
}

export interface ListGroup<T> {
  /** null = the "No list" group. */
  list: List | null;
  tasks: T[];
}

/** Groups in list order with "No list" last; empty groups are left out. */
export function groupByList<T extends SortFields & Pick<Task, 'listId'>>(
  tasks: readonly T[],
  lists: readonly List[],
  today: ISODate,
): ListGroup<T>[] {
  const orderedLists = [...lists].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: ListGroup<T>[] = [...orderedLists, null].map((list) => ({ list, tasks: [] }));
  const byId = new Map(groups.map((group) => [group.list?.id ?? null, group]));
  const noList = groups[groups.length - 1]!;
  for (const task of tasks) (byId.get(task.listId) ?? noList).tasks.push(task);
  for (const group of groups) group.tasks.sort((a, b) => compareByDeadline(a, b, today));
  return groups.filter((group) => group.tasks.length > 0);
}

// ---------------------------------------------------------------------------
// Today screen (SPEC §8.1)
// ---------------------------------------------------------------------------

export interface TodaySections<T> {
  overdue: T[];
  missedPlan: T[];
  today: T[];
  dueToday: T[];
  /** Weekly instances of the current week that aren't planned on a day yet. */
  thisWeek: T[];
}

/** Each open task lands in the first section it matches. */
export function todaySections<T extends SortFields & Pick<Task, 'recurringId' | 'weekStart'>>(
  tasks: readonly T[],
  today: ISODate,
): TodaySections<T> {
  const sections: TodaySections<T> = {
    overdue: [],
    missedPlan: [],
    today: [],
    dueToday: [],
    thisWeek: [],
  };
  const currentWeek = mondayOf(today);
  for (const task of tasks) {
    if (task.completedAt !== null) continue;
    const flag = taskFlag(task, today);
    if (flag === 'overdue') sections.overdue.push(task);
    else if (flag === 'missed_plan') sections.missedPlan.push(task);
    else if (task.plannedDate === today) sections.today.push(task);
    else if (task.deadline === today) sections.dueToday.push(task);
    else if (
      task.recurringId !== null &&
      task.weekStart === currentWeek &&
      task.plannedDate === null
    ) {
      sections.thisWeek.push(task);
    }
  }
  for (const section of Object.values(sections) as T[][]) {
    section.sort((a, b) => compareByDeadline(a, b, today));
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Completed archive (SPEC §5.3)
// ---------------------------------------------------------------------------

export interface CompletedGroup<T> {
  date: ISODate;
  tasks: T[];
}

/** Grouped by completion date in `timeZone`, newest first. */
export function groupCompleted<T extends Pick<Task, 'completedAt'>>(
  tasks: readonly T[],
  timeZone: string,
): CompletedGroup<T>[] {
  const done = tasks
    .filter((task) => task.completedAt !== null)
    .sort((a, b) => compareStrings(b.completedAt!, a.completedAt!));
  const groups = new Map<ISODate, T[]>();
  for (const task of done) {
    const date = dateInZone(new Date(task.completedAt!), timeZone);
    const group = groups.get(date);
    if (group) group.push(task);
    else groups.set(date, [task]);
  }
  return [...groups].map(([date, grouped]) => ({ date, tasks: grouped }));
}
