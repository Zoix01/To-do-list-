import { addDays, dateInZone, daysBetween, isISODate } from './dates';
import { bestStreak, currentStreak, habitProgress, isDueToday } from './habits';
import { compareByDeadline, czechCollator, isPlannedAfterDeadline, taskFlag } from './tasks';
import type { HabitWithChecks, ISODate, List, Priority, Task, TaskFlag, Weekday } from './types';

/*
 * Logic behind the Claude connector's tools (SPEC §9): how tasks and habits
 * are presented to Claude, filtering, list-name matching, the overview and
 * which OAuth redirect URIs are accepted. Pure functions, unit tested.
 */

// ---------------------------------------------------------------------------
// Which clients may connect (SPEC §9.1: only Claude)
// ---------------------------------------------------------------------------

/** claude.ai web, desktop and mobile apps. */
export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

/**
 * Accepts Claude's hosted callback, and Claude Code's loopback callback
 * (`http://localhost:<any port>/callback` or `http://127.0.0.1:<any port>/callback`).
 */
export function isAllowedRedirectUri(uri: string): boolean {
  if (uri === CLAUDE_CALLBACK) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.pathname === '/callback' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  );
}

/**
 * Which Claude a connection belongs to. claude.ai web, desktop and mobile share
 * one connection; Claude Code (on this computer) is another. A new connection
 * replaces older ones of the same kind, since Claude registers anew each time.
 */
export function connectionKind(redirectUris: readonly string[]): 'claude' | 'claude-code' {
  return redirectUris.includes(CLAUDE_CALLBACK) ? 'claude' : 'claude-code';
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('cs');
}

export type ListMatch = { ok: true; list: List } | { ok: false; error: string };

/** Finds a list by name, ignoring case; otherwise an error naming the valid lists. */
export function matchList(lists: readonly List[], name: string): ListMatch {
  const wanted = normalizeName(name);
  const list = lists.find((candidate) => normalizeName(candidate.name) === wanted);
  if (list) return { ok: true, list };
  const names = [...lists]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((candidate) => `"${candidate.name}"`);
  return {
    ok: false,
    error: names.length
      ? `No list called "${name}". Valid lists: ${names.join(', ')}. Omit the list for a task without one.`
      : `No list called "${name}". There are no lists yet; omit the list.`,
  };
}

// ---------------------------------------------------------------------------
// How tasks and habits are shown to Claude
// ---------------------------------------------------------------------------

const PRIORITY_NUMBER: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

export interface AssistantTask {
  id: string;
  title: string;
  list: string | null;
  priority: Priority;
  /** 0 low, 1 medium, 2 high — as shown in the app. */
  priorityNumber: number;
  deadline: ISODate;
  plannedDate: ISODate | null;
  /** "overdue" (deadline passed) or "missed_plan" (planned date passed), for open tasks. */
  flag: TaskFlag;
  plannedAfterDeadline: boolean;
  /** Created by a weekly template. */
  weekly: boolean;
  notes: string | null;
  completed: boolean;
  /** Completion date in the configured time zone. */
  completedOn: ISODate | null;
}

export function assistantTask(
  task: Task,
  listsById: ReadonlyMap<string, List>,
  today: ISODate,
  timeZone: string,
): AssistantTask {
  return {
    id: task.id,
    title: task.title,
    list: task.listId ? (listsById.get(task.listId)?.name ?? null) : null,
    priority: task.priority,
    priorityNumber: PRIORITY_NUMBER[task.priority],
    deadline: task.deadline,
    plannedDate: task.plannedDate,
    flag: taskFlag(task, today),
    plannedAfterDeadline: isPlannedAfterDeadline(task),
    weekly: task.recurringId !== null,
    notes: task.notes,
    completed: task.completedAt !== null,
    completedOn: task.completedAt ? dateInZone(new Date(task.completedAt), timeZone) : null,
  };
}

function describeFrequency(habit: HabitWithChecks): string {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  switch (habit.frequency) {
    case 'daily':
      return 'every day';
    case 'weekdays':
      return `on ${habit.weekdays.map((day: Weekday) => days[day - 1]).join(', ')}`;
    case 'per_week':
      return `${habit.target}× per week`;
    case 'per_month':
      return `${habit.target}× per month`;
  }
}

const STREAK_UNIT: Record<HabitWithChecks['frequency'], string> = {
  daily: 'days',
  weekdays: 'scheduled days',
  per_week: 'weeks',
  per_month: 'months',
};

export interface AssistantHabit {
  name: string;
  frequency: string;
  archived: boolean;
  currentStreak: number;
  bestStreak: number;
  streakUnit: string;
  dueToday: boolean;
  doneToday: boolean;
  /** "2/4 this week" style progress for per-week / per-month habits. */
  progress: string | null;
}

export function assistantHabit(habit: HabitWithChecks, today: ISODate): AssistantHabit {
  const checks = new Set(habit.checks);
  const progress = habitProgress(habit, checks, today);
  return {
    name: habit.name,
    frequency: describeFrequency(habit),
    archived: habit.archived,
    currentStreak: currentStreak(habit, checks, today),
    bestStreak: bestStreak(habit, checks, today),
    streakUnit: STREAK_UNIT[habit.frequency],
    dueToday: isDueToday(habit, checks, today),
    doneToday: checks.has(today),
    progress: progress ? `${progress.done}/${progress.target} ${progress.label}` : null,
  };
}

// ---------------------------------------------------------------------------
// list_tasks
// ---------------------------------------------------------------------------

export interface TaskFilters {
  /** A list name, or null for tasks without a list. Omit for all lists. */
  list?: string | null;
  status?: 'open' | 'completed';
  deadlineFrom?: ISODate;
  deadlineTo?: ISODate;
  /** "none" = tasks without a flag. */
  flag?: 'overdue' | 'missed_plan' | 'none';
}

/** Filters tasks (already loaded for the requested status), sorted like the app's deadline sort. */
export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  listId: string | null | undefined,
  today: ISODate,
): Task[] {
  return tasks
    .filter((task) => listId === undefined || task.listId === listId)
    .filter((task) => !filters.deadlineFrom || task.deadline >= filters.deadlineFrom)
    .filter((task) => !filters.deadlineTo || task.deadline <= filters.deadlineTo)
    .filter((task) => {
      if (!filters.flag) return true;
      const flag = taskFlag(task, today);
      return filters.flag === 'none' ? flag === null : flag === filters.flag;
    })
    .sort((a, b) =>
      filters.status === 'completed'
        ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '') ||
          czechCollator.compare(a.title, b.title)
        : compareByDeadline(a, b, today),
    );
}

// ---------------------------------------------------------------------------
// get_overview
// ---------------------------------------------------------------------------

/** Longest range get_overview accepts. */
export const MAX_OVERVIEW_DAYS = 92;

export function overviewRangeError(from: string, to: string): string | null {
  if (!isISODate(from) || !isISODate(to)) return 'Dates must be in YYYY-MM-DD format';
  if (from > to) return '"from" must be on or before "to"';
  if (daysBetween(from, to) + 1 > MAX_OVERVIEW_DAYS) {
    return `The range can be at most ${MAX_OVERVIEW_DAYS} days`;
  }
  return null;
}

export interface Overview {
  today: ISODate;
  timeZone: string;
  range: { from: ISODate; to: ISODate };
  /** All open tasks whose deadline has passed (red flag), regardless of the range. */
  overdue: AssistantTask[];
  /** All open tasks whose planned date has passed but not their deadline (orange flag). */
  missedPlan: AssistantTask[];
  /** Open tasks planned on each day of the range (days without tasks are left out). */
  plannedByDay: Record<ISODate, AssistantTask[]>;
  /** Open tasks due on each day of the range. */
  deadlinesByDay: Record<ISODate, AssistantTask[]>;
  /** All open tasks without a planned date. */
  unplanned: AssistantTask[];
  /** Tasks completed during the range, by completion date in the configured time zone. */
  completed: AssistantTask[];
  habits: (AssistantHabit & { daysDoneInRange: ISODate[] })[];
}

export function buildOverview(input: {
  openTasks: readonly Task[];
  completedTasks: readonly Task[];
  lists: readonly List[];
  habits: readonly HabitWithChecks[];
  from: ISODate;
  to: ISODate;
  today: ISODate;
  timeZone: string;
}): Overview {
  const { from, to, today, timeZone } = input;
  const listsById = new Map(input.lists.map((list) => [list.id, list]));
  const view = (task: Task) => assistantTask(task, listsById, today, timeZone);
  const open = [...input.openTasks].sort((a, b) => compareByDeadline(a, b, today));

  const plannedByDay: Record<ISODate, AssistantTask[]> = {};
  const deadlinesByDay: Record<ISODate, AssistantTask[]> = {};
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const planned = open.filter((task) => task.plannedDate === date);
    const due = open.filter((task) => task.deadline === date);
    if (planned.length) plannedByDay[date] = planned.map(view);
    if (due.length) deadlinesByDay[date] = due.map(view);
  }

  const completed = input.completedTasks
    .map(view)
    .filter(
      (task) => task.completedOn !== null && task.completedOn >= from && task.completedOn <= to,
    )
    .sort((a, b) => (a.completedOn ?? '').localeCompare(b.completedOn ?? ''));

  return {
    today,
    timeZone,
    range: { from, to },
    overdue: open.filter((task) => taskFlag(task, today) === 'overdue').map(view),
    missedPlan: open.filter((task) => taskFlag(task, today) === 'missed_plan').map(view),
    plannedByDay,
    deadlinesByDay,
    unplanned: open.filter((task) => task.plannedDate === null).map(view),
    completed,
    habits: input.habits
      .filter((habit) => !habit.archived)
      .map((habit) => ({
        ...assistantHabit(habit, today),
        daysDoneInRange: habit.checks.filter((date) => date >= from && date <= to),
      })),
  };
}
