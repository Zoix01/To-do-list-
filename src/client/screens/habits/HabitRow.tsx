import { useEffect, useState, type CSSProperties } from 'react';
import {
  currentStreak,
  formatStreak,
  habitProgress,
  isScheduled,
  marksOf,
} from '../../../shared/habits';
import type { HabitWithChecks } from '../../../shared/types';
import { Checkbox } from '../../components/controls';
import { useApp } from '../../lib/appContext';
import { useHabitMutations, useRewards, useVacationDays } from '../../lib/queries';
import { celebrationLines, formatCoins } from '../../lib/rewards';
import { useRouter } from '../../lib/router';

interface Burst {
  id: number;
  coins: number;
  /** Milestones and level-ups: the bigger celebration (SPEC §13.11). */
  lines: string[];
}

/** One habit with today's tick, its streak, (per week / month) progress and what a tick earns. */
export function HabitRow({ habit }: { habit: HabitWithChecks }) {
  const { today, canEdit } = useApp();
  const { navigate } = useRouter();
  const { setCheck } = useHabitMutations();
  const { data: rewards } = useRewards();
  const [popping, setPopping] = useState(false);
  const [burst, setBurst] = useState<Burst | null>(null);
  const checks = new Set(habit.checks);
  const checked = checks.has(today);
  const vacationDays = useVacationDays();
  const marks = marksOf(habit, vacationDays);
  const streak = currentStreak(habit, checks, today, marks);
  const progress = habitProgress(habit, checks, today, marks);
  const onVacation = marks.vacation.has(today);
  const restDay = habit.frequency === 'weekdays' && !isScheduled(habit, today);
  const info = rewards?.started && !habit.archived ? rewards.habits[habit.id] : undefined;
  const celebrating = Boolean(burst?.lines.length);

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), burst.lines.length ? 3200 : 1200);
    return () => window.clearTimeout(timer);
  }, [burst]);

  function toggle() {
    const next = !checked;
    if (next) setPopping(true);
    setCheck.mutate(
      { id: habit.id, date: today, checked: next },
      {
        onSuccess: (reward) => {
          if (!reward) return;
          const lines = celebrationLines(reward, habit.frequency);
          if (reward.coins > 0 || lines.length > 0) {
            setBurst({ id: Date.now(), coins: reward.coins, lines });
          }
        },
      },
    );
  }

  return (
    <li className={habit.archived ? 'task-row is-paused' : 'task-row'}>
      <span
        className={['habit-tick', popping && 'is-popping', celebrating && 'is-celebrating']
          .filter(Boolean)
          .join(' ')}
        style={{ '--habit-color': habit.color } as CSSProperties}
        onAnimationEnd={(event) => {
          // The pop, or its reduced-motion fade, has finished.
          if (event.animationName === 'habit-pop' || event.animationName === 'reward-fade') {
            setPopping(false);
          }
        }}
      >
        <Checkbox
          checked={checked}
          color={habit.color}
          label={checked ? `Untick “${habit.name}” for today` : `Tick “${habit.name}” for today`}
          disabled={!canEdit || habit.archived}
          onChange={toggle}
        />
        {burst && burst.coins > 0 && (
          <span key={burst.id} className="reward-float" aria-hidden="true">
            +{formatCoins(burst.coins)}
          </span>
        )}
      </span>
      <button
        type="button"
        className="task-row__main"
        onClick={() => navigate(`/habits/${habit.id}`)}
      >
        <span className="task-row__title">{habit.name}</span>
        <span className="task-row__meta">
          {burst && celebrating && (
            <span key={burst.id} className="habit-celebration" role="status">
              {burst.lines.join(' · ')}
            </span>
          )}
          {progress && (
            <span>
              <span className="mono">
                {progress.done}/{progress.target}
              </span>{' '}
              {progress.label}
            </span>
          )}
          {onVacation ? <span>vacation day</span> : restDay && <span>not today</span>}
          {info && !info.inSnapshot && <span>Earns from Mon</span>}
          {info?.nextTick && (
            <span className="mono-figures" title="Coins for a tick today">
              +{formatCoins(info.nextTick.coins)}
              {info.nextTick.multiplier > 1 && <> · ×{info.nextTick.multiplier}</>}
            </span>
          )}
          <span
            key={streak}
            className={[streak > 0 && 'habit-streak', popping && checked && 'is-bumping']
              .filter(Boolean)
              .join(' ')}
          >
            {streak > 0 ? formatStreak(streak, habit.frequency) : 'no streak yet'}
          </span>
        </span>
      </button>
    </li>
  );
}
