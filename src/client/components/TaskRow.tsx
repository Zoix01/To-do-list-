import { Trash2, TriangleAlert } from 'lucide-react';
import { deadlineLabel, isPlannedAfterDeadline, taskFlag } from '../../shared/tasks';
import type { Priority, Task } from '../../shared/types';
import { useApp } from '../lib/appContext';
import { useTaskMutations } from '../lib/queries';
import { Checkbox } from './controls';
import { useTaskForm } from './TaskFormProvider';

/** Priorities are shown as numbers: 0 low, 1 medium, 2 high. */
export const PRIORITY_NUMBER: Record<Priority, number> = { low: 0, medium: 1, high: 2 };
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function PriorityTag({ priority }: { priority: Priority }) {
  const label = `${PRIORITY_LABELS[priority]} priority`;
  return (
    <span className={`priority priority--${priority}`} title={label}>
      <span aria-hidden="true">{PRIORITY_NUMBER[priority]}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function titleClass(priority: Priority): string {
  return priority === 'high' ? 'task-row__title task-row__title--high' : 'task-row__title';
}

function TaskRow({ task, onComplete }: { task: Task; onComplete: (task: Task) => void }) {
  const { today, listsById, canEdit } = useApp();
  const { openEdit } = useTaskForm();
  const flag = taskFlag(task, today);
  const list = task.listId ? listsById.get(task.listId) : undefined;
  return (
    <li className="task-row">
      <Checkbox
        checked={false}
        color={list?.color ?? null}
        label={`Complete “${task.title}”${list ? ` (${list.name})` : ''}`}
        onChange={() => onComplete(task)}
        disabled={!canEdit}
      />
      <button type="button" className="task-row__main" onClick={() => openEdit(task)}>
        <span className={titleClass(task.priority)}>{task.title}</span>
        <span className="task-row__meta">
          <PriorityTag priority={task.priority} />
          <span
            className={flag === 'overdue' ? 'task-row__deadline is-overdue' : 'task-row__deadline'}
          >
            {deadlineLabel(task.deadline, today)}
          </span>
          {flag === 'overdue' && <span className="flag flag--overdue">Overdue</span>}
          {flag === 'missed_plan' && <span className="flag flag--missed">Missed plan</span>}
          {isPlannedAfterDeadline(task) && (
            <span className="task-row__warning" title="Planned after deadline">
              <TriangleAlert size={14} aria-hidden="true" />
              <span className="visually-hidden">Planned after deadline</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  const { complete } = useTaskMutations();
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onComplete={(t) => complete.mutate(t)} />
      ))}
    </ul>
  );
}

export function CompletedRow({
  task,
  onRestore,
  onDelete,
}: {
  task: Task;
  onRestore: () => void;
  /** Omit to hide the delete button. */
  onDelete?: () => void;
}) {
  const { listsById, canEdit } = useApp();
  const list = task.listId ? listsById.get(task.listId) : undefined;
  return (
    <li className="task-row task-row--completed">
      <Checkbox
        checked
        color={list?.color ?? null}
        label={`Restore “${task.title}”${list ? ` (${list.name})` : ''}`}
        onChange={onRestore}
        disabled={!canEdit}
      />
      <span className="task-row__main task-row__main--static">
        <span className="task-row__title">{task.title}</span>
        {list && <span className="task-row__meta">{list.name}</span>}
      </span>
      {onDelete && (
        <button
          type="button"
          className="icon-button"
          aria-label={`Delete “${task.title}” permanently`}
          title="Delete permanently"
          onClick={onDelete}
          disabled={!canEdit}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
