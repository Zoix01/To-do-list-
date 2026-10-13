import { Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { WEIGHT_DEFAULT, WEEKLY_BUDGET } from '../../../shared/economy';
import { MAX_TIMES_PER_MONTH, normalizeSchedule } from '../../../shared/recurrence';
import { templateRules } from '../../../shared/rewards';
import type { RecurringUpdateInput } from '../../../shared/schemas';
import type {
  Priority,
  RecurringMode,
  RecurringPeriod,
  RecurringTask,
  Weekday,
} from '../../../shared/types';
import { ConfirmDialog } from '../../components/Dialog';
import {
  ListPicker,
  MonthDayPicker,
  PriorityPicker,
  Segmented,
  WeekdayPicker,
} from '../../components/pickers';
import { WeightField } from '../../components/WeightField';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { useHabits, useRecurring, useRecurringMutations, useRewards } from '../../lib/queries';
import { formatCoins, nextWeekValue } from '../../lib/rewards';

const EXPLANATION: Record<RecurringPeriod, Record<RecurringMode, string>> = {
  week: {
    fixed: 'Each week a task is created for that day, planned on it.',
    flexible:
      'Each week a task is created with Sunday as the deadline, unplanned until you drag it onto a day.',
  },
  month: {
    fixed:
      'Each month a task is created for every chosen day, planned on it. 29–31 mean the last day in shorter months.',
    flexible:
      'Each month the tasks are created unplanned, with deadlines spread over the month (2× → the 15th and the last day).',
  },
};

/** Create / edit a recurring (weekly or monthly) task template (SPEC §6, §8.5). */
export function RecurringForm({
  template,
  onClose,
}: {
  template?: RecurringTask;
  onClose: () => void;
}) {
  const { canEdit } = useApp();
  const { create, update, remove } = useRecurringMutations();
  const [title, setTitle] = useState(template?.title ?? '');
  const [notes, setNotes] = useState(template?.notes ?? '');
  const [period, setPeriod] = useState<RecurringPeriod>(template?.period ?? 'week');
  const [mode, setMode] = useState<RecurringMode>(template?.mode ?? 'fixed');
  const [weekday, setWeekday] = useState<Weekday | null>(template?.weekday ?? null);
  const [monthDays, setMonthDays] = useState<number[]>(template?.monthDays ?? []);
  const [times, setTimes] = useState<number>(template?.timesPerMonth ?? 2);
  const [priority, setPriority] = useState<Priority>(template?.priority ?? 'medium');
  const [listId, setListId] = useState<string | null>(template?.listId ?? null);
  const [weight, setWeight] = useState<number>(template?.weight ?? WEIGHT_DEFAULT);
  const { data: habits } = useHabits();
  const { data: templates } = useRecurring();
  const { data: rewards } = useRewards();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = create.isPending || update.isPending;

  const schedule = normalizeSchedule({ period, mode, weekday, monthDays, timesPerMonth: times });
  const hint =
    habits && templates
      ? `≈ ${formatCoins(
          nextWeekValue(
            {
              type: 'weekly',
              id: template?.id ?? 'new',
              weight,
              rules: schedule.ok ? templateRules(schedule.schedule) : null,
            },
            habits,
            templates,
            rewards?.nextBudget ?? WEEKLY_BUDGET,
          ),
        )} coins per task from Monday`
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setError('Add a title');
    if (!schedule.ok) return setError(schedule.error);
    setError(null);
    const fields = {
      title: title.trim(),
      notes: notes.trim() ? notes : null,
      ...schedule.schedule,
      priority,
      listId,
      weight,
    };
    try {
      if (template) {
        const changes: RecurringUpdateInput = fields;
        await update.mutateAsync({ id: template.id, changes });
      } else {
        await create.mutateAsync(fields);
      }
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <input
        className="task-form__title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Recurring task name"
        aria-label="Recurring task name"
        autoFocus={!template}
        maxLength={500}
        disabled={!canEdit}
      />
      <textarea
        className="task-form__notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
        aria-label="Notes"
        rows={2}
        disabled={!canEdit}
      />

      <div className="field-grid">
        <span className="field-grid__label">Repeats</span>
        <div className="field-grid__value">
          <Segmented
            label="Repeats"
            value={period}
            onChange={setPeriod}
            disabled={!canEdit}
            options={[
              { value: 'week', content: 'Weekly' },
              { value: 'month', content: 'Monthly' },
            ]}
          />
        </div>

        <span className="field-grid__label">When</span>
        <div className="field-grid__value">
          <Segmented
            label="When"
            value={mode}
            onChange={setMode}
            disabled={!canEdit}
            options={
              period === 'week'
                ? [
                    { value: 'fixed', content: 'On a set day' },
                    { value: 'flexible', content: 'Any day of the week' },
                  ]
                : [
                    { value: 'fixed', content: 'On set days' },
                    { value: 'flexible', content: 'Times a month' },
                  ]
            }
          />
        </div>

        {period === 'week' && mode === 'fixed' && (
          <>
            <span className="field-grid__label">Day</span>
            <div className="field-grid__value">
              <WeekdayPicker
                value={weekday ? [weekday] : []}
                onChange={(days) => setWeekday(days[0] ?? null)}
                disabled={!canEdit}
              />
            </div>
          </>
        )}

        {period === 'month' && mode === 'fixed' && (
          <>
            <span className="field-grid__label">Days</span>
            <div className="field-grid__value">
              <MonthDayPicker value={monthDays} onChange={setMonthDays} disabled={!canEdit} />
            </div>
          </>
        )}

        {period === 'month' && mode === 'flexible' && (
          <>
            <span className="field-grid__label">Times</span>
            <div className="field-grid__value">
              <div className="stepper" role="group" aria-label="Times a month">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fewer"
                  disabled={!canEdit || times <= 1}
                  onClick={() => setTimes(times - 1)}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="stepper__value mono" aria-live="polite">
                  {times}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="More"
                  disabled={!canEdit || times >= MAX_TIMES_PER_MONTH}
                  onClick={() => setTimes(times + 1)}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              <span className="muted">times a month</span>
            </div>
          </>
        )}

        <span className="field-grid__label">Priority</span>
        <div className="field-grid__value">
          <PriorityPicker value={priority} onChange={setPriority} disabled={!canEdit} />
        </div>

        <span className="field-grid__label">List</span>
        <div className="field-grid__value">
          <ListPicker value={listId} onChange={setListId} disabled={!canEdit} />
        </div>

        <WeightField value={weight} onChange={setWeight} hint={hint} disabled={!canEdit} />
      </div>

      <p className="muted">
        {EXPLANATION[period][mode]}
        {template && ' Changes apply to the coming weeks; tasks already created stay as they are.'}
      </p>
      {!canEdit && <p className="muted">Offline — changes are disabled until you reconnect</p>}
      {error && <p className="field-error">{error}</p>}

      <div className="dialog__actions">
        {template && (
          <button
            type="button"
            className="button button--quiet-danger dialog__actions-start"
            onClick={() => setConfirmDelete(true)}
            disabled={!canEdit}
          >
            Delete
          </button>
        )}
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!canEdit || pending}>
          {template ? 'Save' : 'Add recurring task'}
        </button>
      </div>

      {template && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this recurring task?"
          message={`No new “${template.title}” tasks will be created. Tasks already created stay.`}
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            remove.mutate(template.id);
            onClose();
          }}
        />
      )}
    </form>
  );
}
