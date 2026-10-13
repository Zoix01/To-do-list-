import { describe, expect, it } from 'vitest';
import {
  applyPlanningChange,
  compareByUrgency,
  czechCollator,
  deadlineError,
  deadlineLabel,
  groupByList,
  groupByPriority,
  groupCompleted,
  isPlannedAfterDeadline,
  newTaskPlanning,
  plannedDateError,
  sortTasks,
  taskFlag,
  todaySections,
  urgency,
} from './tasks';
import type { List, Task } from './types';

const TODAY = '2026-10-10'; // a Saturday

let nextId = 0;
function task(fields: Partial<Task> = {}): Task {
  nextId += 1;
  return {
    id: `t${String(nextId).padStart(3, '0')}`,
    listId: null,
    title: 'Task',
    notes: null,
    priority: 'medium',
    deadline: '2026-10-20',
    plannedDate: null,
    plannedManual: false,
    recurringId: null,
    weekStart: null,
    occurrence: 0,
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...fields,
  };
}

function list(id: string, sortOrder: number): List {
  return { id, name: id, color: '#6A9FB5', sortOrder, createdAt: '2026-10-01T10:00:00.000Z' };
}

const titles = (tasks: Task[]) => tasks.map((t) => t.title);

describe('newTaskPlanning', () => {
  it('leaves a new task unplanned when no planned date is given', () => {
    expect(newTaskPlanning('2026-10-15', undefined)).toEqual({
      deadline: '2026-10-15',
      plannedDate: null,
      plannedManual: false,
    });
  });
  it('leaves it unplanned for an explicit null', () => {
    expect(newTaskPlanning('2026-10-15', null).plannedDate).toBeNull();
  });
  it('keeps an explicit planned date as set by hand', () => {
    expect(newTaskPlanning('2026-10-15', '2026-10-12')).toEqual({
      deadline: '2026-10-15',
      plannedDate: '2026-10-12',
      plannedManual: true,
    });
  });
});

describe('applyPlanningChange', () => {
  const planned = { deadline: '2026-10-15', plannedDate: '2026-10-12', plannedManual: true };
  const unplanned = { deadline: '2026-10-15', plannedDate: null, plannedManual: false };
  // Tasks created before automatic planning was removed may still have one.
  const legacyAuto = { deadline: '2026-10-15', plannedDate: '2026-10-14', plannedManual: false };

  it('never moves the planned date when the deadline changes', () => {
    expect(applyPlanningChange(planned, { deadline: '2026-10-20' })).toEqual({
      ...planned,
      deadline: '2026-10-20',
    });
    expect(applyPlanningChange(legacyAuto, { deadline: '2026-10-20' })).toEqual({
      ...legacyAuto,
      deadline: '2026-10-20',
    });
  });
  it('keeps an unplanned task unplanned when the deadline changes', () => {
    expect(applyPlanningChange(unplanned, { deadline: '2026-10-20' }).plannedDate).toBeNull();
  });
  it('marks the plan manual when the planned date is set', () => {
    expect(applyPlanningChange(unplanned, { plannedDate: '2026-10-11' })).toEqual({
      deadline: '2026-10-15',
      plannedDate: '2026-10-11',
      plannedManual: true,
    });
  });
  it('unplans by setting null', () => {
    expect(applyPlanningChange(planned, { plannedDate: null })).toEqual({
      deadline: '2026-10-15',
      plannedDate: null,
      plannedManual: true,
    });
  });
  it('applies both when deadline and planned date change at once', () => {
    expect(
      applyPlanningChange(unplanned, { deadline: '2026-10-20', plannedDate: '2026-10-11' }),
    ).toEqual({ deadline: '2026-10-20', plannedDate: '2026-10-11', plannedManual: true });
  });
  it('returns only the planning fields, even when given a whole task', () => {
    expect(applyPlanningChange(task({ title: 'x', ...planned }), {})).toEqual(planned);
  });
});

describe('deadlineError', () => {
  it('accepts today and future deadlines', () => {
    expect(deadlineError('2026-10-10', TODAY)).toBeNull();
    expect(deadlineError('2027-01-01', TODAY)).toBeNull();
  });
  it('rejects a past deadline on create', () => {
    expect(deadlineError('2026-10-09', TODAY)).toBe('Deadline cannot be in the past');
  });
  it('rejects changing a deadline to a past date', () => {
    expect(deadlineError('2026-10-09', TODAY, '2026-10-20')).toBe('Deadline cannot be in the past');
    expect(deadlineError('2026-10-01', TODAY, '2026-10-05')).toBe('Deadline cannot be in the past');
  });
  it('allows keeping an existing past deadline unchanged', () => {
    expect(deadlineError('2026-10-05', TODAY, '2026-10-05')).toBeNull();
  });
  it('allows moving a past deadline to the future', () => {
    expect(deadlineError('2026-10-12', TODAY, '2026-10-05')).toBeNull();
  });
  it('rejects invalid dates', () => {
    expect(deadlineError('2026-13-01', TODAY)).toBe('Deadline must be a valid date');
  });
});

describe('plannedDateError', () => {
  it('accepts today, future dates and "unplanned"', () => {
    expect(plannedDateError('2026-10-10', TODAY)).toBeNull();
    expect(plannedDateError('2026-12-01', TODAY)).toBeNull();
    expect(plannedDateError(null, TODAY)).toBeNull();
    expect(plannedDateError(null, TODAY, '2026-10-01')).toBeNull();
  });
  it('rejects a past planned date on create and on change', () => {
    expect(plannedDateError('2026-10-09', TODAY)).toBe('Planned date cannot be in the past');
    expect(plannedDateError('2026-10-09', TODAY, '2026-10-15')).toBe(
      'Planned date cannot be in the past',
    );
    expect(plannedDateError('2026-10-02', TODAY, null)).toBe('Planned date cannot be in the past');
  });
  it('allows keeping an existing past planned date unchanged', () => {
    expect(plannedDateError('2026-10-05', TODAY, '2026-10-05')).toBeNull();
  });
  it('rejects invalid dates', () => {
    expect(plannedDateError('2026-02-30', TODAY)).toBe('Planned date must be a valid date');
  });
});

describe('taskFlag', () => {
  it('is red when the deadline has passed', () => {
    expect(taskFlag(task({ deadline: '2026-10-09', plannedDate: '2026-10-08' }), TODAY)).toBe(
      'overdue',
    );
  });
  it('is orange when only the planned date has passed', () => {
    expect(taskFlag(task({ deadline: '2026-10-12', plannedDate: '2026-10-09' }), TODAY)).toBe(
      'missed_plan',
    );
  });
  it('is none when deadline is today and plan is today', () => {
    expect(taskFlag(task({ deadline: '2026-10-10', plannedDate: '2026-10-10' }), TODAY)).toBe(null);
  });
  it('is none for unplanned future tasks', () => {
    expect(taskFlag(task({ deadline: '2026-10-12', plannedDate: null }), TODAY)).toBe(null);
  });
  it('is red (not orange) for an overdue unplanned task', () => {
    expect(taskFlag(task({ deadline: '2026-10-01', plannedDate: null }), TODAY)).toBe('overdue');
  });
  it('is none for completed tasks', () => {
    const done = task({ deadline: '2026-10-01', completedAt: '2026-10-02T10:00:00.000Z' });
    expect(taskFlag(done, TODAY)).toBe(null);
  });
});

describe('isPlannedAfterDeadline', () => {
  it('warns when planned after the deadline', () => {
    expect(isPlannedAfterDeadline({ deadline: '2026-10-12', plannedDate: '2026-10-13' })).toBe(
      true,
    );
  });
  it('does not warn on or before the deadline, or when unplanned', () => {
    expect(isPlannedAfterDeadline({ deadline: '2026-10-12', plannedDate: '2026-10-12' })).toBe(
      false,
    );
    expect(isPlannedAfterDeadline({ deadline: '2026-10-12', plannedDate: '2026-10-11' })).toBe(
      false,
    );
    expect(isPlannedAfterDeadline({ deadline: '2026-10-12', plannedDate: null })).toBe(false);
  });
});

describe('deadlineLabel', () => {
  it.each([
    ['2026-10-10', 'due today'],
    ['2026-10-11', 'due tomorrow'],
    ['2026-10-12', 'due in 2 days'],
    ['2026-10-16', 'due in 6 days'],
    ['2026-10-17', 'due Sat 17 Oct'],
    ['2026-11-02', 'due Mon 2 Nov'],
    ['2026-10-09', 'due Fri 9 Oct'],
    ['2026-09-30', 'due Wed 30 Sep'],
  ])('%s → %s', (deadline, label) => {
    expect(deadlineLabel(deadline, TODAY)).toBe(label);
  });
});

describe('urgency', () => {
  it('follows weight / max(days, 0.5)', () => {
    expect(urgency({ priority: 'high', deadline: '2026-10-13' }, TODAY)).toBe(1);
    expect(urgency({ priority: 'medium', deadline: '2026-10-11' }, TODAY)).toBe(2);
    expect(urgency({ priority: 'low', deadline: '2026-10-10' }, TODAY)).toBe(2);
    expect(urgency({ priority: 'high', deadline: '2026-10-10' }, TODAY)).toBe(6);
  });
});

describe('sorting', () => {
  it('urgency sort: red first (most overdue first), then orange, then by urgency', () => {
    const tasks = [
      task({ title: 'far high', priority: 'high', deadline: '2026-10-30' }), // 3/20
      task({ title: 'soon low', priority: 'low', deadline: '2026-10-11' }), // 1/1
      task({ title: 'today med', priority: 'medium', deadline: '2026-10-10' }), // 2/0.5
      task({ title: 'red recent', priority: 'high', deadline: '2026-10-09' }),
      task({ title: 'red old', priority: 'low', deadline: '2026-10-01' }),
      task({ title: 'orange', priority: 'low', deadline: '2026-10-30', plannedDate: '2026-10-08' }),
    ];
    expect(titles(sortTasks(tasks, 'urgency', TODAY))).toEqual([
      'red old',
      'red recent',
      'orange',
      'today med',
      'soon low',
      'far high',
    ]);
  });

  it('urgency ties are broken by deadline, then title', () => {
    const a = task({ title: 'B', priority: 'high', deadline: '2026-10-13' }); // 3/3 = 1
    const b = task({ title: 'A', priority: 'low', deadline: '2026-10-11' }); // 1/1 = 1
    const c = task({ title: 'A', priority: 'high', deadline: '2026-10-13' }); // 1
    expect(titles(sortTasks([a, c, b], 'urgency', TODAY))).toEqual(['A', 'A', 'B']);
    expect(sortTasks([a, c, b], 'urgency', TODAY)[0]).toBe(b);
    expect(compareByUrgency(a, c, TODAY)).toBeGreaterThan(0);
  });

  it('orange tasks are ordered by oldest planned date first', () => {
    const tasks = [
      task({ title: 'newer', deadline: '2026-10-20', plannedDate: '2026-10-09' }),
      task({ title: 'older', deadline: '2026-10-25', plannedDate: '2026-10-02' }),
    ];
    expect(titles(sortTasks(tasks, 'deadline', TODAY))).toEqual(['older', 'newer']);
  });

  it('deadline sort: overdue first, then earliest deadline, then title (Czech)', () => {
    const tasks = [
      task({ title: 'later', deadline: '2026-10-20' }),
      task({ title: 'chleba', deadline: '2026-10-12' }),
      task({ title: 'hrnek', deadline: '2026-10-12' }),
      task({ title: 'orange', deadline: '2026-10-30', plannedDate: '2026-10-09' }),
      task({ title: 'red', deadline: '2026-10-09' }),
    ];
    expect(titles(sortTasks(tasks, 'deadline', TODAY))).toEqual([
      'red',
      'orange',
      'hrnek',
      'chleba', // "ch" sorts after "h" in Czech
      'later',
    ]);
  });

  it('list sort: groups in list order, No list last, overdue first inside each group', () => {
    const lists = [list('work', 2), list('home', 1)];
    const tasks = [
      task({ title: 'loose', listId: null, deadline: '2026-10-11' }),
      task({ title: 'work late', listId: 'work', deadline: '2026-10-25' }),
      task({ title: 'work red', listId: 'work', deadline: '2026-10-05' }),
      task({ title: 'home', listId: 'home', deadline: '2026-10-15' }),
      task({ title: 'gone list', listId: 'deleted', deadline: '2026-10-12' }),
    ];
    const groups = groupByList(tasks, lists, TODAY);
    expect(groups.map((g) => g.list?.id ?? null)).toEqual(['home', 'work', null]);
    expect(titles(groups[1]!.tasks)).toEqual(['work red', 'work late']);
    expect(titles(groups[2]!.tasks)).toEqual(['loose', 'gone list']);
  });

  it('list sort leaves out empty groups', () => {
    const groups = groupByList([task({ listId: 'home' })], [list('home', 1), list('x', 2)], TODAY);
    expect(groups.map((g) => g.list?.id)).toEqual(['home']);
  });
});

describe('groupByPriority', () => {
  it('returns high, medium, low groups, each by deadline with overdue first', () => {
    const tasks = [
      task({ title: 'low', priority: 'low', deadline: '2026-10-12' }),
      task({ title: 'high later', priority: 'high', deadline: '2026-10-20' }),
      task({ title: 'high red', priority: 'high', deadline: '2026-10-05' }),
      task({ title: 'high sooner', priority: 'high', deadline: '2026-10-11' }),
    ];
    const groups = groupByPriority(tasks, TODAY);
    expect(groups.map((g) => g.priority)).toEqual(['high', 'medium', 'low']);
    expect(titles(groups[0]!.tasks)).toEqual(['high red', 'high sooner', 'high later']);
    expect(groups[1]!.tasks).toEqual([]);
    expect(titles(groups[2]!.tasks)).toEqual(['low']);
  });
});

describe('czechCollator', () => {
  it('sorts with Czech rules', () => {
    const words = ['ch', 'h', 'i', 'č', 'c', 'ř', 'r', 's', 'š'];
    expect([...words].sort(czechCollator.compare)).toEqual([
      'c',
      'č',
      'h',
      'ch',
      'i',
      'r',
      'ř',
      's',
      'š',
    ]);
  });
});

describe('todaySections', () => {
  it('puts each task in exactly one section, the first that matches', () => {
    const tasks = [
      task({ title: 'overdue planned today', deadline: '2026-10-08', plannedDate: TODAY }),
      task({ title: 'missed due today', deadline: TODAY, plannedDate: '2026-10-09' }),
      task({ title: 'planned today', deadline: '2026-10-12', plannedDate: TODAY }),
      task({ title: 'planned & due today', deadline: TODAY, plannedDate: TODAY }),
      task({ title: 'due today, unplanned', deadline: TODAY, plannedDate: null }),
      task({ title: 'due today, planned later', deadline: TODAY, plannedDate: '2026-10-11' }),
      task({ title: 'future', deadline: '2026-10-20', plannedDate: '2026-10-19' }),
      task({ title: 'done', deadline: '2026-10-01', completedAt: '2026-10-02T08:00:00.000Z' }),
    ];
    const sections = todaySections(tasks, TODAY);
    expect(titles(sections.overdue)).toEqual(['overdue planned today']);
    expect(titles(sections.missedPlan)).toEqual(['missed due today']);
    expect(titles(sections.today)).toEqual(['planned & due today', 'planned today']);
    expect(titles(sections.dueToday)).toEqual(['due today, planned later', 'due today, unplanned']);
    expect(sections.thisWeek).toEqual([]);
  });

  it('lists this week’s unplanned weekly instances in "This week, unplanned"', () => {
    // TODAY is Saturday 10 Oct; its week started Monday 5 Oct.
    const weekly = { recurringId: 'r1', weekStart: '2026-10-05' };
    const tasks = [
      task({ title: 'flexible, unplanned', ...weekly, deadline: '2026-10-11', plannedDate: null }),
      task({
        title: 'flexible, planned Sun',
        ...weekly,
        deadline: '2026-10-11',
        plannedDate: '2026-10-11',
      }),
      task({
        title: 'next week',
        recurringId: 'r1',
        weekStart: '2026-10-12',
        deadline: '2026-10-18',
      }),
      task({ title: 'normal unplanned', deadline: '2026-10-11', plannedDate: null }),
      task({ title: 'due today wins', ...weekly, deadline: TODAY, plannedDate: null }),
    ];
    const sections = todaySections(tasks, TODAY);
    expect(titles(sections.thisWeek)).toEqual(['flexible, unplanned']);
    expect(titles(sections.dueToday)).toEqual(['due today wins']);
  });
});

describe('groupCompleted', () => {
  it('groups by completion date in the given zone, newest first', () => {
    const tasks = [
      task({ title: 'a', completedAt: '2026-10-09T10:00:00.000Z' }),
      // 22:30 UTC on 9 Oct = 00:30 on 10 Oct in Prague (CEST)
      task({ title: 'b', completedAt: '2026-10-09T22:30:00.000Z' }),
      task({ title: 'c', completedAt: '2026-10-10T08:00:00.000Z' }),
      task({ title: 'open' }),
    ];
    const groups = groupCompleted(tasks, 'Europe/Prague');
    expect(groups.map((g) => [g.date, titles(g.tasks)])).toEqual([
      ['2026-10-10', ['c', 'b']],
      ['2026-10-09', ['a']],
    ]);
  });
});
