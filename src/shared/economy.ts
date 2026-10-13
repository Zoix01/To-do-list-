import type { HabitFrequency, ISODate } from './types';

/*
 * Every number of the gamification (SPEC §13), in one place. The logic reads
 * only from here, so tuning the economy means changing this file.
 */

/** Coins for a perfect week, before streak bonuses (13.2). Editable in Settings. */
export const WEEKLY_BUDGET = 10000;
/** Realistic share of a perfect week; shop prices are based on it (13.2). Editable in Settings. */
export const EXPECTED_RATE = 0.7;
/** Shop prices are rounded to this (13.6). */
export const PRICE_ROUNDING = 50;
/** Earned coins are rounded to this (13.3, 13.4). */
export const COIN_ROUNDING = 10;
/** XP per coin earned from ticks and weekly tasks (13.4). */
export const XP_PER_COIN = 0.1;
/** Monday; nothing earns before it. First week snapshot and Season 1 start (13.2). */
export const GAMIFICATION_START: ISODate = '2026-10-19';

/** Weight of a habit or weekly task: its share of the weekly budget (13.3). */
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 10;
export const WEIGHT_DEFAULT = 5;

/** Streak multiplier: +10% per full streak period, at most +50% (13.4). */
export const STREAK_BONUS_PER_PERIOD = 0.1;
export const STREAK_BONUS_MAX = 0.5;

/** Ticks for today and this many days back earn coins; older back-fills don't (13.4). */
export const PAID_BACKFILL_DAYS = 1;

/**
 * Streak milestones as [streak length, boxes] (13.5), in the habit's own unit:
 * scheduled days, weeks or months.
 */
export const STREAK_MILESTONES: Record<HabitFrequency, readonly (readonly [number, number])[]> = {
  daily: [
    [7, 1],
    [30, 3],
    [100, 8],
    [365, 20],
  ],
  weekdays: [
    [7, 1],
    [30, 3],
    [100, 8],
    [365, 20],
  ],
  per_week: [
    [4, 1],
    [12, 3],
    [26, 8],
    [52, 20],
  ],
  per_month: [
    [3, 1],
    [6, 3],
    [12, 8],
    [24, 20],
  ],
};

/** Count milestones as [total completions, boxes], once ever per item (13.5). */
export const COUNT_MILESTONES: readonly (readonly [number, number])[] = [
  [10, 1],
  [25, 1],
  [50, 2],
  [100, 3],
  [250, 5],
  [500, 8],
  [1000, 12],
];

/** XP to go from level L to L+1: LEVEL_XP_BASE + LEVEL_XP_STEP × (L − 1) (13.5). */
export const LEVEL_XP_BASE = 600;
export const LEVEL_XP_STEP = 100;
/** Mystery boxes per level-up (13.5). */
export const BOXES_PER_LEVEL = 1;
