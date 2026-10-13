import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { COIN_ROUNDING, WEEKLY_BUDGET, type Importance } from './economy';
import {
  catchUpEntries,
  completionsPerWeek,
  levelEntries,
  levelInfo,
  rewardEntries,
  snapshotItems,
  snapshotValues,
  streakMultiplier,
  templateRules,
  tickPay,
  tickReward,
  weeklyReward,
  xpToNextLevel,
  type CatchUpInput,
  type EconomyItem,
  type LedgerEntry,
} from './rewards';
import type { Habit, Weekday } from './types';

type Rules = Pick<Habit, 'frequency' | 'weekdays' | 'target'>;
const daily: Rules = { frequency: 'daily', weekdays: [], target: null };
const weekdays = (...days: Weekday[]): Rules => ({
  frequency: 'weekdays',
  weekdays: days,
  target: null,
});
const perWeek = (target: number): Rules => ({ frequency: 'per_week', weekdays: [], target });
const perMonth = (target: number): Rules => ({ frequency: 'per_month', weekdays: [], target });

const START = '2026-10-19'; // Monday
/** `n` consecutive days ending on `last`. */
const daysBack = (last: string, n: number) =>
  Array.from({ length: n }, (_, i) => addDays(last, -(n - 1 - i)));

describe('normalization (13.3)', () => {
  const RULES: (Rules | null)[] = [daily, weekdays(1, 3, 5), perWeek(3), perMonth(4), null];

  function perfectWeek(items: EconomyItem[]): number {
    const values = snapshotValues(items, WEEKLY_BUDGET);
    return items.reduce(
      (sum, item) => sum + values.get(`${item.type}:${item.id}`)! * completionsPerWeek(item.rules),
      0,
    );
  }
  const items = (n: number): EconomyItem[] =>
    Array.from({ length: n }, (_, i) => {
      const rules = RULES[i % RULES.length]!;
      return {
        type: rules ? 'habit' : 'weekly',
        id: String(i),
        importance: ((i % 4) + 1) as Importance,
        rules,
      };
    });

  it.each([1, 4, 40])('a perfect week with %i items earns the budget (± rounding)', (n) => {
    const list = items(n);
    const tolerance = list.reduce(
      (sum, item) => sum + (COIN_ROUNDING / 2) * completionsPerWeek(item.rules),
      0,
    );
    expect(Math.abs(perfectWeek(list) - WEEKLY_BUDGET)).toBeLessThanOrEqual(tolerance);
  });

  it('splits by importance and frequency (completions per week ^ 0.75)', () => {
    const values = snapshotValues(
      [
        { type: 'habit', id: 'a', importance: 2, rules: daily },
        { type: 'weekly', id: 'b', importance: 2, rules: null },
      ],
      WEEKLY_BUDGET,
    );
    // Weights 2 × 7^0.75 ≈ 8.61 and 2 × 1 = 2: shares ≈ 8,115 and 1,885.
    expect(values.get('habit:a')).toBe(1160); // 8,115 / 7
    expect(values.get('weekly:b')).toBe(1890);
  });

  it('daily earns most per month in total, monthly most per completion', () => {
    const monthly = perMonth(1);
    const values = snapshotValues(
      [
        { type: 'habit', id: 'd', importance: 2, rules: daily },
        { type: 'weekly', id: 'w', importance: 2, rules: null },
        { type: 'weekly', id: 'm', importance: 2, rules: monthly },
      ],
      WEEKLY_BUDGET,
    );
    const d = values.get('habit:d')!;
    const w = values.get('weekly:w')!;
    const m = values.get('weekly:m')!;
    // Per completion: monthly > weekly > daily, but only "a bit more".
    expect(m).toBeGreaterThan(w);
    expect(w).toBeGreaterThan(d);
    expect(w / d).toBeLessThan(2);
    expect(m / d).toBeLessThan(3);
    // Over a 28-day month: 28 daily ticks > 4 weekly tasks > 1 monthly task.
    expect(28 * d).toBeGreaterThan(4 * w);
    expect(4 * w).toBeGreaterThan(m);
  });

  it('a higher importance takes a bigger share', () => {
    const values = snapshotValues(
      [
        { type: 'habit', id: 'light', importance: 1, rules: daily },
        { type: 'habit', id: 'essential', importance: 4, rules: daily },
      ],
      WEEKLY_BUDGET,
    );
    // 8,000 / 7 and 2,000 / 7, each rounded to 10 coins.
    expect(values.get('habit:essential')).toBe(1140);
    expect(values.get('habit:light')).toBe(290);
  });

  it('per_month: target × 12 / 52 completions a week', () => {
    expect(completionsPerWeek(perMonth(4))).toBeCloseTo(48 / 52);
    const values = snapshotValues(
      [{ type: 'habit', id: 'm', importance: 2, rules: perMonth(4) }],
      10000,
    );
    expect(values.get('habit:m')).toBe(10830);
  });

  it('only items created before the Monday are in its snapshot', () => {
    const habit = { id: 'h', importance: 2 as const, archived: false, rules: daily };
    const template = { id: 't', importance: 2 as const, active: true, rules: null };
    const week = '2026-10-26';
    const ids = (list: EconomyItem[]) => list.map((item) => item.id);
    expect(
      ids(
        snapshotItems(
          [{ ...habit, createdOn: '2026-10-21' }],
          [{ ...template, createdOn: '2026-10-25' }],
          week,
        ),
      ),
    ).toEqual(['h', 't']);
    // Created on the Monday itself (mid-week from the snapshot's view): waits a week.
    expect(ids(snapshotItems([{ ...habit, createdOn: week }], [], week))).toEqual([]);
    expect(
      ids(
        snapshotItems(
          [{ ...habit, archived: true, createdOn: '2026-10-01' }],
          [{ ...template, active: false, createdOn: '2026-10-01' }],
          week,
        ),
      ),
    ).toEqual([]);
  });
});

describe('monthly templates (§6.1)', () => {
  it('count like a per_month habit with N completions', () => {
    const rules = templateRules({
      period: 'month',
      mode: 'flexible',
      weekday: null,
      monthDays: [],
      timesPerMonth: 2,
    });
    expect(rules).toEqual({ frequency: 'per_month', weekdays: [], target: 2 });
    expect(completionsPerWeek(rules)).toBeCloseTo(24 / 52);
    expect(
      templateRules({
        period: 'week',
        mode: 'fixed',
        weekday: 2,
        monthDays: [],
        timesPerMonth: null,
      }),
    ).toBeNull();
  });
});

describe('streak multiplier (13.4)', () => {
  it('adds 10% per full period, capped at 50%', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(3)).toBe(1.3);
    expect(streakMultiplier(5)).toBe(1.5);
    expect(streakMultiplier(12)).toBe(1.5);
  });

  const pay = (rules: Rules, checks: string[], date: string, extra: object = {}) =>
    tickPay({
      rules,
      checks: new Set([...checks, date]),
      date,
      today: date,
      start: START,
      value: 100,
      paidInPeriod: 0,
      ...extra,
    });

  it('daily: full weeks of streak before the tick', () => {
    const today = '2026-11-20';
    expect(pay(daily, daysBack(addDays(today, -1), 6), today)?.multiplier).toBe(1);
    expect(pay(daily, daysBack(addDays(today, -1), 7), today)?.multiplier).toBe(1.1);
    expect(pay(daily, daysBack(addDays(today, -1), 20), today)).toEqual({
      coins: 120,
      multiplier: 1.2,
    });
  });

  it('weekdays: full weeks of scheduled days', () => {
    // Mon/Wed/Fri; the last 6 scheduled days before Fri 2026-11-20 are ticked.
    const checks = [
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
      '2026-11-16',
      '2026-11-18',
    ];
    expect(pay(weekdays(1, 3, 5), checks, '2026-11-20')?.multiplier).toBe(1.2);
  });

  it('per_week: full weeks in the streak, the running week not counted', () => {
    // Three earlier weeks met (target 1); the tick is in the 4th week.
    const checks = ['2026-10-27', '2026-11-03', '2026-11-10'];
    expect(pay(perWeek(1), checks, '2026-11-18')?.multiplier).toBe(1.3);
  });

  it('per_month: full months in the streak', () => {
    const checks = ['2026-10-20', '2026-11-05'];
    expect(pay(perMonth(1), checks, '2026-12-03')?.multiplier).toBe(1.2);
  });
});

describe('tick pay (13.4)', () => {
  const base = {
    rules: daily,
    today: '2026-11-04',
    start: START,
    value: 330,
    paidInPeriod: 0,
  };
  const pay = (date: string, extra: object = {}) =>
    tickPay({ ...base, checks: new Set([date]), date, ...extra });

  it('pays today and yesterday, not two days back', () => {
    expect(pay('2026-11-04')?.coins).toBe(330);
    expect(pay('2026-11-03')?.coins).toBe(330);
    expect(pay('2026-11-02')).toBeNull();
  });
  it('the catch-up ignores the back-fill limit', () => {
    expect(pay('2026-10-20', { catchUp: true })?.coins).toBe(330);
  });
  it('nothing before the start, and nothing outside the snapshot', () => {
    expect(pay('2026-10-18', { today: '2026-10-18' })).toBeNull();
    expect(pay('2026-11-04', { value: null })).toBeNull();
  });
  it('over target earns nothing', () => {
    expect(pay('2026-11-04', { rules: perWeek(2), paidInPeriod: 1 })?.coins).toBe(330);
    expect(pay('2026-11-04', { rules: perWeek(2), paidInPeriod: 2 })).toBeNull();
  });
  it('a weekdays habit’s day off earns nothing', () => {
    expect(pay('2026-11-04', { rules: weekdays(1, 5) })).toBeNull(); // a Wednesday
  });
});

describe('tick reward and milestones (13.4, 13.5)', () => {
  const reward = (checks: string[], date: string, extra: object = {}) =>
    tickReward({
      habitId: 'h',
      rules: daily,
      checksBefore: new Set(checks),
      date,
      today: date,
      start: START,
      value: 100,
      paidInPeriod: 0,
      alreadyPaid: false,
      ...extra,
    });
  const keys = (r: ReturnType<typeof reward>) => r.milestones.map((m) => m.key);

  it('untick + re-tick pays once', () => {
    expect(reward([], '2026-11-04', { alreadyPaid: true }).coins).toBe(0);
    expect(reward(['2026-11-04'], '2026-11-04').coins).toBe(0);
  });

  it('the 7th day of a run crosses the 7-day milestone, once', () => {
    const six = daysBack('2026-11-09', 6);
    expect(keys(reward(six, '2026-11-10'))).toEqual(['streak:h:2026-11-04:7']);
    expect(keys(reward([...six, '2026-11-10'], '2026-11-11'))).toEqual([]);
  });

  it('a rebuilt streak earns it again (new run start)', () => {
    const six = daysBack('2026-11-19', 6);
    expect(keys(reward(six, '2026-11-20'))).toEqual(['streak:h:2026-11-14:7']);
  });

  it('streaks crossed before the start don’t pay', () => {
    const forty = daysBack('2026-10-19', 40);
    expect(reward(forty, '2026-10-20').milestones).toEqual([]);
  });

  it('nothing at all before the start', () => {
    expect(reward(daysBack('2026-10-16', 6), '2026-10-17')).toMatchObject({
      coins: 0,
      milestones: [],
    });
  });

  it('back-filling a gap doesn’t re-earn what the later run already had', () => {
    // Run A: Nov 1–3, gap Nov 4, run B: Nov 5–14 (10 days, already past 7).
    const checks = [...daysBack('2026-11-03', 3), ...daysBack('2026-11-14', 10)];
    const r = reward(checks, '2026-11-04', { today: '2026-11-14' });
    expect(keys(r).filter((key) => key.startsWith('streak'))).toEqual([]);
  });

  it('back-filling can cross a new threshold for the joined run', () => {
    // 15 + gap + 14 → 30 after the back-fill.
    const checks = [...daysBack('2026-11-15', 15), ...daysBack('2026-11-30', 14)];
    const r = reward(checks, '2026-11-16', { today: '2026-11-30' });
    expect(keys(r)).toContain('streak:h:2026-11-01:30');
    expect(r.coins).toBe(0); // too old to pay coins
  });

  it('per_week: the tick that meets the week extends the run', () => {
    const checks = ['2026-10-20', '2026-10-27', '2026-11-03'];
    const r = reward(checks, '2026-11-10', { rules: perWeek(1) });
    expect(keys(r)).toEqual(['streak:h:2026-10-19:4']);
    // A tick that doesn't meet the target yet crosses nothing.
    expect(reward(checks, '2026-11-10', { rules: perWeek(2) }).milestones).toEqual([]);
  });

  it('count milestones: crossed once, back-filled ticks count', () => {
    const nine = ['2026-09-01', ...daysBack('2026-11-01', 8)];
    const r = reward(nine, '2026-11-02');
    expect(r.milestones.filter((m) => m.kind === 'count')).toEqual([
      { key: 'count:h:10', kind: 'count', itemId: 'h', threshold: 10, boxes: 1 },
    ]);
  });
});

describe('weekly task reward (13.4)', () => {
  const base = {
    templateId: 't',
    weekStart: '2026-10-26',
    value: 500,
    completedBefore: 0,
    alreadyPaid: false,
    today: '2026-11-05',
    start: START,
  };
  it('pays its week’s value, even late', () => {
    expect(weeklyReward(base)).toMatchObject({ coins: 500, xp: 50 });
  });
  it('pays once', () => {
    expect(weeklyReward({ ...base, alreadyPaid: true }).coins).toBe(0);
  });
  it('weeks before the start pay nothing', () => {
    expect(weeklyReward({ ...base, weekStart: '2026-10-12' }).coins).toBe(0);
  });
  it('the 10th completion crosses a count milestone', () => {
    expect(weeklyReward({ ...base, completedBefore: 9 }).milestones).toHaveLength(1);
  });
});

describe('levels (13.5)', () => {
  it('follows 600 + 100 × (L − 1)', () => {
    expect(xpToNextLevel(1)).toBe(600);
    expect(xpToNextLevel(9)).toBe(1400);
    expect(levelInfo(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: 600 });
    expect(levelInfo(650)).toEqual({ level: 2, xpIntoLevel: 50, xpForNext: 700 });
    expect(levelInfo(8999).level).toBe(9);
    expect(levelInfo(9000).level).toBe(10);
  });
  it('one box per level reached', () => {
    expect(levelEntries(599, '2026-11-01')).toEqual([]);
    expect(levelEntries(1300, '2026-11-01').map((e) => [e.key, e.boxes])).toEqual([
      ['level:2', 1],
      ['level:3', 1],
    ]);
  });
});

describe('catch-up (13.2)', () => {
  const habits: CatchUpInput['habits'] = [
    // History before the start counts for the streak.
    { id: 'a', rules: daily, checks: [...daysBack('2026-10-25', 12), '2026-10-27'] },
    {
      id: 'b',
      rules: perWeek(2),
      checks: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-28'],
    },
  ];
  const weekly: CatchUpInput['weekly'] = [
    { taskId: 'x1', templateId: 't', weekStart: '2026-10-12', completedOn: '2026-10-15' },
    { taskId: 'x2', templateId: 't', weekStart: '2026-10-19', completedOn: '2026-10-27' },
  ];
  const input: CatchUpInput = {
    habits,
    weekly,
    valueOf: (type) => (type === 'habit' ? 300 : 800),
    start: START,
    today: '2026-10-28',
  };

  /** What live operation pays: each event on its own day, into a ledger that ignores repeated keys. */
  function live(): LedgerEntry[] {
    const ledger = new Map<string, LedgerEntry>();
    const insert = (entries: LedgerEntry[]) => {
      for (const entry of entries) if (!ledger.has(entry.key)) ledger.set(entry.key, entry);
    };
    const xp = () => [...ledger.values()].reduce((sum, e) => sum + e.xp, 0);
    for (let day = START; day <= input.today; day = addDays(day, 1)) {
      for (const habit of habits) {
        if (!habit.checks.includes(day)) continue;
        const paid = [...ledger.values()].filter(
          (e) =>
            e.kind === 'tick' &&
            e.itemId === habit.id &&
            e.date >= '2026-10-26' === day >= '2026-10-26',
        ).length;
        const reward = tickReward({
          habitId: habit.id,
          rules: habit.rules,
          checksBefore: new Set(habit.checks.filter((d) => d < day)),
          date: day,
          today: day,
          start: START,
          value: 300,
          paidInPeriod: paid,
          alreadyPaid: ledger.has(`tick:${habit.id}:${day}`),
        });
        insert(
          rewardEntries(
            { key: `tick:${habit.id}:${day}`, kind: 'tick', itemId: habit.id, date: day },
            reward,
            day,
          ),
        );
        insert(levelEntries(xp(), day));
      }
      for (const [i, done] of weekly.entries()) {
        if (done.completedOn !== day) continue;
        const reward = weeklyReward({
          templateId: 't',
          weekStart: done.weekStart,
          value: done.weekStart >= START ? 800 : null,
          completedBefore: i,
          alreadyPaid: false,
          today: day,
          start: START,
        });
        insert(
          rewardEntries(
            { key: `weekly:${done.taskId}`, kind: 'weekly', itemId: 't', date: done.weekStart },
            reward,
            day,
          ),
        );
        insert(levelEntries(xp(), day));
      }
    }
    return [...ledger.values()];
  }

  const byKey = (entries: LedgerEntry[]) =>
    Object.fromEntries(entries.map((e) => [e.key, [e.coins, e.boxes]]));

  it('pays exactly what live operation would have', () => {
    expect(byKey(catchUpEntries(input))).toEqual(byKey(live()));
  });

  it('pays the right things', () => {
    const entries = byKey(catchUpEntries(input));
    // Habit a: ticked Oct 14–25 and 27. On Oct 19 the streak before is 5 days (×1.0);
    // from Oct 21 it's a full week (×1.1). The 7-day run is reached on Oct 20, after the start.
    expect(entries['tick:a:2026-10-19']).toEqual([300, 0]);
    expect(entries['tick:a:2026-10-21']).toEqual([330, 0]);
    expect(entries['streak:a:2026-10-14:7']).toEqual([0, 1]);
    expect(entries['count:a:10']).toEqual([0, 1]); // 10th tick on Oct 23
    // Habit b (2× a week): the third tick in a week is over target; next week ×1.1.
    expect(entries['tick:b:2026-10-21']).toBeUndefined();
    expect(entries['tick:b:2026-10-28']).toEqual([330, 0]);
    // The weekly task from before the start pays nothing; the next one pays its value.
    expect(entries['weekly:x1']).toBeUndefined();
    expect(entries['weekly:x2']).toEqual([800, 0]);
  });

  it('every key appears once, so running it twice pays nothing extra', () => {
    const keys = catchUpEntries(input).map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
