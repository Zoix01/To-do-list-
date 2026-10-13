import { addDays, mondayOf, startOfMonth } from './dates';
import {
  BOXES_PER_LEVEL,
  FREQUENCY_EXPONENT,
  IMPORTANCE_WEIGHTS,
  type Importance,
  COIN_ROUNDING,
  COUNT_MILESTONES,
  LEVEL_XP_BASE,
  LEVEL_XP_STEP,
  PAID_BACKFILL_DAYS,
  STREAK_BONUS_MAX,
  STREAK_BONUS_PER_PERIOD,
  STREAK_MILESTONES,
  XP_PER_COIN,
} from './economy';
import { isScheduled, NO_MARKS, runsAround, streakBefore, type HabitMarks } from './habits';
import { tasksPerPeriod } from './recurrence';
import type { Habit, ISODate, RecurringTask } from './types';

/*
 * Earning rules of the gamification (SPEC §13.3–13.5), as pure functions. The
 * Worker loads the data, calls these, and writes the resulting ledger entries
 * under their unique keys, so nothing is ever paid twice.
 */

type HabitRules = Pick<Habit, 'frequency' | 'weekdays' | 'target'>;

export type EconomyItemType = 'habit' | 'weekly';

export interface EconomyItem {
  type: EconomyItemType;
  id: string;
  importance: Importance;
  /** Habit rules (a monthly template counts as a per_month habit), or null for a weekly task. */
  rules: HabitRules | null;
}

/** A recurring template's rules for the economy: weekly = 1 a week, monthly = N a month (§6.1). */
export function templateRules(
  template: Pick<RecurringTask, 'period' | 'mode' | 'weekday' | 'monthDays' | 'timesPerMonth'>,
): HabitRules | null {
  if (template.period === 'week') return null;
  return { frequency: 'per_month', weekdays: [], target: tasksPerPeriod(template) };
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function itemKey(type: EconomyItemType, id: string): string {
  return `${type}:${id}`;
}

/** How many completions a perfect week has (13.3). */
export function completionsPerWeek(rules: HabitRules | null): number {
  if (!rules) return 1;
  switch (rules.frequency) {
    case 'daily':
      return 7;
    case 'weekdays':
      return Math.max(1, rules.weekdays.length);
    case 'per_week':
      return Math.max(1, rules.target ?? 1);
    case 'per_month':
      return (Math.max(1, rules.target ?? 1) * 12) / 52;
  }
}

/**
 * Items in the snapshot of the week starting `weekStart` (13.3): active habits
 * and weekly templates created before that Monday. One created mid-week waits
 * for the next snapshot.
 */
export function snapshotItems(
  habits: {
    id: string;
    importance: Importance;
    archived: boolean;
    createdOn: ISODate;
    rules: HabitRules;
  }[],
  templates: {
    id: string;
    importance: Importance;
    active: boolean;
    createdOn: ISODate;
    rules: HabitRules | null;
  }[],
  weekStart: ISODate,
): EconomyItem[] {
  return [
    ...habits
      .filter((habit) => !habit.archived && habit.createdOn < weekStart)
      .map((habit) => ({
        type: 'habit' as const,
        id: habit.id,
        importance: habit.importance,
        rules: habit.rules,
      })),
    ...templates
      .filter((template) => template.active && template.createdOn < weekStart)
      .map((template) => ({
        type: 'weekly' as const,
        id: template.id,
        importance: template.importance,
        rules: template.rules,
      })),
  ];
}

/** Value per completion of each item, keyed by itemKey (13.3). */
export function snapshotValues(items: EconomyItem[], budget: number): Map<string, number> {
  const weightOf = (item: EconomyItem) =>
    IMPORTANCE_WEIGHTS[item.importance] * completionsPerWeek(item.rules) ** FREQUENCY_EXPONENT;
  const totalWeight = items.reduce((sum, item) => sum + weightOf(item), 0);
  const values = new Map<string, number>();
  for (const item of items) {
    const share = (budget * weightOf(item)) / totalWeight;
    values.set(
      itemKey(item.type, item.id),
      roundTo(share / completionsPerWeek(item.rules), COIN_ROUNDING),
    );
  }
  return values;
}

/** Full streak periods behind a streak: weeks for daily / weekdays habits (13.4). */
export function fullStreakPeriods(rules: HabitRules, streak: number): number {
  if (rules.frequency === 'daily') return Math.floor(streak / 7);
  if (rules.frequency === 'weekdays')
    return Math.floor(streak / Math.max(1, rules.weekdays.length));
  return streak;
}

/** ×1.0 … ×1.5 (13.4). */
export function streakMultiplier(fullPeriods: number): number {
  const bonus = Math.min(STREAK_BONUS_MAX, STREAK_BONUS_PER_PERIOD * fullPeriods);
  return Math.round((1 + bonus) * 100) / 100;
}

export function xpForCoins(coins: number): number {
  return Math.round(coins * XP_PER_COIN);
}

/** Start of the per_week / per_month period containing `date` (used for the target cap). */
export function targetPeriodStart(rules: HabitRules, date: ISODate): ISODate | null {
  if (rules.frequency === 'per_week') return mondayOf(date);
  if (rules.frequency === 'per_month') return startOfMonth(date);
  return null;
}

/** Ticks for today and yesterday earn coins; older back-fills don't (13.4). */
export function isPaidTickDate(date: ISODate, today: ISODate): boolean {
  return date <= today && date >= addDays(today, -PAID_BACKFILL_DAYS);
}

export interface Milestone {
  key: string;
  kind: 'streak' | 'count';
  itemId: string;
  threshold: number;
  boxes: number;
}

/** Count milestones crossed when an item's completions go from `before` to `after` (13.5). */
export function countMilestones(itemId: string, before: number, after: number): Milestone[] {
  return COUNT_MILESTONES.filter(([threshold]) => before < threshold && threshold <= after).map(
    ([threshold, boxes]) => ({
      key: `count:${itemId}:${threshold}`,
      kind: 'count',
      itemId,
      threshold,
      boxes,
    }),
  );
}

export interface Reward {
  coins: number;
  xp: number;
  /** The streak multiplier the coins were paid with (1 when nothing was paid). */
  multiplier: number;
  milestones: Milestone[];
}

const NOTHING: Reward = { coins: 0, xp: 0, multiplier: 1, milestones: [] };

export interface TickPayInput {
  rules: HabitRules;
  /** Checks with the ticked date included. */
  checks: ReadonlySet<ISODate>;
  date: ISODate;
  today: ISODate;
  start: ISODate;
  /** The habit's value per completion in the week of `date`; null = not in that snapshot. */
  value: number | null;
  /** Ticks already paid in this week / month (per_week and per_month only). */
  paidInPeriod: number;
  /** The one-time catch-up ignores the back-fill limit (13.2). */
  catchUp?: boolean;
  /** Freezes and vacation days: they keep a streak without adding to it (13.9). */
  marks?: HabitMarks;
}

/** Coins a tick on `date` pays, with its multiplier; null when it pays nothing (13.4). */
export function tickPay(input: TickPayInput): { coins: number; multiplier: number } | null {
  const { rules, date } = input;
  if (input.value === null || date < input.start || input.today < input.start) return null;
  if (!input.catchUp && !isPaidTickDate(date, input.today)) return null;
  // A weekdays habit's day off isn't part of its week (completionsPerWeek), so it doesn't pay.
  if (!isScheduled(rules, date)) return null;
  // The cap is the full target: vacation days lower what a streak needs, not what can be earned.
  if (targetPeriodStart(rules, date) && input.paidInPeriod >= Math.max(1, rules.target ?? 1)) {
    return null;
  }
  const multiplier = streakMultiplier(
    fullStreakPeriods(rules, streakBefore(rules, input.checks, date, input.marks ?? NO_MARKS)),
  );
  return { coins: roundTo(input.value * multiplier, COIN_ROUNDING), multiplier };
}

export interface TickRewardInput extends Omit<TickPayInput, 'checks'> {
  habitId: string;
  /** Checks before this tick (without `date` unless it was already ticked). */
  checksBefore: ReadonlySet<ISODate>;
  /** The tick key was paid before (untick + re-tick). */
  alreadyPaid: boolean;
}

/** Everything one tick earns: coins, XP and milestones crossed by it (13.4, 13.5). */
export function tickReward(input: TickRewardInput): Reward {
  const { rules, date, habitId, checksBefore } = input;
  // Nothing earns, and no milestone counts as crossed, before the start (13.2).
  if (input.today < input.start || checksBefore.has(date)) return NOTHING;
  const checks = new Set(checksBefore).add(date);

  const pay = input.alreadyPaid ? null : tickPay({ ...input, checks });
  const milestones: Milestone[] = [];

  // Streak milestones: thresholds this tick takes the run past, once per run (keyed by its start).
  const marks = input.marks ?? NO_MARKS;
  const after = runsAround(rules, checks, date, input.today, marks);
  if (after.run) {
    const before = runsAround(rules, checksBefore, date, input.today, marks);
    const lengthBefore = before.run ? before.run.length : Math.max(before.before, before.after);
    for (const [threshold, boxes] of STREAK_MILESTONES[rules.frequency]) {
      if (lengthBefore < threshold && threshold <= after.run.length) {
        milestones.push({
          key: `streak:${habitId}:${after.run.start}:${threshold}`,
          kind: 'streak',
          itemId: habitId,
          threshold,
          boxes,
        });
      }
    }
  }
  milestones.push(...countMilestones(habitId, checksBefore.size, checks.size));

  const coins = pay?.coins ?? 0;
  return { coins, xp: xpForCoins(coins), multiplier: pay?.multiplier ?? 1, milestones };
}

export interface WeeklyRewardInput {
  templateId: string;
  /** Monday of the week the task's deadline falls in (§6.1). */
  weekStart: ISODate;
  /** The template's value in that week; null = not in that snapshot. */
  value: number | null;
  /** Completed instances of the template before this one. */
  completedBefore: number;
  alreadyPaid: boolean;
  today: ISODate;
  start: ISODate;
}

/** A completed weekly task: its week's full value, even when late; no multiplier (13.4). */
export function weeklyReward(input: WeeklyRewardInput): Reward {
  if (input.today < input.start) return NOTHING;
  const coins =
    !input.alreadyPaid && input.value !== null && addDays(input.weekStart, 6) >= input.start
      ? input.value
      : 0;
  return {
    coins,
    xp: xpForCoins(coins),
    multiplier: 1,
    milestones: countMilestones(input.templateId, input.completedBefore, input.completedBefore + 1),
  };
}

/** XP needed to go from `level` to the next (13.5). */
export function xpToNextLevel(level: number): number {
  return LEVEL_XP_BASE + LEVEL_XP_STEP * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP gathered towards the next level. */
  xpIntoLevel: number;
  xpForNext: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  let rest = xp;
  while (rest >= xpToNextLevel(level)) {
    rest -= xpToNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: rest, xpForNext: xpToNextLevel(level) };
}

// ---------------------------------------------------------------- Ledger entries

export type LedgerKind =
  'tick' | 'weekly' | 'streak' | 'count' | 'level' | 'buy' | 'refund' | 'use' | 'box' | 'shards';

export interface LedgerEntry {
  key: string;
  kind: LedgerKind;
  itemId: string | null;
  /** The day it belongs to: the tick date, the weekly task's week start, or the day it happened. */
  date: ISODate;
  coins: number;
  xp: number;
  boxes: number;
  /** Shown in the History, e.g. { threshold: 50 }. */
  detail: Record<string, unknown> | null;
}

/** Ledger entries for a reward: the payout itself (if any) and one per milestone. */
export function rewardEntries(
  payout: { key: string; kind: 'tick' | 'weekly'; itemId: string; date: ISODate },
  reward: Reward,
  today: ISODate,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  if (reward.coins > 0) {
    entries.push({
      ...payout,
      coins: reward.coins,
      xp: reward.xp,
      boxes: 0,
      detail: reward.multiplier === 1 ? null : { multiplier: reward.multiplier },
    });
  }
  for (const milestone of reward.milestones) {
    entries.push({
      key: milestone.key,
      kind: milestone.kind,
      itemId: milestone.itemId,
      date: today,
      coins: 0,
      xp: 0,
      boxes: milestone.boxes,
      detail: { threshold: milestone.threshold },
    });
  }
  return entries;
}

/** One entry per level reached with `totalXp` (levels 2 and up); existing keys are skipped on insert. */
export function levelEntries(totalXp: number, date: ISODate): LedgerEntry[] {
  const { level } = levelInfo(totalXp);
  const entries: LedgerEntry[] = [];
  for (let n = 2; n <= level; n++) {
    entries.push({
      key: `level:${n}`,
      kind: 'level',
      itemId: null,
      date,
      coins: 0,
      xp: 0,
      boxes: BOXES_PER_LEVEL,
      detail: { level: n },
    });
  }
  return entries;
}

// ---------------------------------------------------------------- One-time catch-up (13.2)

export interface CatchUpInput {
  habits: { id: string; rules: HabitRules; checks: ISODate[] }[];
  /** Completed recurring tasks, in completion order; weekStart = Monday of the deadline's week. */
  weekly: { taskId: string; templateId: string; weekStart: ISODate; completedOn: ISODate }[];
  /** Value per completion from the week snapshots; null = not in the snapshot. */
  valueOf: (type: EconomyItemType, id: string, weekStart: ISODate) => number | null;
  start: ISODate;
  today: ISODate;
}

/**
 * Replays every tick and weekly task from the start date up to today, day by
 * day, exactly as live operation would have paid them (with each day as
 * "today", so the back-fill limit doesn't cut anything). History before the
 * start counts for streaks and counts but pays nothing.
 */
export function catchUpEntries(input: CatchUpInput): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let xp = 0;
  const levelsPaid = new Set<string>();
  const paidInPeriod = new Map<string, number>();
  const weeklyDone = new Map<string, number>();
  const sortedChecks = input.habits.map((habit) => ({
    ...habit,
    checks: [...habit.checks].sort(),
  }));

  const add = (more: LedgerEntry[], day: ISODate) => {
    for (const entry of more) {
      entries.push(entry);
      xp += entry.xp;
    }
    for (const entry of levelEntries(xp, day)) {
      if (levelsPaid.has(entry.key)) continue;
      levelsPaid.add(entry.key);
      entries.push(entry);
    }
  };

  for (const done of input.weekly) {
    if (done.completedOn < input.start) {
      weeklyDone.set(done.templateId, (weeklyDone.get(done.templateId) ?? 0) + 1);
    }
  }

  for (let day = input.start; day <= input.today; day = addDays(day, 1)) {
    for (const habit of sortedChecks) {
      if (!habit.checks.includes(day)) continue;
      const checksBefore = new Set(habit.checks.filter((date) => date < day));
      const periodStart = targetPeriodStart(habit.rules, day);
      const periodKey = `${habit.id}:${periodStart}`;
      const reward = tickReward({
        habitId: habit.id,
        rules: habit.rules,
        checksBefore,
        date: day,
        today: day,
        start: input.start,
        value: input.valueOf('habit', habit.id, mondayOf(day)),
        paidInPeriod: paidInPeriod.get(periodKey) ?? 0,
        alreadyPaid: false,
      });
      if (reward.coins > 0) paidInPeriod.set(periodKey, (paidInPeriod.get(periodKey) ?? 0) + 1);
      add(
        rewardEntries(
          { key: `tick:${habit.id}:${day}`, kind: 'tick', itemId: habit.id, date: day },
          reward,
          day,
        ),
        day,
      );
    }
    for (const done of input.weekly) {
      if (done.completedOn !== day) continue;
      const completedBefore = weeklyDone.get(done.templateId) ?? 0;
      weeklyDone.set(done.templateId, completedBefore + 1);
      const reward = weeklyReward({
        templateId: done.templateId,
        weekStart: done.weekStart,
        value: input.valueOf('weekly', done.templateId, done.weekStart),
        completedBefore,
        alreadyPaid: false,
        today: day,
        start: input.start,
      });
      add(
        rewardEntries(
          {
            key: `weekly:${done.taskId}`,
            kind: 'weekly',
            itemId: done.templateId,
            date: done.weekStart,
          },
          reward,
          day,
        ),
        day,
      );
    }
  }
  return entries;
}
