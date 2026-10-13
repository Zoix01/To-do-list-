import { Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IMPORTANCE_DEFAULT, WEEKLY_BUDGET, type Importance } from '../../../shared/economy';
import type { HabitIcon, TickAnimation } from '../../../shared/cosmetics';
import { normalizeHabitRules } from '../../../shared/habits';
import {
  LIST_COLORS,
  type Habit,
  type HabitFrequency,
  type ListColor,
  type Weekday,
} from '../../../shared/types';
import { ColorPicker } from '../../components/ColorPicker';
import { Segmented, WeekdayPicker } from '../../components/pickers';
import { HabitIconPicker } from '../../components/HabitIconPicker';
import { HabitAnimationPicker } from './HabitAnimationPicker';
import { ImportanceField } from '../../components/ImportanceField';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { useHabitMutations, useHabits, useRecurring, useRewards } from '../../lib/queries';
import { formatCoins, nextWeekValue } from '../../lib/rewards';

const FREQUENCY_OPTIONS: { value: HabitFrequency; content: string }[] = [
  { value: 'daily', content: 'Daily' },
  { value: 'weekdays', content: 'Set days' },
  { value: 'per_week', content: 'Per week' },
  { value: 'per_month', content: 'Per month' },
];

/** Create / edit a habit (SPEC §7). */
export function HabitForm({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const { canEdit } = useApp();
  const { data: habits } = useHabits();
  const { create, update } = useHabitMutations();
  const unusedColor = LIST_COLORS.find((color) => !habits?.some((h) => h.color === color));
  const [name, setName] = useState(habit?.name ?? '');
  const [color, setColor] = useState<ListColor>(habit?.color ?? unusedColor ?? LIST_COLORS[0]);
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>(habit?.weekdays ?? []);
  const [target, setTarget] = useState<number>(habit?.target ?? 3);
  const [importance, setImportance] = useState<Importance>(habit?.importance ?? IMPORTANCE_DEFAULT);
  const [icon, setIcon] = useState<string | null>(habit?.icon ?? null);
  const [tickAnimation, setTickAnimation] = useState<string | null>(habit?.tickAnimation ?? null);
  const { data: templates } = useRecurring();
  const { data: rewards } = useRewards();
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const maxTarget = frequency === 'per_month' ? 31 : 7;
  const hintRules = normalizeHabitRules({
    frequency,
    weekdays,
    target: Math.min(target, maxTarget),
  });
  const hint =
    hintRules.ok && habits && templates
      ? `≈ ${formatCoins(
          nextWeekValue(
            { type: 'habit', id: habit?.id ?? 'new', importance, rules: hintRules.rules },
            habits,
            templates,
            rewards?.nextBudget ?? WEEKLY_BUDGET,
          ),
        )} coins per tick from Monday`
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Add a name');
    const normalized = normalizeHabitRules({
      frequency,
      weekdays,
      target: Math.min(target, maxTarget),
    });
    if (!normalized.ok) return setError(normalized.error);
    setError(null);
    const fields = {
      name: name.trim(),
      color,
      importance,
      icon: icon as HabitIcon | null,
      tickAnimation: tickAnimation as TickAnimation | null,
      ...normalized.rules,
    };
    try {
      if (habit) await update.mutateAsync({ id: habit.id, changes: fields });
      else await create.mutateAsync(fields);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <div className="habit-form__name">
        <ColorPicker value={color} onChange={setColor} disabled={!canEdit} label="Habit color" />
        <input
          className="task-form__title"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Habit name"
          aria-label="Habit name"
          autoFocus={!habit}
          maxLength={100}
          disabled={!canEdit}
        />
      </div>

      <div className="field-grid">
        <span className="field-grid__label">How often</span>
        <div className="field-grid__value">
          <Segmented
            label="How often"
            value={frequency}
            onChange={setFrequency}
            options={FREQUENCY_OPTIONS}
            disabled={!canEdit}
          />
        </div>

        {frequency === 'weekdays' && (
          <>
            <span className="field-grid__label">Days</span>
            <div className="field-grid__value">
              <WeekdayPicker value={weekdays} onChange={setWeekdays} multiple disabled={!canEdit} />
            </div>
          </>
        )}

        {(frequency === 'per_week' || frequency === 'per_month') && (
          <>
            <span className="field-grid__label">Times</span>
            <div className="field-grid__value">
              <div className="stepper" role="group" aria-label="Times">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fewer"
                  disabled={!canEdit || target <= 1}
                  onClick={() => setTarget(Math.max(1, Math.min(target, maxTarget) - 1))}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="stepper__value mono" aria-live="polite">
                  {Math.min(target, maxTarget)}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="More"
                  disabled={!canEdit || target >= maxTarget}
                  onClick={() => setTarget(Math.min(maxTarget, target + 1))}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              <span className="muted">
                {frequency === 'per_week' ? 'times a week' : 'times a month'}
              </span>
            </div>
          </>
        )}

        <ImportanceField
          value={importance}
          onChange={setImportance}
          hint={hint}
          disabled={!canEdit}
        />

        <span className="field-grid__label">Icon</span>
        <div className="field-grid__value">
          <HabitIconPicker value={icon} onChange={setIcon} disabled={!canEdit} />
        </div>

        <span className="field-grid__label">Animation</span>
        <div className="field-grid__value">
          <HabitAnimationPicker
            value={tickAnimation}
            onChange={setTickAnimation}
            disabled={!canEdit}
          />
        </div>
      </div>

      {!canEdit && <p className="muted">Offline — changes are disabled until you reconnect</p>}
      {error && <p className="field-error">{error}</p>}

      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!canEdit || pending}>
          {habit ? 'Save' : 'Add habit'}
        </button>
      </div>
    </form>
  );
}
