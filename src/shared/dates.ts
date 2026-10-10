import {
  addDays as addDaysToDate,
  addMonths as addMonthsToDate,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfMonth as startOfMonthDate,
  startOfWeek,
} from 'date-fns';
import type { ISODate } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = parseISO(value);
  // Rejects dates like 2026-02-30 that parse but roll over.
  return isValid(date) && format(date, 'yyyy-MM-dd') === value;
}

function toDate(date: ISODate): Date {
  return parseISO(date);
}

function fromDate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd');
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDate(addDaysToDate(toDate(date), days));
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(toDate(to), toDate(from));
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** e.g. "Mon 12 Oct" */
export function formatShortDate(date: ISODate): string {
  return format(toDate(date), 'EEE d MMM');
}

export function addMonths(date: ISODate, months: number): ISODate {
  return fromDate(addMonthsToDate(toDate(date), months));
}

export function startOfMonth(date: ISODate): ISODate {
  return fromDate(startOfMonthDate(toDate(date)));
}

/** Monday of the week containing `date` (weeks run Monday–Sunday). */
export function mondayOf(date: ISODate): ISODate {
  return fromDate(startOfWeek(toDate(date), { weekStartsOn: 1 }));
}

/** The 7 dates Monday–Sunday of the week containing `date`. */
export function weekDates(date: ISODate): ISODate[] {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** e.g. "October 2026" */
export function formatMonthTitle(date: ISODate): string {
  return format(toDate(date), 'MMMM yyyy');
}

/** e.g. "12–18 Oct 2026", "28 Sep – 4 Oct 2026", "28 Dec 2026 – 3 Jan 2027" */
export function formatWeekTitle(date: ISODate): string {
  const start = toDate(mondayOf(date));
  const end = toDate(addDays(mondayOf(date), 6));
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd')}–${format(end, 'd MMM yyyy')}`;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar date of `instant` as seen in `timeZone`. */
export function dateInZone(instant: Date, timeZone: string): ISODate {
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    zoneFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}
