import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateInZone,
  daysBetween,
  formatShortDate,
  isISODate,
  isValidTimeZone,
  maxDate,
} from './dates';

const PRAGUE = 'Europe/Prague';

describe('dateInZone (Europe/Prague "today")', () => {
  it('uses the Prague date, not the UTC date, just after Prague midnight in winter', () => {
    // 23:30 UTC = 00:30 CET next day
    expect(dateInZone(new Date('2026-01-14T23:30:00Z'), PRAGUE)).toBe('2026-01-15');
    expect(dateInZone(new Date('2026-01-14T22:59:59Z'), PRAGUE)).toBe('2026-01-14');
    expect(dateInZone(new Date('2026-01-14T23:00:00Z'), PRAGUE)).toBe('2026-01-15');
  });

  it('uses UTC+2 in summer', () => {
    expect(dateInZone(new Date('2026-07-01T21:59:59Z'), PRAGUE)).toBe('2026-07-01');
    expect(dateInZone(new Date('2026-07-01T22:00:00Z'), PRAGUE)).toBe('2026-07-02');
  });

  it('handles the spring DST change day (29 Mar 2026, 02:00 → 03:00)', () => {
    // Midnight before the change is still CET (UTC+1)
    expect(dateInZone(new Date('2026-03-28T22:59:59Z'), PRAGUE)).toBe('2026-03-28');
    expect(dateInZone(new Date('2026-03-28T23:00:00Z'), PRAGUE)).toBe('2026-03-29');
    // Around the jump itself the date does not change
    expect(dateInZone(new Date('2026-03-29T00:59:59Z'), PRAGUE)).toBe('2026-03-29');
    expect(dateInZone(new Date('2026-03-29T01:00:00Z'), PRAGUE)).toBe('2026-03-29');
    // Midnight at the end of the change day is CEST (UTC+2)
    expect(dateInZone(new Date('2026-03-29T21:59:59Z'), PRAGUE)).toBe('2026-03-29');
    expect(dateInZone(new Date('2026-03-29T22:00:00Z'), PRAGUE)).toBe('2026-03-30');
  });

  it('handles the autumn DST change day (25 Oct 2026, 03:00 → 02:00)', () => {
    // Midnight before the change is CEST (UTC+2)
    expect(dateInZone(new Date('2026-10-24T21:59:59Z'), PRAGUE)).toBe('2026-10-24');
    expect(dateInZone(new Date('2026-10-24T22:00:00Z'), PRAGUE)).toBe('2026-10-25');
    // Midnight at the end of the change day is CET (UTC+1)
    expect(dateInZone(new Date('2026-10-25T22:59:59Z'), PRAGUE)).toBe('2026-10-25');
    expect(dateInZone(new Date('2026-10-25T23:00:00Z'), PRAGUE)).toBe('2026-10-26');
  });

  it('handles the year boundary', () => {
    expect(dateInZone(new Date('2026-12-31T22:59:59Z'), PRAGUE)).toBe('2026-12-31');
    expect(dateInZone(new Date('2026-12-31T23:00:00Z'), PRAGUE)).toBe('2027-01-01');
  });

  it('works for other configured zones', () => {
    expect(dateInZone(new Date('2026-01-15T03:00:00Z'), 'America/New_York')).toBe('2026-01-14');
  });
});

describe('date helpers', () => {
  it('validates YYYY-MM-DD strings', () => {
    expect(isISODate('2026-10-10')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-1-5')).toBe(false);
    expect(isISODate('2026-10-10T00:00')).toBe(false);
    expect(isISODate('')).toBe(false);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('counts whole days between dates, including across DST', () => {
    expect(daysBetween('2026-10-10', '2026-10-13')).toBe(3);
    expect(daysBetween('2026-10-13', '2026-10-10')).toBe(-3);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('picks the later date', () => {
    expect(maxDate('2026-10-10', '2026-10-09')).toBe('2026-10-10');
    expect(maxDate('2026-10-09', '2026-10-10')).toBe('2026-10-10');
  });

  it('formats short dates like "Mon 12 Oct"', () => {
    expect(formatShortDate('2026-10-12')).toBe('Mon 12 Oct');
    expect(formatShortDate('2026-10-16')).toBe('Fri 16 Oct');
  });

  it('validates time zones', () => {
    expect(isValidTimeZone('Europe/Prague')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
