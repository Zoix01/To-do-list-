import { currentStreak, formatStreak, habitProgress, isScheduled } from '../../../shared/habits';
import type { HabitWithChecks } from '../../../shared/types';
import { Checkbox } from '../../components/controls';
import { useApp } from '../../lib/appContext';
import { useHabitMutations } from '../../lib/queries';
import { useRouter } from '../../lib/router';

/** One habit with today's tick, its streak and (per week / month) progress. */
export function HabitRow({ habit }: { habit: HabitWithChecks }) {
  const { today, canEdit } = useApp();
  const { navigate } = useRouter();
  const { setCheck } = useHabitMutations();
  const checks = new Set(habit.checks);
  const checked = checks.has(today);
  const streak = currentStreak(habit, checks, today);
  const progress = habitProgress(habit, checks, today);
  const restDay = habit.frequency === 'weekdays' && !isScheduled(habit, today);

  return (
    <li className={habit.archived ? 'task-row is-paused' : 'task-row'}>
      <Checkbox
        checked={checked}
        color={habit.color}
        label={checked ? `Untick “${habit.name}” for today` : `Tick “${habit.name}” for today`}
        disabled={!canEdit || habit.archived}
        onChange={() => setCheck.mutate({ id: habit.id, date: today, checked: !checked })}
      />
      <button
        type="button"
        className="task-row__main"
        onClick={() => navigate(`/habits/${habit.id}`)}
      >
        <span className="task-row__title">{habit.name}</span>
        <span className="task-row__meta">
          {progress && (
            <span>
              <span className="mono">
                {progress.done}/{progress.target}
              </span>{' '}
              {progress.label}
            </span>
          )}
          {restDay && <span>not today</span>}
          <span className={streak > 0 ? 'habit-streak' : undefined}>
            {streak > 0 ? formatStreak(streak, habit.frequency) : 'no streak yet'}
          </span>
        </span>
      </button>
    </li>
  );
}
