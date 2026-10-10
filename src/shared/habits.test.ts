import { describe, expect, it } from 'vitest';
import {
  bestStreak,
  completionRate,
  currentStreak,
  formatStreak,
  habitProgress,
  isDueToday,
  showOnToday,
} from './habits';
import type { Habit, Weekday } from './types';

const daily = { frequency: 'daily', weekdays: [], target: null } as const;
const weekdays = (...days: Weekday[]) =>
  ({ frequency: 'weekdays', weekdays: days, target: null }) satisfies Partial<Habit>;
const perWeek = (target: number) =>
  ({ frequency: 'per_week', weekdays: [], target }) satisfies Partial<Habit>;
const perMonth = (target: number) =>
  ({ frequency: 'per_month', weekdays: [], target }) satisfies Partial<Habit>;
const checks = (...dates: string[]) => new Set(dates);

// 2026-10-14 is a Wednesday.
const WED = '2026-10-14';

describe('isDueToday / showOnToday', () => {
  it('daily: always due', () => {
    expect(isDueToday(daily, checks(), WED)).toBe(true);
  });
  it('weekdays: due only on its weekdays', () => {
    expect(isDueToday(weekdays(1, 3, 5), checks(), WED)).toBe(true);
    expect(isDueToday(weekdays(2, 4), checks(), WED)).toBe(false);
  });
  it('per_week: due while this week’s count is below the target', () => {
    expect(isDueToday(perWeek(2), checks('2026-10-12'), WED)).toBe(true);
    expect(isDueToday(perWeek(2), checks('2026-10-12', '2026-10-13'), WED)).toBe(false);
    // A check from last week doesn't count.
    expect(isDueToday(perWeek(1), checks('2026-10-11'), WED)).toBe(true);
  });
  it('per_month: due while this month’s count is below the target', () => {
    expect(isDueToday(perMonth(3), checks('2026-10-01', '2026-10-02'), WED)).toBe(true);
    expect(isDueToday(perMonth(2), checks('2026-10-01', '2026-10-02'), WED)).toBe(false);
    expect(isDueToday(perMonth(1), checks('2026-09-30'), WED)).toBe(true);
  });
  it('shows a habit ticked today even when it is no longer due', () => {
    expect(showOnToday(perWeek(1), checks(WED), WED)).toBe(true);
    expect(showOnToday(weekdays(2), checks(WED), WED)).toBe(true);
    expect(showOnToday(weekdays(2), checks(), WED)).toBe(false);
  });
});

describe('streaks: daily', () => {
  it('counts consecutive ticked days back from today', () => {
    expect(currentStreak(daily, checks('2026-10-12', '2026-10-13', WED), WED)).toBe(3);
  });
  it('today not yet ticked does not break the streak', () => {
    expect(currentStreak(daily, checks('2026-10-12', '2026-10-13'), WED)).toBe(2);
  });
  it('a missed past day breaks it', () => {
    expect(currentStreak(daily, checks('2026-10-11', '2026-10-13'), WED)).toBe(1);
    expect(currentStreak(daily, checks('2026-10-11', '2026-10-12'), WED)).toBe(0);
  });
  it('crosses month boundaries', () => {
    expect(currentStreak(daily, checks('2026-09-30', '2026-10-01'), '2026-10-01')).toBe(2);
  });
  it('no checks → 0', () => {
    expect(currentStreak(daily, checks(), WED)).toBe(0);
  });
});

describe('streaks: weekdays', () => {
  const mwf = weekdays(1, 3, 5);
  it('counts only scheduled days', () => {
    // Fri 9, Mon 12, Wed 14 — the unscheduled days in between don't matter.
    expect(currentStreak(mwf, checks('2026-10-09', '2026-10-12', WED), WED)).toBe(3);
  });
  it('today (scheduled) not yet ticked does not break it', () => {
    expect(currentStreak(mwf, checks('2026-10-09', '2026-10-12'), WED)).toBe(2);
  });
  it('when today is not scheduled, the last scheduled day decides', () => {
    expect(currentStreak(mwf, checks('2026-10-12', WED), '2026-10-15')).toBe(2);
    expect(currentStreak(mwf, checks('2026-10-12'), '2026-10-15')).toBe(0);
  });
  it('ticks on unscheduled days are ignored', () => {
    expect(currentStreak(mwf, checks('2026-10-13', WED), WED)).toBe(1);
  });
  it('no weekdays selected → 0', () => {
    expect(currentStreak(weekdays(), checks(WED), WED)).toBe(0);
  });
});

describe('streaks: per_week', () => {
  it('counts consecutive weeks meeting the target', () => {
    const c = checks('2026-09-29', '2026-10-01', '2026-10-06', '2026-10-08', '2026-10-12', WED);
    expect(currentStreak(perWeek(2), c, WED)).toBe(3);
  });
  it('an unfinished current week does not break it', () => {
    const c = checks('2026-09-29', '2026-10-01', '2026-10-06', '2026-10-08', '2026-10-12');
    expect(currentStreak(perWeek(2), c, WED)).toBe(2);
  });
  it('a past week below target breaks it', () => {
    const c = checks('2026-09-29', '2026-10-01', '2026-10-06', '2026-10-12', WED);
    expect(currentStreak(perWeek(2), c, WED)).toBe(1);
  });
  it('weeks crossing months are one week', () => {
    // Week of Mon 28 Sep – Sun 4 Oct: one check in September, one in October.
    expect(currentStreak(perWeek(2), checks('2026-09-30', '2026-10-02'), '2026-10-04')).toBe(1);
  });
});

describe('streaks: per_month', () => {
  it('counts consecutive months meeting the target', () => {
    const c = checks('2026-08-03', '2026-08-20', '2026-09-01', '2026-09-30', '2026-10-02', WED);
    expect(currentStreak(perMonth(2), c, WED)).toBe(3);
  });
  it('an unfinished current month does not break it', () => {
    const c = checks('2026-08-03', '2026-08-20', '2026-09-01', '2026-09-30');
    expect(currentStreak(perMonth(2), c, WED)).toBe(2);
  });
  it('month boundaries: last day of a month and first day of the next', () => {
    expect(currentStreak(perMonth(1), checks('2026-09-30', '2026-10-01'), '2026-10-01')).toBe(2);
  });
  it('a missed month breaks it (year boundary)', () => {
    expect(currentStreak(perMonth(1), checks('2026-11-10', '2027-01-05'), '2027-01-06')).toBe(1);
  });
});

describe('bestStreak', () => {
  it('finds the longest run, not only the current one', () => {
    const c = checks('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-10', WED);
    expect(bestStreak(daily, c, WED)).toBe(4);
    expect(currentStreak(daily, c, WED)).toBe(1);
  });
});

describe('habitProgress', () => {
  it('reports "2/4 this week" and "1/3 this month"', () => {
    expect(habitProgress(perWeek(4), checks('2026-10-12', WED, '2026-10-05'), WED)).toEqual({
      done: 2,
      target: 4,
      label: 'this week',
    });
    expect(habitProgress(perMonth(3), checks('2026-10-01'), WED)).toEqual({
      done: 1,
      target: 3,
      label: 'this month',
    });
    expect(habitProgress(daily, checks(), WED)).toBeNull();
  });
});

describe('completionRate', () => {
  it('daily: last 30 days, only since the habit started, today excluded until ticked', () => {
    // Started Mon 5 Oct; 9 days 5–13 Oct, 6 of them ticked; today (14th) not ticked.
    const c = checks(
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-09',
      '2026-10-11',
      '2026-10-13',
    );
    expect(completionRate(daily, c, WED, '2026-10-05')).toMatchObject({ met: 6, total: 9 });
    expect(completionRate(daily, new Set([...c, WED]), WED, '2026-10-05')).toMatchObject({
      met: 7,
      total: 10,
    });
  });
  it('daily: caps at the last 30 days', () => {
    const rate = completionRate(daily, checks(), WED, '2026-01-01');
    expect(rate.total).toBe(29); // 30 days minus unticked today
    expect(rate.window).toBe('last 30 days');
  });
  it('per_week: last 12 weeks', () => {
    const rate = completionRate(perWeek(1), checks('2026-10-06'), WED, '2025-01-01');
    expect(rate).toMatchObject({ met: 1, total: 11, window: 'last 12 weeks' });
  });
  it('nothing to measure yet → rate null', () => {
    expect(completionRate(daily, checks(), WED, WED).rate).toBeNull();
  });
});

describe('formatStreak', () => {
  it('uses the right unit', () => {
    expect(formatStreak(12, 'daily')).toBe('12 days');
    expect(formatStreak(1, 'weekdays')).toBe('1 day');
    expect(formatStreak(5, 'per_week')).toBe('5 weeks');
    expect(formatStreak(1, 'per_month')).toBe('1 month');
  });
});
