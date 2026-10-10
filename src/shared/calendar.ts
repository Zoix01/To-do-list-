import { compareByDeadline, taskFlag } from './tasks';
import type { ISODate, Task, TaskFlag } from './types';

/**
 * A task appears in the calendar up to twice (SPEC §8.2):
 * - "planned": filled chip on the planned date, draggable
 * - "deadline": outlined chip with a flag on the deadline, not draggable
 * - "both": one combined chip when planned date = deadline (draggable)
 */
export type EntryKind = 'planned' | 'deadline' | 'both';

export interface CalendarEntry {
  /** Unique per entry: `${taskId}:${kind}`. */
  id: string;
  taskId: string;
  date: ISODate;
  kind: EntryKind;
  flag: TaskFlag;
  draggable: boolean;
  /** Position within a day: overdue first, then by deadline and title. */
  order: number;
}

export function calendarEntries(tasks: readonly Task[], today: ISODate): CalendarEntry[] {
  const open = tasks
    .filter((task) => task.completedAt === null)
    .sort((a, b) => compareByDeadline(a, b, today));
  const entries: CalendarEntry[] = [];
  open.forEach((task, order) => {
    const flag = taskFlag(task, today);
    const entry = (kind: EntryKind, date: ISODate): CalendarEntry => ({
      id: `${task.id}:${kind}`,
      taskId: task.id,
      date,
      kind,
      flag,
      draggable: kind !== 'deadline',
      order,
    });
    if (task.plannedDate === task.deadline) {
      entries.push(entry('both', task.deadline));
      return;
    }
    if (task.plannedDate !== null) entries.push(entry('planned', task.plannedDate));
    entries.push(entry('deadline', task.deadline));
  });
  return entries;
}

/** Open tasks without a planned date, for the "Unplanned" tray; earliest deadline first. */
export function unplannedTasks<T extends Task>(tasks: readonly T[], today: ISODate): T[] {
  return tasks
    .filter((task) => task.completedAt === null && task.plannedDate === null)
    .sort((a, b) => compareByDeadline(a, b, today));
}

/** Drops (planning a task on a day) are only allowed for today or later. */
export function canPlanOn(date: ISODate, today: ISODate): boolean {
  return date >= today;
}
