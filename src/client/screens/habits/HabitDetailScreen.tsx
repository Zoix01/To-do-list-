import { ChevronLeft, ChevronRight, Snowflake, TreePalm } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import {
  addDays,
  addMonths,
  dateInZone,
  endOfMonth,
  formatMonthTitle,
  formatShortDate,
  formatWeekdayShort,
  mondayOf,
  startOfMonth,
} from '../../../shared/dates';
import {
  bestStreak,
  completionRate,
  currentStreak,
  formatStreak,
  habitProgress,
  isScheduled,
  marksOf,
  type HabitMarks,
} from '../../../shared/habits';
import type { HabitWithChecks, ISODate } from '../../../shared/types';
import { ScreenHeader } from '../../components/AppShell';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { useApp } from '../../lib/appContext';
import { useHabitMutations, useHabits, useVacationDays } from '../../lib/queries';
import { useRouter } from '../../lib/router';
import { HabitForm } from './HabitForm';
import './habits.css';

function describeFrequency(habit: HabitWithChecks): string {
  switch (habit.frequency) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return habit.weekdays.map(formatWeekdayShort).join(', ');
    case 'per_week':
      return `${habit.target}× a week`;
    case 'per_month':
      return `${habit.target}× a month`;
  }
}

/** Month grid of checks; tap a day (today or earlier) to tick / un-tick it. */
function MonthGrid({
  habit,
  checks,
  month,
  startedOn,
  marks,
  onToggle,
}: {
  habit: HabitWithChecks;
  checks: ReadonlySet<ISODate>;
  month: ISODate;
  startedOn: ISODate;
  marks: HabitMarks;
  onToggle: (date: ISODate, checked: boolean) => void;
}) {
  const { today, canEdit } = useApp();
  const days: ISODate[] = [];
  const last = addDays(mondayOf(endOfMonth(month)), 6);
  for (let date = mondayOf(month); date <= last; date = addDays(date, 1)) days.push(date);
  // "Missed" only makes sense when single days are scheduled.
  const dayBased = habit.frequency === 'daily' || habit.frequency === 'weekdays';

  return (
    <div
      className="month-grid"
      role="grid"
      aria-label={formatMonthTitle(month)}
      style={{ '--habit-color': habit.color } as CSSProperties}
    >
      {[1, 2, 3, 4, 5, 6, 7].map((day) => (
        <span key={day} className="month-grid__weekday" role="columnheader">
          {formatWeekdayShort(day as 1)}
        </span>
      ))}
      {days.map((date) => {
        const checked = checks.has(date);
        const outside = startOfMonth(date) !== month;
        const future = date > today;
        const scheduled = isScheduled(habit, date);
        const vacation = marks.vacation.has(date);
        // A frozen week / month shows its ice icon on its last day (SPEC §13.9).
        const frozen = dayBased
          ? scheduled && marks.frozen.has(date)
          : habit.frequency === 'per_week'
            ? date === addDays(mondayOf(date), 6) && marks.frozen.has(mondayOf(date))
            : date === endOfMonth(date) && marks.frozen.has(startOfMonth(date));
        const missed =
          dayBased &&
          scheduled &&
          !checked &&
          !frozen &&
          !vacation &&
          date < today &&
          date >= startedOn &&
          !outside;
        const classes = [
          'month-grid__day',
          outside && 'is-outside',
          checked && 'is-checked',
          missed && 'is-missed',
          !scheduled && 'is-rest',
          frozen && !outside && 'is-frozen',
          vacation && !outside && 'is-vacation',
          date === today && 'is-today',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={date}
            type="button"
            className={classes}
            aria-pressed={checked}
            aria-label={`${formatShortDate(date)}${checked ? ', done' : missed ? ', missed' : ''}${
              frozen ? ', frozen' : ''
            }${vacation ? ', vacation' : ''}`}
            disabled={future || outside || !canEdit || habit.archived}
            onClick={() => onToggle(date, !checked)}
          >
            {Number(date.slice(8))}
            {!outside && (frozen || vacation) && (
              <span className="month-grid__mark" aria-hidden="true">
                {frozen ? <Snowflake size={10} /> : <TreePalm size={10} />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** One habit: streaks, completion rate and a calendar of checks (SPEC §7). */
export function HabitDetailScreen({ id }: { id: string }) {
  const { today, timeZone, canEdit } = useApp();
  const { data: habits } = useHabits();
  const { update, remove, setCheck } = useHabitMutations();
  const vacationDays = useVacationDays();
  const { navigate } = useRouter();
  const [month, setMonth] = useState(startOfMonth(today));
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const habit = habits?.find((h) => h.id === id);

  if (!habits) return null;
  if (!habit) {
    return (
      <>
        <ScreenHeader title="Habit" back="/habits" />
        <p className="empty">This habit no longer exists.</p>
      </>
    );
  }

  const checks = new Set(habit.checks);
  // The habit counts as started at its creation, or at its earliest tick if back-filled before.
  const createdOn = dateInZone(new Date(habit.createdAt), timeZone);
  const startedOn = habit.checks[0] && habit.checks[0] < createdOn ? habit.checks[0] : createdOn;
  const marks = marksOf(habit, vacationDays);
  const current = currentStreak(habit, checks, today, marks);
  const best = bestStreak(habit, checks, today, marks);
  const rate = completionRate(habit, checks, today, startedOn, marks);
  const progress = habitProgress(habit, checks, today, marks);
  const thisMonth = startOfMonth(today);

  return (
    <>
      <ScreenHeader
        title={habit.name}
        back="/habits"
        actions={
          <>
            <button
              type="button"
              className="button"
              disabled={!canEdit}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="button"
              disabled={!canEdit}
              onClick={() =>
                update.mutate({ id: habit.id, changes: { archived: !habit.archived } })
              }
            >
              {habit.archived ? 'Restore' : 'Archive'}
            </button>
            {habit.archived && (
              <button
                type="button"
                className="button"
                disabled={!canEdit}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
          </>
        }
      />

      <dl className="habit-facts">
        <dt>How often</dt>
        <dd>
          {describeFrequency(habit)}
          {progress && (
            <span className="muted">
              {progress.done}/{progress.target} {progress.label}
            </span>
          )}
        </dd>
        <dt>Current streak</dt>
        <dd className={current > 0 ? 'habit-streak' : undefined}>
          {formatStreak(current, habit.frequency)}
        </dd>
        <dt>Best streak</dt>
        <dd className="mono-figures">{formatStreak(best, habit.frequency)}</dd>
        {habit.armedFreezes > 0 && (
          <>
            <dt>Freezes</dt>
            <dd>
              <Snowflake size={14} aria-hidden="true" className="muted" />
              {habit.armedFreezes} armed
            </dd>
          </>
        )}
        <dt>Completion</dt>
        <dd>
          {rate.rate === null ? (
            <span className="muted">Not enough data yet</span>
          ) : (
            <>
              <span className="mono-figures">{Math.round(rate.rate * 100)}%</span>
              <span className="muted">
                {rate.met} of {rate.total}, {rate.window}
              </span>
            </>
          )}
        </dd>
      </dl>

      <section className="section">
        <div className="month-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="month-nav__title">{formatMonthTitle(month)}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Next month"
            disabled={month >= thisMonth}
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <MonthGrid
          habit={habit}
          checks={checks}
          month={month}
          startedOn={startedOn}
          marks={marks}
          onToggle={(date, checked) => setCheck.mutate({ id: habit.id, date, checked })}
        />
        <p className="muted month-legend">
          Tap a day to tick or untick it.
          {(habit.frozen.length > 0 || vacationDays.length > 0) && (
            <>
              {' '}
              <Snowflake size={12} aria-hidden="true" /> streak freeze ·{' '}
              <TreePalm size={12} aria-hidden="true" /> vacation day
            </>
          )}
        </p>
      </section>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit habit" hideTitle>
        {editing && <HabitForm habit={habit} onClose={() => setEditing(false)} />}
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this habit?"
        message={`“${habit.name}” and all its ticks will be deleted permanently.`}
        confirmLabel="Delete"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove.mutate(habit.id);
          navigate('/habits');
        }}
      />
    </>
  );
}
