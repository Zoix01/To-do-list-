import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { TaskUpdateInput } from '../../shared/schemas';
import { deadlineError, defaultPlannedDate } from '../../shared/tasks';
import { PRIORITIES, type ISODate, type Priority, type Task } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';
import { useTaskMutations } from '../lib/queries';
import { ColorDot, DateButton, Menu, MenuItem } from './controls';
import { ConfirmDialog } from './Dialog';
import type { NewTaskDefaults } from './TaskFormProvider';
import { PRIORITY_LABELS, PRIORITY_NUMBER } from './TaskRow';

export function TaskForm({
  task,
  defaults,
  onClose,
}: {
  task?: Task;
  defaults: NewTaskDefaults;
  onClose: () => void;
}) {
  const { today, lists, listsById, canEdit } = useApp();
  const { create, update, remove } = useTaskMutations();

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [listId, setListId] = useState<string | null>(task?.listId ?? defaults.listId ?? null);
  const [deadline, setDeadline] = useState<ISODate | null>(
    task?.deadline ?? defaults.deadline ?? null,
  );
  /** undefined = planned date not touched in this form. */
  const [plannedOverride, setPlannedOverride] = useState<ISODate | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // What the planned date will be after saving (mirrors the server rules, SPEC §5.1).
  const isAuto = plannedOverride === undefined && !task?.plannedManual;
  let plannedDate: ISODate | null;
  if (plannedOverride !== undefined) plannedDate = plannedOverride;
  else if (task && (task.plannedManual || deadline === task.deadline))
    plannedDate = task.plannedDate;
  else plannedDate = deadline ? defaultPlannedDate(deadline, today) : null;

  const deadlineProblem = deadline ? deadlineError(deadline, today, task?.deadline) : null;
  const pending = create.isPending || update.isPending;
  const list = listId ? listsById.get(listId) : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setError('Add a title');
    if (!deadline) return setError('Choose a deadline');
    if (deadlineProblem) return setError(deadlineProblem);
    setError(null);
    const planned = plannedOverride !== undefined ? { plannedDate: plannedOverride } : {};
    try {
      if (task) {
        const changes: TaskUpdateInput = { ...planned };
        if (title.trim() !== task.title) changes.title = title.trim();
        if ((notes.trim() || null) !== task.notes) changes.notes = notes.trim() ? notes : null;
        if (priority !== task.priority) changes.priority = priority;
        if (listId !== task.listId) changes.listId = listId;
        if (deadline !== task.deadline) changes.deadline = deadline;
        if (Object.keys(changes).length > 0) await update.mutateAsync({ id: task.id, changes });
      } else {
        await create.mutateAsync({
          title: title.trim(),
          notes: notes.trim() ? notes : null,
          priority,
          listId,
          deadline,
          ...planned,
        });
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
        placeholder="Task name"
        aria-label="Task name"
        autoFocus={!task}
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
        <span className="field-grid__label">Deadline</span>
        <div className="field-grid__value">
          <DateButton
            label="Deadline"
            value={deadline}
            onChange={setDeadline}
            placeholder="Choose deadline"
            min={today}
            disabled={!canEdit}
            emphasis
          />
          {deadlineProblem && <span className="field-error">{deadlineProblem}</span>}
        </div>

        <span className="field-grid__label">Planned</span>
        <div className="field-grid__value">
          <DateButton
            label="Planned date"
            value={plannedDate}
            onChange={setPlannedOverride}
            placeholder={deadline ? 'Not planned' : 'Set a deadline first'}
            disabled={!canEdit || !deadline}
          />
          {plannedDate && isAuto && <span className="muted">auto</span>}
          {plannedDate && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setPlannedOverride(null)}
              disabled={!canEdit}
            >
              Unplan
            </button>
          )}
          {plannedDate && deadline && plannedDate > deadline && (
            <span className="field-warning">
              <TriangleAlert size={14} aria-hidden="true" /> Planned after deadline
            </span>
          )}
        </div>

        <span className="field-grid__label">Priority</span>
        <div className="field-grid__value">
          <div className="segmented" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={priority === value}
                className="segmented__option"
                onClick={() => setPriority(value)}
                disabled={!canEdit}
              >
                <span className="segmented__number">{PRIORITY_NUMBER[value]}</span>
                {PRIORITY_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <span className="field-grid__label">List</span>
        <div className="field-grid__value">
          <Menu
            label="List"
            disabled={!canEdit}
            buttonContent={
              <>
                <ColorDot color={list?.color ?? null} />
                {list?.name ?? 'No list'}
                <ChevronDown size={14} aria-hidden="true" />
              </>
            }
          >
            {(close) => (
              <>
                {[null, ...lists].map((option) => (
                  <MenuItem
                    key={option?.id ?? 'none'}
                    selected={listId === (option?.id ?? null)}
                    onSelect={() => {
                      setListId(option?.id ?? null);
                      close();
                    }}
                  >
                    <ColorDot color={option?.color ?? null} />
                    {option?.name ?? 'No list'}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        </div>
      </div>

      {!canEdit && <p className="muted">Offline — changes are disabled until you reconnect</p>}
      {error && <p className="field-error">{error}</p>}

      <div className="dialog__actions">
        {task && (
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
          {task ? 'Save' : 'Add task'}
        </button>
      </div>

      {task && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this task?"
          message={`“${task.title}” will be deleted permanently.`}
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            remove.mutate(task.id);
            onClose();
          }}
        />
      )}
    </form>
  );
}
