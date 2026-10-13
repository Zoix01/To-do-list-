import { describe, expect, it } from 'vitest';
import { openBox, seededRng, type Rng } from './boxes';
import { COSMETICS } from './cosmetics';
import { addDays, isoWeekday, mondayOf } from './dates';
import {
  EXPECTED_RATE,
  GAMIFICATION_START,
  PIECE_SHARD_PRICES,
  WEEKLY_BUDGET,
  type Importance,
} from './economy';
import { currentStreak, type HabitMarks } from './habits';
import {
  levelInfo,
  snapshotValues,
  tickReward,
  weeklyReward,
  type EconomyItem,
  type Reward,
} from './rewards';
import { SEASONS } from './seasonData';
import { piecesOf, type Tier } from './seasons';
import { shopPrices } from './shop';
import type { Habit } from './types';

/*
 * Balance simulation (SPEC §13.16): prints a report and never fails on the
 * numbers. The player has a realistic mix of habits and recurring tasks,
 * completes about 75% of everything, spends half of the income on boxes,
 * opens every box, arms every freeze on the best streak and buys missing
 * pieces with shards, legendary first. Three regular 13-week seasons are
 * played in a row (shards carry over); the first has the most milestone
 * boxes, the later ones show the long run.
 */

type Rules = Pick<Habit, 'frequency' | 'weekdays' | 'target'>;
const DAILY: Rules = { frequency: 'daily', weekdays: [], target: null };
const WEEKDAYS: Rules = { frequency: 'weekdays', weekdays: [1, 2, 3, 4, 5], target: null };
const THREE_A_WEEK: Rules = { frequency: 'per_week', weekdays: [], target: 3 };
const MONTHLY: Rules = { frequency: 'per_month', weekdays: [], target: 1 };

const HABITS: { id: string; importance: Importance; rules: Rules }[] = [
  { id: 'read', importance: 2, rules: DAILY },
  { id: 'water', importance: 2, rules: DAILY },
  { id: 'exercise', importance: 3, rules: DAILY },
  { id: 'study', importance: 2, rules: WEEKDAYS },
  { id: 'run', importance: 3, rules: THREE_A_WEEK },
];
const RECURRING: { id: string; importance: Importance; monthly: boolean }[] = [
  { id: 'clean', importance: 2, monthly: false },
  { id: 'shop', importance: 1, monthly: false },
  { id: 'bills', importance: 2, monthly: true },
];
const COMPLETION = 0.75;
const SPEND_SHARE = 0.5;
const SEASON_WEEKS = 13;
const SEASON_COUNT = 3;

interface SeasonResult {
  completeWeek: number | null;
  shareAtEnd: number;
}

interface Run {
  income: number[];
  bought: number[];
  milestone: number[];
  level: number[];
  seasons: SeasonResult[];
  level10Week: number | null;
}

export function simulate(rng: Rng, boxPrice?: number): Run {
  const start = GAMIFICATION_START;
  const defaults = shopPrices({ weeklyBudget: WEEKLY_BUDGET, expectedRate: EXPECTED_RATE });
  const price = boxPrice ?? defaults.box;
  const items: EconomyItem[] = [
    ...HABITS.map((h) => ({
      type: 'habit' as const,
      id: h.id,
      importance: h.importance,
      rules: h.rules,
    })),
    ...RECURRING.map((r) => ({
      type: 'weekly' as const,
      id: r.id,
      importance: r.importance,
      rules: r.monthly ? MONTHLY : null,
    })),
  ];
  const values = snapshotValues(items, WEEKLY_BUDGET);

  const habits = HABITS.map((h) => ({
    ...h,
    checks: new Set<string>(),
    frozen: new Set<string>(),
    armed: 0,
    paid: new Map<string, number>(),
  }));
  const recurringDone = new Map<string, number>();
  const paidKeys = new Set<string>();
  const ownedCosmetics = new Set<string>();
  let xp = 0;
  let level = 1;
  let shards = 0;
  let freezes = 0;
  let charms = 0;
  let charmArmed = false;
  let spendable = 0;
  const run: Run = {
    income: [],
    bought: [],
    milestone: [],
    level: [],
    seasons: [],
    level10Week: null,
  };

  for (let s = 0; s < SEASON_COUNT; s++) {
    const pieces = piecesOf(SEASONS[(s + 1) % SEASONS.length]!);
    const owned = new Set<string>();
    const result: SeasonResult = { completeWeek: null, shareAtEnd: 0 };
    for (let w = 0; w < SEASON_WEEKS; w++) {
      const week = s * SEASON_WEEKS + w;
      let income = 0;
      let milestoneBoxes = 0;
      let levelBoxes = 0;
      const earn = (reward: Reward) => {
        income += reward.coins;
        xp += reward.xp;
        for (const milestone of reward.milestones) {
          if (paidKeys.has(milestone.key)) continue;
          paidKeys.add(milestone.key);
          milestoneBoxes += milestone.boxes;
        }
        const reached = levelInfo(xp).level;
        levelBoxes += reached - level;
        level = reached;
      };

      for (let d = 0; d < 7; d++) {
        const day = addDays(start, week * 7 + d);
        for (const habit of habits) {
          const marks: HabitMarks = { frozen: habit.frozen, vacation: new Set() };
          // A 3× a week habit is tried on Mon, Wed and Fri; a weekdays habit on its days.
          const due =
            habit.rules.frequency === 'per_week'
              ? [1, 3, 5].includes(isoWeekday(day))
              : habit.rules.frequency !== 'weekdays' || isoWeekday(day) <= 5;
          if (!due) continue;
          if (rng() < COMPLETION) {
            const period = mondayOf(day);
            const reward = tickReward({
              habitId: habit.id,
              rules: habit.rules,
              checksBefore: habit.checks,
              date: day,
              today: day,
              start,
              value: values.get(`habit:${habit.id}`)!,
              paidInPeriod: habit.paid.get(period) ?? 0,
              alreadyPaid: false,
              marks,
            });
            if (reward.coins > 0) habit.paid.set(period, (habit.paid.get(period) ?? 0) + 1);
            earn(reward);
            habit.checks.add(day);
          } else if (
            habit.rules.frequency !== 'per_week' &&
            habit.armed > 0 &&
            currentStreak(habit.rules, habit.checks, addDays(day, -1), marks) > 0
          ) {
            habit.frozen.add(day);
            habit.armed -= 1;
          }
        }
        // Recurring tasks: weekly ones on Sunday, the monthly one on the 15th.
        for (const task of RECURRING) {
          const dueToday = task.monthly ? day.endsWith('-15') : isoWeekday(day) === 7;
          if (!dueToday || rng() >= COMPLETION) continue;
          const done = recurringDone.get(task.id) ?? 0;
          recurringDone.set(task.id, done + 1);
          earn(
            weeklyReward({
              templateId: task.id,
              weekStart: mondayOf(day),
              value: values.get(`weekly:${task.id}`)!,
              completedBefore: done,
              alreadyPaid: false,
              today: day,
              start,
            }),
          );
        }
      }

      // Half of the income goes to boxes.
      spendable += income * SPEND_SHARE;
      const bought = Math.floor(spendable / price);
      spendable -= bought * price;

      for (let b = 0; b < bought + milestoneBoxes + levelBoxes; b++) {
        const box = openBox(rng, {
          pieces,
          owned,
          rewards: [],
          unownedCosmetics: COSMETICS.map((c) => c.id).filter((id) => !ownedCosmetics.has(id)),
          charm: charmArmed,
          boxPrice: price,
        });
        if (charmArmed && box.type === 'piece') charmArmed = false;
        if (box.type === 'piece') {
          if (box.duplicate) shards += box.shards;
          else owned.add(box.pieceId);
        } else if (box.type === 'freeze') freezes += 1;
        else if (box.type === 'charm') charms += 1;
        else if (box.type === 'cosmetic') ownedCosmetics.add(box.cosmeticId);
        if (!charmArmed && charms > 0 && pieces.some((p) => !owned.has(p.id))) {
          charms -= 1;
          charmArmed = true;
        }
      }

      // Arm every freeze on the daily habit with the best streak.
      const lastDay = addDays(start, week * 7 + 6);
      const streakOf = (h: (typeof habits)[number]) =>
        currentStreak(h.rules, h.checks, lastDay, { frozen: h.frozen, vacation: new Set() });
      while (freezes > 0) {
        const best = habits
          .filter((h) => h.rules.frequency === 'daily')
          .reduce((a, h) => (streakOf(h) > streakOf(a) ? h : a));
        best.armed += 1;
        freezes -= 1;
      }

      // Shards buy missing pieces, legendary first.
      for (const tier of ['legendary', 'rare', 'common'] as Tier[]) {
        for (const piece of pieces.filter((p) => p.tier === tier && !owned.has(p.id))) {
          if (shards < PIECE_SHARD_PRICES[tier]) break;
          shards -= PIECE_SHARD_PRICES[tier];
          owned.add(piece.id);
        }
      }

      run.income.push(income);
      run.bought.push(bought);
      run.milestone.push(milestoneBoxes);
      run.level.push(levelBoxes);
      if (result.completeWeek === null && owned.size === pieces.length) result.completeWeek = w + 1;
      if (run.level10Week === null && level >= 10) run.level10Week = week + 1;
    }
    result.shareAtEnd = owned.size / pieces.length;
    run.seasons.push(result);
  }
  return run;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const fmt = (n: number, digits = 1) => n.toFixed(digits);

export function report(title: string, runs: Run[]): string {
  const weekly = (key: 'income' | 'bought' | 'milestone' | 'level', from: number, to: number) =>
    mean(runs.map((run) => mean(run[key].slice(from, to))));
  const boxes = (from: number, to: number) =>
    `${fmt(weekly('bought', from, to) + weekly('milestone', from, to) + weekly('level', from, to))} = bought ${fmt(weekly('bought', from, to))} + milestones ${fmt(weekly('milestone', from, to))} + level-ups ${fmt(weekly('level', from, to))}`;
  const total = SEASON_WEEKS * SEASON_COUNT;
  const lines = [
    title,
    `  Weekly income: ${fmt(weekly('income', 0, total), 0)} coins (budget ${WEEKLY_BUDGET})`,
    `  Boxes per week, season 1: ${boxes(0, SEASON_WEEKS)}`,
    `  Boxes per week, later seasons: ${boxes(SEASON_WEEKS, total)}`,
  ];
  for (let s = 0; s < SEASON_COUNT; s++) {
    const weeks = runs.map((run) => run.seasons[s]!.completeWeek);
    lines.push(
      `  Season ${s + 1} complete in week: ${weeks.map((w) => w ?? '—').join(', ')}; owned at its end: ${fmt(mean(runs.map((run) => run.seasons[s]!.shareAtEnd)) * 100, 0)}%`,
    );
  }
  const level10 = runs.map((run) => run.level10Week);
  lines.push(`  Level 10 reached in week: ${level10.map((w) => w ?? '—').join(', ')}`);
  return lines.join('\n');
}

describe('balance simulation (13.16)', () => {
  it('prints a report', { timeout: 120_000 }, () => {
    const runs = [1, 2, 3].map((seed) => simulate(seededRng(seed)));
    const box = shopPrices({ weeklyBudget: WEEKLY_BUDGET, expectedRate: EXPECTED_RATE }).box;
    console.log(
      `\n${report(`Balance simulation: ${COMPLETION * 100}% completion, ${SPEND_SHARE * 100}% of income on boxes at ${box} coins (3 seeded runs)`, runs)}\n` +
        'Target: the collection can be finished within each 13-week season.\n',
    );
    expect(runs).toHaveLength(3);
  });
});
