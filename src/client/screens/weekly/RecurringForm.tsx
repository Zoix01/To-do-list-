import { useState, type FormEvent } from 'react';
import type { RecurringUpdateInput } from '../../../shared/schemas';
import type { Priority, RecurringMode, RecurringTask, Weekday } from '../../../shared/types';
import { ConfirmDialog } from '../../components/Dialog';
import { ListPicker, PriorityPicker, Segmented, WeekdayPicker } from '../../components/pickers';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { useRecurringMutations } from '../../lib/queries';

/** Create / edit a weekly task template (SPEC §6, §8.5). */
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
  const [mode, setMode] = useState<RecurringMode>(template?.mode ?? 'fixed');
  const [weekday, setWeekday] = useState<Weekday | null>(template?.weekday ?? null);
  const [priority, setPriority] = useState<Priority>(template?.priority ?? 'medium');
  const [listId, setListId] = useState<string | null>(template?.listId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = create.isPending || update.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setError('Add a title');
    if (mode === 'fixed' && !weekday) return setError('Choose a day');
    setError(null);
    const fields = {
      title: title.trim(),
      notes: notes.trim() ? notes : null,
      mode,
      weekday: mode === 'fixed' ? weekday : null,
      priority,
      listId,
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
        placeholder="Weekly task name"
        aria-label="Weekly task name"
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
            value={mode}
            onChange={setMode}
            disabled={!canEdit}
            options={[
              { value: 'fixed', content: 'On a set day' },
              { value: 'flexible', content: 'Any day of the week' },
            ]}
          />
        </div>

        {mode === 'fixed' && (
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

        <span className="field-grid__label">Priority</span>
        <div className="field-grid__value">
          <PriorityPicker value={priority} onChange={setPriority} disabled={!canEdit} />
        </div>

        <span className="field-grid__label">List</span>
        <div className="field-grid__value">
          <ListPicker value={listId} onChange={setListId} disabled={!canEdit} />
        </div>
      </div>

      <p className="muted">
        {mode === 'fixed'
          ? 'Each week a task is created for that day, planned on it.'
          : 'Each week a task is created with Sunday as the deadline, unplanned until you drag it onto a day.'}
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
          {template ? 'Save' : 'Add weekly task'}
        </button>
      </div>

      {template && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this weekly task?"
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
