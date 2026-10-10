import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { addDays, formatShortDate } from '../../shared/dates';
import { groupCompleted } from '../../shared/tasks';
import type { ISODate, Task } from '../../shared/types';
import { ScreenHeader } from '../components/AppShell';
import { ConfirmDialog } from '../components/Dialog';
import { ListFilterMenu, useListFilter } from '../components/ListFilter';
import { CompletedRow } from '../components/TaskRow';
import { useApp } from '../lib/appContext';
import { useCompletedTasks, useTaskMutations } from '../lib/queries';

function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return formatShortDate(date);
}

export function CompletedScreen() {
  const { today, timeZone, canEdit } = useApp();
  const { data: tasks } = useCompletedTasks();
  const { uncomplete, remove, removeCompleted } = useTaskMutations();
  const { filter, setFilter, matches } = useListFilter('completed.filter');
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const shown = (tasks ?? []).filter(matches);
  const groups = groupCompleted(shown, timeZone);
  const count = shown.length;
  const filtered = filter.length > 0;

  return (
    <>
      <ScreenHeader
        title="Completed"
        actions={
          <>
            <ListFilterMenu filter={filter} setFilter={setFilter} />
            <button
              type="button"
              className="button"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={!canEdit || count === 0}
            >
              <Trash2 size={14} aria-hidden="true" />
              {filtered ? 'Delete shown' : 'Delete all'}
            </button>
          </>
        }
      />
      {tasks && groups.length === 0 && (
        <p className="empty">
          {filtered ? 'No completed tasks in this filter' : 'No completed tasks'}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.date} className="section">
          <h2 className="section__title">
            {dayLabel(group.date, today)}
            <span className="section__count">{group.tasks.length}</span>
          </h2>
          <ul className="task-list">
            {group.tasks.map((task) => (
              <CompletedRow
                key={task.id}
                task={task}
                onRestore={() => uncomplete.mutate(task.id)}
                onDelete={() => setToDelete(task)}
              />
            ))}
          </ul>
        </section>
      ))}
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this task?"
        message={toDelete ? `“${toDelete.title}” will be deleted permanently.` : undefined}
        confirmLabel="Delete"
        danger
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
      <ConfirmDialog
        open={confirmDeleteAll}
        title={
          filtered
            ? `Delete the ${count} completed ${count === 1 ? 'task' : 'tasks'} shown?`
            : `Delete all ${count} completed ${count === 1 ? 'task' : 'tasks'}?`
        }
        message="They will be deleted permanently. This can’t be undone."
        confirmLabel="Delete"
        danger
        onClose={() => setConfirmDeleteAll(false)}
        onConfirm={() => removeCompleted.mutate(shown.map((task) => task.id))}
      />
    </>
  );
}
