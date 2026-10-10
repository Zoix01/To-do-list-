import { describe, expect, it } from 'vitest';
import { calendarEntries, canPlanOn, unplannedTasks } from './calendar';
import { formatMonthTitle, formatWeekTitle, mondayOf, weekDates, addMonths } from './dates';
import type { Task } from './types';

const TODAY = '2026-10-10';

let nextId = 0;
function task(fields: Partial<Task> = {}): Task {
  nextId += 1;
  return {
    id: `t${nextId}`,
    listId: null,
    title: `Task ${nextId}`,
    notes: null,
    priority: 'medium',
    deadline: '2026-10-20',
    plannedDate: null,
    plannedManual: false,
    recurringId: null,
    weekStart: null,
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...fields,
  };
}

describe('calendarEntries', () => {
  it('shows a planned and a deadline entry when the dates differ', () => {
    const t = task({ deadline: '2026-10-20', plannedDate: '2026-10-15' });
    expect(calendarEntries([t], TODAY)).toEqual([
      expect.objectContaining({
        id: `${t.id}:planned`,
        date: '2026-10-15',
        kind: 'planned',
        draggable: true,
      }),
      expect.objectContaining({
        id: `${t.id}:deadline`,
        date: '2026-10-20',
        kind: 'deadline',
        draggable: false,
      }),
    ]);
  });

  it('combines both into one draggable entry when planned date = deadline', () => {
    const t = task({ deadline: '2026-10-20', plannedDate: '2026-10-20' });
    expect(calendarEntries([t], TODAY)).toEqual([
      expect.objectContaining({
        id: `${t.id}:both`,
        date: '2026-10-20',
        kind: 'both',
        draggable: true,
      }),
    ]);
  });

  it('shows only the deadline entry for unplanned tasks', () => {
    const t = task({ deadline: '2026-10-20', plannedDate: null });
    expect(calendarEntries([t], TODAY).map((e) => e.kind)).toEqual(['deadline']);
  });

  it('leaves out completed tasks entirely', () => {
    const done = task({ plannedDate: '2026-10-15', completedAt: '2026-10-09T10:00:00.000Z' });
    expect(calendarEntries([done], TODAY)).toEqual([]);
  });

  it('carries the overdue / missed-plan flag on every entry of the task', () => {
    const red = task({ deadline: '2026-10-08', plannedDate: '2026-10-07' });
    const orange = task({ deadline: '2026-10-20', plannedDate: '2026-10-09' });
    const entries = calendarEntries([red, orange], TODAY);
    expect(entries.filter((e) => e.taskId === red.id).map((e) => e.flag)).toEqual([
      'overdue',
      'overdue',
    ]);
    expect(entries.filter((e) => e.taskId === orange.id).map((e) => e.flag)).toEqual([
      'missed_plan',
      'missed_plan',
    ]);
  });

  it('orders entries overdue first, then by deadline', () => {
    const later = task({ deadline: '2026-10-25' });
    const red = task({ deadline: '2026-10-05' });
    const sooner = task({ deadline: '2026-10-12' });
    const order = Object.fromEntries(
      calendarEntries([later, red, sooner], TODAY).map((e) => [e.taskId, e.order]),
    );
    expect(order[red.id]).toBeLessThan(order[sooner.id]!);
    expect(order[sooner.id]).toBeLessThan(order[later.id]!);
  });

  it('marks a planned entry after the deadline (and only that entry)', () => {
    const late = task({ deadline: '2026-10-15', plannedDate: '2026-10-18' });
    const fine = task({ deadline: '2026-10-15', plannedDate: '2026-10-14' });
    const entries = calendarEntries([late, fine], TODAY);
    const flags = (t: Task) =>
      entries.filter((e) => e.taskId === t.id).map((e) => [e.kind, e.afterDeadline]);
    expect(flags(late)).toEqual([
      ['planned', true],
      ['deadline', false],
    ]);
    expect(flags(fine)).toEqual([
      ['planned', false],
      ['deadline', false],
    ]);
  });

  it('gives every entry a unique id', () => {
    const tasks = [
      task({ plannedDate: '2026-10-11' }),
      task({ plannedDate: '2026-10-20' }),
      task(),
    ];
    const ids = calendarEntries(tasks, TODAY).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('unplannedTasks', () => {
  it('lists open tasks without a planned date, earliest deadline first', () => {
    const a = task({ title: 'later', deadline: '2026-10-25' });
    const b = task({ title: 'sooner', deadline: '2026-10-12' });
    const planned = task({ plannedDate: '2026-10-11' });
    const done = task({ completedAt: '2026-10-09T10:00:00.000Z' });
    expect(unplannedTasks([a, b, planned, done], TODAY).map((t) => t.title)).toEqual([
      'sooner',
      'later',
    ]);
  });
});

describe('canPlanOn', () => {
  it('allows today and later, not past days', () => {
    expect(canPlanOn('2026-10-10', TODAY)).toBe(true);
    expect(canPlanOn('2026-10-11', TODAY)).toBe(true);
    expect(canPlanOn('2026-10-09', TODAY)).toBe(false);
  });
});

describe('week and month helpers', () => {
  it('weeks run Monday–Sunday', () => {
    expect(weekDates('2026-10-10')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('a Sunday belongs to the week that started the Monday before', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
  });

  it('handles weeks across the year boundary', () => {
    expect(weekDates('2027-01-01')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('handles the DST change week', () => {
    expect(weekDates('2026-10-25')[0]).toBe('2026-10-19');
    expect(weekDates('2026-10-25')[6]).toBe('2026-10-25');
  });

  it('formats titles', () => {
    expect(formatMonthTitle('2026-10-10')).toBe('October 2026');
    expect(formatWeekTitle('2026-10-14')).toBe('12–18 Oct 2026');
    expect(formatWeekTitle('2026-10-01')).toBe('28 Sep – 4 Oct 2026');
    expect(formatWeekTitle('2027-01-01')).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('moves by months, clamping to the month end', () => {
    expect(addMonths('2026-10-10', 1)).toBe('2026-11-10');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
});
