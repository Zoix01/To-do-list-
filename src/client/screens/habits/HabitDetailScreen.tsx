import { ChevronLeft, ChevronRight } from 'lucide-react';
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
} from '../../../shared/habits';
import type { HabitWithChecks, ISODate } from '../../../shared/types';
import { ScreenHeader } from '../../components/AppShell';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { useApp } from '../../lib/appContext';
import { useHabitMutations, useHabits } from '../../lib/queries';
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
  onToggle,
}: {
  habit: HabitWithChecks;
  checks: ReadonlySet<ISODate>;
  month: ISODate;
  startedOn: ISODate;
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
        const missed =
          dayBased && scheduled && !checked && date < today && date >= startedOn && !outside;
        const classes = [
          'month-grid__day',
          outside && 'is-outside',
          checked && 'is-checked',
          missed && 'is-missed',
          !scheduled && 'is-rest',
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
            aria-label={`${formatShortDate(date)}${checked ? ', done' : missed ? ', missed' : ''}`}
            disabled={future || outside || !canEdit || habit.archived}
            onClick={() => onToggle(date, !checked)}
          >
            {Number(date.slice(8))}
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
  const startedOn = dateInZone(new Date(habit.createdAt), timeZone);
  const current = currentStreak(habit, checks, today);
  const best = bestStreak(habit, checks, today);
  const rate = completionRate(habit, checks, today, startedOn);
  const progress = habitProgress(habit, checks, today);
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
          onToggle={(date, checked) => setCheck.mutate({ id: habit.id, date, checked })}
        />
        <p className="muted month-legend">Tap a day to tick or untick it.</p>
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
