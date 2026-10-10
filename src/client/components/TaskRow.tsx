import { ArrowDown, ArrowUp, Trash2, TriangleAlert } from 'lucide-react';
import { deadlineLabel, isPlannedAfterDeadline, taskFlag } from '../../shared/tasks';
import type { Task } from '../../shared/types';
import { useApp } from '../lib/appContext';
import { useTaskMutations } from '../lib/queries';
import { ColorDot, Checkbox } from './controls';
import { useTaskForm } from './TaskFormProvider';

function PriorityMarker({ priority }: { priority: Task['priority'] }) {
  if (priority === 'high') {
    return (
      <span className="task-row__priority task-row__priority--high" title="High priority">
        <ArrowUp size={14} aria-hidden="true" />
        <span className="visually-hidden">High priority</span>
      </span>
    );
  }
  if (priority === 'low') {
    return (
      <span className="task-row__priority" title="Low priority">
        <ArrowDown size={14} aria-hidden="true" />
        <span className="visually-hidden">Low priority</span>
      </span>
    );
  }
  return null;
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
        label={`Complete “${task.title}”`}
        onChange={() => onComplete(task)}
        disabled={!canEdit}
      />
      <button type="button" className="task-row__main" onClick={() => openEdit(task)}>
        <span className="task-row__title">{task.title}</span>
        <span className="task-row__meta">
          <PriorityMarker priority={task.priority} />
          {isPlannedAfterDeadline(task) && (
            <span className="task-row__warning" title="Planned after deadline">
              <TriangleAlert size={14} aria-hidden="true" />
              <span className="visually-hidden">Planned after deadline</span>
            </span>
          )}
          <span
            className={flag === 'overdue' ? 'task-row__deadline is-overdue' : 'task-row__deadline'}
          >
            {deadlineLabel(task.deadline, today)}
          </span>
          {flag === 'overdue' && <span className="flag flag--overdue">Overdue</span>}
          {flag === 'missed_plan' && <span className="flag flag--missed">Missed plan</span>}
          <span title={list?.name ?? 'No list'}>
            <ColorDot color={list?.color ?? null} />
          </span>
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
  onDelete: () => void;
}) {
  const { listsById, canEdit } = useApp();
  const list = task.listId ? listsById.get(task.listId) : undefined;
  return (
    <li className="task-row task-row--completed">
      <Checkbox
        checked
        label={`Restore “${task.title}”`}
        onChange={onRestore}
        disabled={!canEdit}
      />
      <span className="task-row__main task-row__main--static">
        <span className="task-row__title">{task.title}</span>
        <span className="task-row__meta">
          <span title={list?.name ?? 'No list'}>
            <ColorDot color={list?.color ?? null} />
          </span>
        </span>
      </span>
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
    </li>
  );
}
