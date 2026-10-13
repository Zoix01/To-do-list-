import { describe, expect, it } from 'vitest';
import { instanceFor, planGeneration } from './recurrence';
import type { RecurringTask } from './types';

function template(fields: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: 'r1',
    listId: null,
    title: 'Vynést koš',
    notes: null,
    priority: 'medium',
    mode: 'fixed',
    weekday: 2, // Tuesday
    active: true,
    activeFrom: '2026-10-05',
    generatedThrough: null,
    weight: 5,
    createdAt: '2026-10-05T08:00:00.000Z',
    ...fields,
  };
}

describe('instanceFor', () => {
  it('fixed: deadline = planned date = that weekday of the week', () => {
    expect(instanceFor(template({ weekday: 2 }), '2026-10-12')).toEqual({
      weekStart: '2026-10-12',
      deadline: '2026-10-13',
      plannedDate: '2026-10-13',
    });
    expect(instanceFor(template({ weekday: 1 }), '2026-10-12').deadline).toBe('2026-10-12');
    expect(instanceFor(template({ weekday: 7 }), '2026-10-12').deadline).toBe('2026-10-18');
  });

  it('flexible: deadline = Sunday, unplanned', () => {
    expect(instanceFor(template({ mode: 'flexible', weekday: null }), '2026-10-12')).toEqual({
      weekStart: '2026-10-12',
      deadline: '2026-10-18',
      plannedDate: null,
    });
  });

  it('handles the year boundary', () => {
    expect(instanceFor(template({ weekday: 5 }), '2026-12-28').deadline).toBe('2027-01-01');
    expect(instanceFor(template({ mode: 'flexible' }), '2026-12-28').deadline).toBe('2027-01-03');
  });
});

describe('planGeneration', () => {
  it('creates the current week on first load', () => {
    const plan = planGeneration(template(), '2026-10-12'); // Monday
    expect(plan.create.map((i) => i.deadline)).toEqual(['2026-10-13']);
    expect(plan.generatedThrough).toBe('2026-10-12');
  });

  it('is idempotent: loading again in the same week creates nothing', () => {
    const first = planGeneration(template(), '2026-10-12');
    const again = planGeneration(
      template({ generatedThrough: first.generatedThrough }),
      '2026-10-14',
    );
    expect(again.create).toEqual([]);
    expect(again.generatedThrough).toBe('2026-10-12');
  });

  it('does not bring back a deleted instance (each week is generated once)', () => {
    expect(
      planGeneration(template({ generatedThrough: '2026-10-12' }), '2026-10-16').create,
    ).toEqual([]);
  });

  it('after a missed week, only the current week is generated', () => {
    // Last generated week of 5 Oct; app not opened during the week of 12 Oct.
    const plan = planGeneration(template({ generatedThrough: '2026-10-05' }), '2026-10-20');
    expect(plan.create.map((i) => i.weekStart)).toEqual(['2026-10-19']);
    expect(plan.generatedThrough).toBe('2026-10-19');
  });

  it('a missed instance whose date passed is still created (and will be overdue)', () => {
    // Template existed before; app first opened on Thursday of the week.
    const plan = planGeneration(template({ generatedThrough: '2026-10-05' }), '2026-10-15');
    expect(plan.create.map((i) => i.deadline)).toEqual(['2026-10-13']);
  });

  it('creates next week too right after completing an instance', () => {
    const plan = planGeneration(template({ generatedThrough: '2026-10-12' }), '2026-10-13', {
      includeNextWeek: true,
    });
    expect(plan.create.map((i) => i.weekStart)).toEqual(['2026-10-19']);
    expect(plan.generatedThrough).toBe('2026-10-19');
  });

  it('completing again does not create next week twice', () => {
    const plan = planGeneration(template({ generatedThrough: '2026-10-19' }), '2026-10-14', {
      includeNextWeek: true,
    });
    expect(plan.create).toEqual([]);
  });

  it('a fixed template whose weekday already passed starts next week', () => {
    // Created on Thursday 15 Oct for "every Tuesday".
    const created = template({ activeFrom: '2026-10-15' });
    const thisWeek = planGeneration(created, '2026-10-15');
    expect(thisWeek.create).toEqual([]);
    expect(thisWeek.generatedThrough).toBe('2026-10-12');
    const nextWeek = planGeneration(
      { ...created, generatedThrough: thisWeek.generatedThrough },
      '2026-10-19',
    );
    expect(nextWeek.create.map((i) => i.deadline)).toEqual(['2026-10-20']);
  });

  it('a fixed template whose weekday is today starts this week', () => {
    expect(
      planGeneration(template({ activeFrom: '2026-10-13' }), '2026-10-13').create,
    ).toHaveLength(1);
  });

  it('a flexible template always starts this week (deadline is Sunday)', () => {
    const plan = planGeneration(
      template({ mode: 'flexible', weekday: null, activeFrom: '2026-10-18' }),
      '2026-10-18',
    );
    expect(plan.create.map((i) => i.deadline)).toEqual(['2026-10-18']);
  });

  it('paused templates create nothing', () => {
    expect(planGeneration(template({ active: false }), '2026-10-12')).toEqual({
      create: [],
      generatedThrough: null,
    });
  });

  it('week boundary: Sunday belongs to the week that started Monday', () => {
    expect(planGeneration(template(), '2026-10-18').create[0]?.weekStart).toBe('2026-10-12');
    expect(planGeneration(template(), '2026-10-19').create[0]?.weekStart).toBe('2026-10-19');
  });

  it('year boundary: next week after the last week of December', () => {
    const plan = planGeneration(template({ generatedThrough: '2026-12-28' }), '2026-12-31', {
      includeNextWeek: true,
    });
    expect(plan.create.map((i) => i.deadline)).toEqual(['2027-01-05']);
  });
});
