import { describe, expect, it } from 'vitest';
import {
  assistantHabit,
  assistantTask,
  buildOverview,
  connectionKind,
  filterTasks,
  isAllowedRedirectUri,
  matchList,
  overviewRangeError,
} from './assistant';
import type { HabitWithChecks, List, Task } from './types';

const TODAY = '2026-10-12'; // Monday
const TZ = 'Europe/Prague';

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
    occurrence: 0,
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...fields,
  };
}

const lists: List[] = [
  { id: 'l1', name: 'Práce', color: '#6A9FB5', sortOrder: 0, createdAt: 'x' },
  { id: 'l2', name: 'Domácnost', color: '#7FA36B', sortOrder: 1, createdAt: 'x' },
];
const listsById = new Map(lists.map((l) => [l.id, l]));

describe('isAllowedRedirectUri (only Claude may connect)', () => {
  it('accepts claude.ai’s callback', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
  });
  it('accepts Claude Code’s loopback callback on any port', () => {
    expect(isAllowedRedirectUri('http://localhost:3118/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:51234/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost/callback')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const uri of [
      'https://evil.example/api/mcp/auth_callback',
      'https://claude.ai.evil.example/api/mcp/auth_callback',
      'https://claude.ai/api/mcp/auth_callback/../x',
      'https://claude.ai/other',
      'http://claude.ai/api/mcp/auth_callback',
      'https://localhost:3000/callback',
      'http://localhost:3000/other',
      'http://evil.example:3000/callback',
      'http://user@localhost:3000/callback',
      'http://localhost:3000/callback?x=1',
      'not a url',
    ]) {
      expect(isAllowedRedirectUri(uri), uri).toBe(false);
    }
  });
});

describe('connectionKind', () => {
  it('tells claude.ai apart from Claude Code', () => {
    expect(connectionKind(['https://claude.ai/api/mcp/auth_callback'])).toBe('claude');
    expect(connectionKind(['http://localhost:4000/callback'])).toBe('claude-code');
    expect(connectionKind(['http://127.0.0.1:5000/callback'])).toBe('claude-code');
  });
});

describe('matchList', () => {
  it('matches case-insensitively, including Czech letters', () => {
    expect(matchList(lists, 'práce')).toMatchObject({ ok: true, list: { id: 'l1' } });
    expect(matchList(lists, '  DOMÁCNOST ')).toMatchObject({ ok: true, list: { id: 'l2' } });
  });
  it('lists the valid names when not found', () => {
    expect(matchList(lists, 'Škola')).toEqual({
      ok: false,
      error:
        'No list called "Škola". Valid lists: "Práce", "Domácnost". Omit the list for a task without one.',
    });
  });
  it('explains when there are no lists', () => {
    expect(matchList([], 'x')).toMatchObject({ ok: false });
  });
});

describe('assistantTask', () => {
  it('shows list name, priority number, flag and weekly mark', () => {
    const view = assistantTask(
      task({
        listId: 'l1',
        priority: 'high',
        deadline: '2026-10-10',
        recurringId: 'r1',
      }),
      listsById,
      TODAY,
      TZ,
    );
    expect(view).toMatchObject({
      list: 'Práce',
      priority: 'high',
      priorityNumber: 2,
      flag: 'overdue',
      weekly: true,
      completed: false,
      completedOn: null,
    });
  });
  it('gives the completion date in the configured time zone', () => {
    // 22:30 UTC on 11 Oct = 00:30 on 12 Oct in Prague
    const view = assistantTask(
      task({ completedAt: '2026-10-11T22:30:00.000Z' }),
      listsById,
      TODAY,
      TZ,
    );
    expect(view).toMatchObject({ completed: true, completedOn: '2026-10-12', flag: null });
  });
});

describe('filterTasks', () => {
  const tasks = [
    task({ title: 'red', deadline: '2026-10-05', listId: 'l1' }),
    task({ title: 'orange', deadline: '2026-10-20', plannedDate: '2026-10-08' }),
    task({ title: 'later', deadline: '2026-10-25', listId: 'l2' }),
    task({ title: 'soon', deadline: '2026-10-14', listId: 'l1' }),
  ];
  const titles = (result: Task[]) => result.map((t) => t.title);

  it('filters by list (or no list) and sorts like the app', () => {
    expect(titles(filterTasks(tasks, {}, 'l1', TODAY))).toEqual(['red', 'soon']);
    expect(titles(filterTasks(tasks, {}, null, TODAY))).toEqual(['orange']);
    expect(titles(filterTasks(tasks, {}, undefined, TODAY))).toEqual([
      'red',
      'orange',
      'soon',
      'later',
    ]);
  });
  it('filters by deadline range', () => {
    expect(
      titles(
        filterTasks(
          tasks,
          { deadlineFrom: '2026-10-14', deadlineTo: '2026-10-20' },
          undefined,
          TODAY,
        ),
      ),
    ).toEqual(['orange', 'soon']); // flagged tasks first, like the app
  });
  it('filters by flag', () => {
    expect(titles(filterTasks(tasks, { flag: 'overdue' }, undefined, TODAY))).toEqual(['red']);
    expect(titles(filterTasks(tasks, { flag: 'missed_plan' }, undefined, TODAY))).toEqual([
      'orange',
    ]);
    expect(titles(filterTasks(tasks, { flag: 'none' }, undefined, TODAY))).toEqual([
      'soon',
      'later',
    ]);
  });
});

describe('overviewRangeError', () => {
  it('accepts valid ranges up to 92 days', () => {
    expect(overviewRangeError('2026-10-12', '2026-10-18')).toBeNull();
    expect(overviewRangeError('2026-10-01', '2026-12-31')).toBeNull(); // 92 days
  });
  it('rejects bad input', () => {
    expect(overviewRangeError('2026-10-18', '2026-10-12')).toBe('"from" must be on or before "to"');
    expect(overviewRangeError('2026-10-01', '2027-01-01')).toBe('The range can be at most 92 days');
    expect(overviewRangeError('12.10.2026', '2026-10-18')).toBe(
      'Dates must be in YYYY-MM-DD format',
    );
  });
});

describe('buildOverview', () => {
  const habit: HabitWithChecks = {
    id: 'h1',
    name: 'Čtení',
    color: '#E8925A',
    icon: null,
    frequency: 'daily',
    weekdays: [],
    target: null,
    archived: false,
    importance: 2,
    frozen: [],
    armedFreezes: 0,
    tickAnimation: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    checks: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-13'],
  };
  const archived: HabitWithChecks = { ...habit, id: 'h2', name: 'Old', archived: true };

  it('groups a week for a weekly review', () => {
    const open = [
      task({ title: 'red', deadline: '2026-10-05' }),
      task({ title: 'orange', deadline: '2026-10-20', plannedDate: '2026-10-09' }),
      task({ title: 'planned tue', deadline: '2026-10-16', plannedDate: '2026-10-13' }),
      task({ title: 'due fri', deadline: '2026-10-16' }),
      task({ title: 'outside', deadline: '2026-11-30', plannedDate: '2026-11-29' }),
    ];
    const completed = [
      task({ title: 'done mon', completedAt: '2026-10-12T08:00:00.000Z' }),
      task({ title: 'done last week', completedAt: '2026-10-08T08:00:00.000Z' }),
    ];
    const overview = buildOverview({
      openTasks: open,
      completedTasks: completed,
      lists,
      habits: [habit, archived],
      from: '2026-10-12',
      to: '2026-10-18',
      today: TODAY,
      timeZone: TZ,
    });
    const names = (items: { title: string }[]) => items.map((t) => t.title);
    expect(overview.today).toBe(TODAY);
    expect(names(overview.overdue)).toEqual(['red']);
    expect(names(overview.missedPlan)).toEqual(['orange']);
    expect(Object.keys(overview.plannedByDay)).toEqual(['2026-10-13']);
    expect(names(overview.plannedByDay['2026-10-13']!)).toEqual(['planned tue']);
    // Same deadline → by title.
    expect(names(overview.deadlinesByDay['2026-10-16']!)).toEqual(['due fri', 'planned tue']);
    expect(names(overview.unplanned)).toEqual(['red', 'due fri']);
    expect(names(overview.completed)).toEqual(['done mon']);
    expect(overview.habits).toHaveLength(1);
    expect(overview.habits[0]).toMatchObject({
      name: 'Čtení',
      daysDoneInRange: ['2026-10-13'],
    });
  });
});

describe('assistantHabit', () => {
  it('reports streak, unit, due and progress', () => {
    const perWeek: HabitWithChecks = {
      id: 'h',
      name: 'Běhání',
      color: '#4FB077',
      icon: null,
      frequency: 'per_week',
      weekdays: [],
      target: 3,
      archived: false,
      importance: 2,
      frozen: [],
      armedFreezes: 0,
      tickAnimation: null,
      createdAt: 'x',
      checks: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'],
    };
    expect(assistantHabit(perWeek, TODAY)).toEqual({
      name: 'Běhání',
      frequency: '3× per week',
      archived: false,
      currentStreak: 1,
      bestStreak: 1,
      streakUnit: 'weeks',
      dueToday: true,
      doneToday: true,
      progress: '1/3 this week',
    });
  });
});
