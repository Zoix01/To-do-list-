import { describe, expect, it } from 'vitest';
import { openBox, seededRng, type Rng } from './boxes';
import { COSMETICS } from './cosmetics';
import { addDays } from './dates';
import { GAMIFICATION_START, PIECE_SHARD_PRICES, WEEKLY_BUDGET } from './economy';
import { currentStreak } from './habits';
import { levelInfo, snapshotValues, tickReward, weeklyReward, type EconomyItem } from './rewards';
import { SEASONS } from './seasonData';
import { piecesOf, type Tier } from './seasons';
import { shopPrices } from './shop';
import { EXPECTED_RATE } from './economy';

/*
 * Balance simulation (SPEC §13.16): prints a report and never fails on the
 * numbers. The player has 4 daily habits (weights 3–6) and 2 weekly tasks
 * (weights 7, 8), completes 70% of items at random, arms every freeze on the
 * best streak, spends about 35% of income on boxes, opens every box and buys
 * missing pieces with shards, legendary first. A regular 13-week season is
 * simulated (it keeps going after week 13 to see when it would complete). A
 * second scenario tries a higher box price, as a proposal to compare against.
 */

const DAILY = { frequency: 'daily' as const, weekdays: [], target: null };
const HABIT_WEIGHTS = [3, 4, 5, 6];
const WEEKLY_WEIGHTS = [7, 8];
const COMPLETION = 0.7;
const SPEND_SHARE = 0.35;
const WEEKS = 26;
const SEASON_WEEKS = 13;

interface Run {
  income: number[];
  bought: number[];
  milestone: number[];
  level: number[];
  seasonCompleteWeek: number | null;
  shareAtWeek13: number;
  level10Week: number | null;
}

function simulate(rng: Rng, boxPrice?: number): Run {
  const start = GAMIFICATION_START;
  const defaults = shopPrices({ weeklyBudget: WEEKLY_BUDGET, expectedRate: EXPECTED_RATE });
  const prices = { ...defaults, box: boxPrice ?? defaults.box };
  const items: EconomyItem[] = [
    ...HABIT_WEIGHTS.map((weight, i) => ({
      type: 'habit' as const,
      id: `h${i}`,
      weight,
      rules: DAILY,
    })),
    ...WEEKLY_WEIGHTS.map((weight, i) => ({
      type: 'weekly' as const,
      id: `w${i}`,
      weight,
      rules: null,
    })),
  ];
  const values = snapshotValues(items, WEEKLY_BUDGET);
  const pieces = piecesOf(SEASONS[1] ?? SEASONS[0]!);

  const habits = HABIT_WEIGHTS.map((_, i) => ({
    id: `h${i}`,
    checks: new Set<string>(),
    frozen: new Set<string>(),
    armed: 0,
  }));
  const weeklyDone = WEEKLY_WEIGHTS.map(() => 0);
  const paidKeys = new Set<string>();
  const owned = new Set<string>();
  const ownedCosmetics = new Set<string>();
  let coins = 0;
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
    seasonCompleteWeek: null,
    shareAtWeek13: 0,
    level10Week: null,
  };

  for (let week = 0; week < WEEKS; week++) {
    let income = 0;
    let milestoneBoxes = 0;
    let levelBoxes = 0;
    const earn = (reward: {
      coins: number;
      xp: number;
      milestones: { key: string; boxes: number }[];
    }) => {
      coins += reward.coins;
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
        const marks = { frozen: habit.frozen, vacation: new Set<string>() };
        if (rng() < COMPLETION) {
          earn(
            tickReward({
              habitId: habit.id,
              rules: DAILY,
              checksBefore: habit.checks,
              date: day,
              today: day,
              start,
              value: values.get(`habit:${habit.id}`)!,
              paidInPeriod: 0,
              alreadyPaid: false,
              marks,
            }),
          );
          habit.checks.add(day);
        } else if (
          habit.armed > 0 &&
          currentStreak(DAILY, habit.checks, addDays(day, -1), marks) > 0
        ) {
          // An armed freeze covers the missed day once it's over.
          habit.frozen.add(day);
          habit.armed -= 1;
        }
      }
    }
    for (const [i] of WEEKLY_WEIGHTS.entries()) {
      if (rng() >= COMPLETION) continue;
      earn(
        weeklyReward({
          templateId: `w${i}`,
          weekStart: addDays(start, week * 7),
          value: values.get(`weekly:w${i}`)!,
          completedBefore: weeklyDone[i]!,
          alreadyPaid: false,
          today: addDays(start, week * 7 + 6),
          start,
        }),
      );
      weeklyDone[i]! += 1;
    }

    // About 35% of the week's income goes to boxes.
    spendable += income * SPEND_SHARE;
    const bought = Math.floor(spendable / prices.box);
    spendable -= bought * prices.box;
    coins -= bought * prices.box;

    // Open every box.
    for (let b = 0; b < bought + milestoneBoxes + levelBoxes; b++) {
      const result = openBox(rng, {
        pieces,
        owned,
        rewards: [],
        unownedCosmetics: COSMETICS.map((c) => c.id).filter((id) => !ownedCosmetics.has(id)),
        charm: charmArmed,
        boxPrice: prices.box,
      });
      if (charmArmed && result.type === 'piece') charmArmed = false;
      if (result.type === 'piece') {
        if (result.duplicate) shards += result.shards;
        else owned.add(result.pieceId);
      } else if (result.type === 'pouch') coins += result.coins;
      else if (result.type === 'freeze') freezes += 1;
      else if (result.type === 'charm') charms += 1;
      else if (result.type === 'cosmetic') ownedCosmetics.add(result.cosmeticId);
      if (!charmArmed && charms > 0 && pieces.some((p) => !owned.has(p.id))) {
        charms -= 1;
        charmArmed = true;
      }
    }

    // Arm every freeze on the habit with the best streak.
    while (freezes > 0) {
      const lastDay = addDays(start, week * 7 + 6);
      const best = habits.reduce((a, h) =>
        currentStreak(DAILY, h.checks, lastDay, { frozen: h.frozen, vacation: new Set() }) >
        currentStreak(DAILY, a.checks, lastDay, { frozen: a.frozen, vacation: new Set() })
          ? h
          : a,
      );
      best.armed += 1;
      freezes -= 1;
    }

    // Shards buy missing pieces, legendary first.
    const order: Tier[] = ['legendary', 'rare', 'common'];
    for (const tier of order) {
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
    if (run.seasonCompleteWeek === null && owned.size === pieces.length)
      run.seasonCompleteWeek = week + 1;
    if (week + 1 === SEASON_WEEKS) run.shareAtWeek13 = owned.size / pieces.length;
    if (run.level10Week === null && level >= 10) run.level10Week = week + 1;
  }
  return run;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const fmt = (n: number, digits = 1) => n.toFixed(digits);

function report(title: string, runs: Run[]): string {
  const firstSeason = (key: 'income' | 'bought' | 'milestone' | 'level') =>
    mean(runs.map((run) => mean(run[key].slice(0, SEASON_WEEKS))));
  const completeWeeks = runs.map((run) => run.seasonCompleteWeek);
  const level10 = runs.map((run) => run.level10Week);
  const never = `>${WEEKS}`;
  return [
    title,
    `  Typical weekly income: ${fmt(firstSeason('income'), 0)} coins`,
    `  Boxes per week: ${fmt(firstSeason('bought') + firstSeason('milestone') + firstSeason('level'))} = bought ${fmt(firstSeason('bought'))} + milestones ${fmt(firstSeason('milestone'))} + level-ups ${fmt(firstSeason('level'))} (first 13 weeks)`,
    `  Season complete in week: ${completeWeeks.map((w) => w ?? never).join(', ')} (avg ${fmt(mean(completeWeeks.map((w) => w ?? WEEKS + 1)))})`,
    `  Share of the season owned after 13 weeks: ${fmt(mean(runs.map((r) => r.shareAtWeek13)) * 100, 0)}%`,
    `  Level 10 reached in week: ${level10.map((w) => w ?? never).join(', ')} (avg ${fmt(mean(level10.map((w) => w ?? WEEKS + 1)))})`,
  ].join('\n');
}

describe('balance simulation (13.16)', () => {
  it('prints a report', { timeout: 60_000 }, () => {
    const seeds = [1, 2, 3, 4];
    const current = seeds.map((seed) => simulate(seededRng(seed)));
    const higherBoxPrice = seeds.map((seed) => simulate(seededRng(seed), 1000));
    console.log(
      [
        '',
        report(
          `Balance simulation, current config (${seeds.length} seeded runs, ${WEEKS} weeks)`,
          current,
        ),
        report('Proposal to compare: box price 1,000 (BOXES_PER_TYPICAL_WEEK 2.5)', higherBoxPrice),
        'Targets: about 4 boxes per typical week, level 10 in 8–13 weeks, most of a season within its 13 weeks.',
        '',
      ].join('\n\n'),
    );
    expect(current).toHaveLength(seeds.length);
  });
});
