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

/** 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const RECURRING_MODES = ['fixed', 'flexible'] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

/** Template that creates one task per week (SPEC §6). */
export interface RecurringTask {
  id: string;
  listId: string | null;
  title: string;
  notes: string | null;
  priority: Priority;
  mode: RecurringMode;
  /** Only for 'fixed'. */
  weekday: Weekday | null;
  active: boolean;
  /** Date it was created or last resumed; fixed weekdays before it are skipped. */
  activeFrom: ISODate;
  /** Monday of the latest week already generated (each week is generated once). */
  generatedThrough: ISODate | null;
  /** Share of the weekly coin budget, 1–10 (SPEC §13.3). */
  weight: number;
  createdAt: Timestamp;
}

export const HABIT_FREQUENCIES = ['daily', 'weekdays', 'per_week', 'per_month'] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number];

export interface Habit {
  id: string;
  name: string;
  color: ListColor;
  /** Empty until the Phase 5 icon picker. */
  icon: string | null;
  frequency: HabitFrequency;
  /** Only for 'weekdays'. */
  weekdays: Weekday[];
  /** Only for 'per_week' (1–7) and 'per_month' (1–31). */
  target: number | null;
  archived: boolean;
  /** Share of the weekly coin budget, 1–10 (SPEC §13.3). */
  weight: number;
  createdAt: Timestamp;
}

/** A habit as sent by the API: with the dates it was ticked on. */
export interface HabitWithChecks extends Habit {
  checks: ISODate[];
}

/** Settings → Claude connector (SPEC §9.1). */
export interface ConnectorStatus {
  /** False until the OAUTH_KV namespace is set up. */
  configured: boolean;
  apps: { id: string; name: string; connectedAt: Timestamp }[];
}

export interface Me {
  timeZone: string;
}

// ---------------------------------------------------------------- Gamification (SPEC §13)

export type InventoryItemType = 'box' | 'freeze' | 'vacation' | 'charm' | 'reward';
export type InventoryStatus = 'owned' | 'armed' | 'scheduled' | 'used' | 'opened' | 'consumed';
export type InventorySource = 'purchase' | 'box' | 'milestone' | 'level';

/** What a habit or weekly task earns right now (Habits and Weekly screens). */
export interface ItemRewardInfo {
  /** In this week's snapshot; false = "Earns from Mon". */
  inSnapshot: boolean;
  /** Value per completion this week. */
  value: number | null;
  /** What a tick today would pay, with its multiplier; null if it pays nothing. */
  nextTick: { coins: number; multiplier: number } | null;
}

export interface RewardsSummary {
  /** First day anything earns. */
  start: ISODate;
  started: boolean;
  coins: number;
  shards: number;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  /** Unopened mystery boxes. */
  boxes: number;
  /** Coins earned from ticks and weekly tasks this week, against the budget. */
  week: { start: ISODate; earned: number; budget: number };
  /** Budget of the next snapshot, for the "≈ 330 coins per tick from Monday" hints. */
  nextBudget: number;
  habits: Record<string, ItemRewardInfo>;
  weekly: Record<string, ItemRewardInfo>;
}

/** What a tick or a completed weekly task earned, for the animations. */
export interface EarnedReward {
  coins: number;
  multiplier: number;
  milestones: { kind: 'streak' | 'count'; threshold: number; boxes: number }[];
  /** Levels reached by this reward. */
  levelUps: number[];
}
