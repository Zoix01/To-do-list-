import type { RewardIcon } from './shop';

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

/**
 * Extra list colors, unlocked as cosmetics (SPEC §13.12): lighter and softer
 * than the base 12, shown after them in the picker once owned.
 */
export const EXTRA_LIST_COLORS = [
  '#C9B98A',
  '#B8C27A',
  '#93BC8F',
  '#6FB7A8',
  '#7FB4CF',
  '#9AA6D8',
  '#C6A0DA',
  '#D490B8',
  '#E2A48C',
  '#C49A62',
  '#B9AFA4',
  '#8FA7A0',
] as const;

export const ALL_LIST_COLORS = [...LIST_COLORS, ...EXTRA_LIST_COLORS] as const;
export type ListColor = (typeof ALL_LIST_COLORS)[number];

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
  /** Start of a recurring instance's period: its Monday, or the 1st for monthly ones (SPEC §6.1). */
  weekStart: ISODate | null;
  /** Tells instances of the same period apart (day of month, or k of N); 0 for weekly ones. */
  occurrence: number;
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

export const RECURRING_PERIODS = ['week', 'month'] as const;
export type RecurringPeriod = (typeof RECURRING_PERIODS)[number];

/** Template that creates tasks every week or month (SPEC §6). */
export interface RecurringTask {
  id: string;
  listId: string | null;
  title: string;
  notes: string | null;
  priority: Priority;
  mode: RecurringMode;
  /** Repeats every week or every month (SPEC §6.1). */
  period: RecurringPeriod;
  /** Weekly 'fixed' only. */
  weekday: Weekday | null;
  /** Monthly 'fixed' only: days of the month, 1–31, sorted. */
  monthDays: number[];
  /** Monthly 'flexible' only: tasks per month, 1–10. */
  timesPerMonth: number | null;
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
  /** Periods covered by a streak freeze (period starts, SPEC §13.9). */
  frozen: ISODate[];
  /** Streak freezes armed on this habit, waiting for a miss. */
  armedFreezes: number;
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
export type InventoryStatus =
  'owned' | 'armed' | 'scheduled' | 'used' | 'opened' | 'consumed' | 'refunded';
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
  /** Typical week and current shop prices (13.6). */
  economy: { weeklyBudget: number; expectedRate: number };
  prices: { box: number; freeze: number; vacation: number; cosmetic: number };
  /** Vacation days, past and planned: all habits are paused on them (13.9). */
  vacationDays: ISODate[];
  /** Cosmetic ids I own, e.g. "color:sand" (13.12). */
  cosmetics: string[];
  /** The tick animation chosen in Settings → Appearance. */
  tickAnimation: string;
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

/** A real-life reward I defined (SPEC §13.6). */
export interface ShopReward {
  id: string;
  name: string;
  price: number;
  icon: RewardIcon;
  sortOrder: number;
  archived: boolean;
  createdAt: Timestamp;
}

export interface InventoryItem {
  id: string;
  type: InventoryItemType;
  status: InventoryStatus;
  /**
   * freeze: { habitId, armedOn } while armed, plus periodStart once used;
   * vacation: { date } once scheduled; reward: { rewardId, name, price, icon }.
   */
  payload: Record<string, unknown> | null;
  source: InventorySource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** One line of the History (SPEC §13.10), newest first. */
export interface HistoryEntry {
  key: string;
  kind:
    'ticks' | 'weekly' | 'streak' | 'count' | 'level' | 'buy' | 'refund' | 'use' | 'box' | 'shards';
  /** The day it belongs to. */
  date: ISODate;
  createdAt: Timestamp;
  coins: number;
  shards: number;
  boxes: number;
  /** Habit, recurring task or item name, when there is one. */
  name: string | null;
  /** e.g. { threshold: 50 }, { level: 4 }, { action: 'arm', item: 'freeze' }, { count: 3 } */
  detail: Record<string, unknown> | null;
}

export interface InventoryView {
  items: InventoryItem[];
  history: HistoryEntry[];
}

/** A box's stored result (SPEC §13.7); the app animates it. */
export interface BoxOpening {
  boxId: string;
  type: 'piece' | 'pouch' | 'charm' | 'freeze' | 'vacation' | 'reward' | 'cosmetic';
  tier: 'common' | 'rare' | 'legendary' | null;
  pieceId: string | null;
  seasonId: string | null;
  duplicate: boolean;
  shards: number;
  coins: number;
  rewardId: string | null;
  rewardName: string | null;
  cosmeticId: string | null;
  charmUsed: boolean;
  createdAt: Timestamp;
}

export interface OwnedPiece {
  pieceId: string;
  seasonId: string;
  acquiredAt: Timestamp;
  source: 'box' | 'shards';
}
