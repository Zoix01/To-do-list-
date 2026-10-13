import type { HabitFrequency, ISODate } from './types';

/*
 * Every number of the gamification (SPEC §13), in one place. The logic reads
 * only from here, so tuning the economy means changing this file.
 */

/** Coins for a perfect week, before streak bonuses (13.2). Editable in Settings. */
export const WEEKLY_BUDGET = 10000;
/** Realistic share of a perfect week; shop prices are based on it (13.2). Editable in Settings. */
export const EXPECTED_RATE = 0.75;
/** Shop prices are rounded to this (13.6). */
export const PRICE_ROUNDING = 50;
/** Earned coins are rounded to this (13.3, 13.4). */
export const COIN_ROUNDING = 10;
/** XP per coin earned from ticks and weekly tasks (13.4). */
export const XP_PER_COIN = 0.1;
/**
 * Thursday 15 Oct 2026: nothing earns before it (13.2). It may fall mid-week: its
 * week still gets a full snapshot, but only the days from the start earn, so the
 * first week earns less. Season 1 starts on it too.
 */
export const GAMIFICATION_START: ISODate = '2026-10-15';

/**
 * Importance of a habit or recurring task, chosen in its form (13.3):
 * 1 Light, 2 Normal, 3 Important, 4 Essential.
 */
export const IMPORTANCE_LEVELS = [1, 2, 3, 4] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];
export const IMPORTANCE_DEFAULT: Importance = 2;
export const IMPORTANCE_NAMES: Record<Importance, string> = {
  1: 'Light',
  2: 'Normal',
  3: 'Important',
  4: 'Essential',
};
/** How much of the budget each level weighs (13.3). */
export const IMPORTANCE_WEIGHTS: Record<Importance, number> = { 1: 1, 2: 2, 3: 3, 4: 4 };
/**
 * How often an item repeats also counts, damped (13.3): its share grows with
 * completionsPerWeek ^ FREQUENCY_EXPONENT. With 0.75, over a 4-week month a
 * daily item earns most in total (28 ticks), a weekly one less (4), a monthly
 * one least (1); per completion it's the other way round: weekly ≈ 1.6× and
 * monthly ≈ 2.3× a daily tick.
 */
export const FREQUENCY_EXPONENT = 0.75;

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

/**
 * Mystery box price = TYPICAL_WEEK × BOX_PRICE_SHARE / BOXES_PER_TYPICAL_WEEK (13.6):
 * spending half of a typical week buys 3 boxes (1,250 coins each). With the free
 * milestone and level-up boxes, that finishes each season's collection within
 * its 13 weeks, also at level 20+ when free boxes are rare (balance simulation).
 */
export const BOX_PRICE_SHARE = 0.5;
export const BOXES_PER_TYPICAL_WEEK = 3;
/** Other prices as a multiple of the box price (13.6). */
export const FREEZE_PRICE_IN_BOXES = 1;
export const VACATION_PRICE_IN_BOXES = 0.5;
/** Cosmetics: a bit more than a box, 1,800 at the defaults. */
export const COSMETIC_PRICE_IN_BOXES = 1.44;
/** A purchase can be undone this long after buying (the toast shows for 5 s; 13.18). */
export const REFUND_WINDOW_SECONDS = 30;
/** Price range of a real-life reward (13.6). */
export const REWARD_PRICE_MIN = 1;
export const REWARD_PRICE_MAX = 1_000_000;

/** What a mystery box contains, exactly one result per box (13.7). */
export const BOX_ODDS = {
  piece: 0.7,
  pouch: 0.07,
  charm: 0.06,
  freeze: 0.05,
  vacation: 0.05,
  reward: 0.05,
  cosmetic: 0.02,
} as const;
/** Rarity of an art piece from a box (13.7). */
export const TIER_ODDS = { common: 0.7, rare: 0.25, legendary: 0.05 } as const;
/** Shards for a duplicate piece (13.7). */
export const DUPLICATE_SHARDS = { common: 10, rare: 20, legendary: 50 } as const;
/** Shard price of a missing piece of the current season (13.8). */
export const PIECE_SHARD_PRICES = { common: 40, rare: 60, legendary: 80 } as const;
/** Pieces of past seasons cost this much more (13.8). */
export const PAST_SEASON_PRICE_FACTOR = 1.5;
/** Coin pouch = box price × (POUCH_MIN + POUCH_SPREAD × u^POUCH_EXPONENT), u in [0, 1) (13.7). */
export const POUCH_MIN = 0.1;
export const POUCH_SPREAD = 4.9;
export const POUCH_EXPONENT = 2.5;
