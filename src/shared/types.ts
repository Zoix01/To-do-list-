/** Calendar date as `YYYY-MM-DD`, no time. */
export type ISODate = string;

/** Instant as an ISO 8601 UTC string, e.g. `2026-10-10T08:15:00.000Z`. */
export type Timestamp = string;

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * Fixed list palette, in color-picker order (SPEC §14). Red and amber are left out
 * on purpose: they mean overdue / missed plan and high / medium priority.
 */
export const LIST_COLORS = [
  '#E8925A',
  '#A8B55E',
  '#7FA36B',
  '#4FB077',
  '#5FA39A',
  '#6A9FB5',
  '#7B8FC9',
  '#9A82C2',
  '#B77CD0',
  '#B87AA6',
  '#C98A8A',
  '#A08C76',
] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export interface List {
  id: string;
  name: string;
  color: ListColor;
  sortOrder: number;
  createdAt: Timestamp;
}

export interface Task {
  id: string;
  /** null = loose task (no list). */
  listId: string | null;
  title: string;
  notes: string | null;
  priority: Priority;
  deadline: ISODate;
  plannedDate: ISODate | null;
  /** True once the planned date was set or cleared by hand. */
  plannedManual: boolean;
  recurringId: string | null;
  weekStart: ISODate | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Red = deadline passed; orange = planned date passed. */
export type TaskFlag = 'overdue' | 'missed_plan' | null;

export interface Me {
  timeZone: string;
}
