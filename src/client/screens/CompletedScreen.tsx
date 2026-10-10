import { useMemo, useState } from 'react';
import { addDays, formatShortDate } from '../../shared/dates';
import { groupCompleted } from '../../shared/tasks';
import type { ISODate, Task } from '../../shared/types';
import { ScreenHeader } from '../components/AppShell';
import { ConfirmDialog } from '../components/Dialog';
import { CompletedRow } from '../components/TaskRow';
import { useApp } from '../lib/appContext';
import { useCompletedTasks, useTaskMutations } from '../lib/queries';

function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return formatShortDate(date);
}

export function CompletedScreen() {
  const { today, timeZone } = useApp();
  const { data: tasks } = useCompletedTasks();
  const { uncomplete, remove } = useTaskMutations();
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const groups = useMemo(() => groupCompleted(tasks ?? [], timeZone), [tasks, timeZone]);

  return (
    <>
      <ScreenHeader title="Completed" />
      {tasks && groups.length === 0 && <p className="empty">No completed tasks</p>}
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
    </>
  );
}
