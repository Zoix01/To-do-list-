import { Repeat, Trash2, TriangleAlert } from 'lucide-react';
import type { DOMAttributes, HTMLAttributes } from 'react';
import { deadlineLabel, isPlannedAfterDeadline, taskFlag } from '../../shared/tasks';
import type { List, Priority, Task } from '../../shared/types';
import { useApp } from '../lib/appContext';
import { useTaskMutations } from '../lib/queries';
import { Checkbox, ColorDot } from './controls';
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

/** Small repeat icon on tasks created by a weekly template (SPEC §6). */
export function WeeklyMark() {
  return (
    <span className="weekly-mark" title="Weekly task">
      <Repeat size={13} aria-hidden="true" />
      <span className="visually-hidden">Weekly task</span>
    </span>
  );
}

export function titleClass(priority: Priority): string {
  return priority === 'high' ? 'task-row__title task-row__title--high' : 'task-row__title';
}

/** In All tasks the circle shows priority instead of the list (SPEC §8.3). */
const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--danger)',
  medium: 'var(--warning)',
  low: 'var(--no-list)',
};

/** What the checkbox ring color means: the task's list, or its priority. */
export type RingColor = 'list' | 'priority';

/** Drag wiring from dnd-kit's useDraggable, for views that let rows be dragged. */
export interface RowDrag {
  setNodeRef: (element: HTMLElement | null) => void;
  attributes: HTMLAttributes<HTMLElement>;
  listeners: DOMAttributes<HTMLElement> | undefined;
  isDragging: boolean;
}

/** List color dot + name in the list color (All tasks, where the ring shows priority). */
function ListLabel({ list, className }: { list: List | undefined; className: string }) {
  return (
    <span
      className={`task-row__list ${className}`}
      style={list ? { color: list.color } : undefined}
      title={list?.name ?? 'No list'}
    >
      <ColorDot color={list?.color ?? null} />
      {list ? (
        <span className="task-row__list-name">{list.name}</span>
      ) : (
        <span className="visually-hidden">No list</span>
      )}
    </span>
  );
}

export function TaskRow({
  task,
  onComplete,
  ringColor,
  drag,
}: {
  task: Task;
  onComplete: (task: Task) => void;
  ringColor: RingColor;
  drag?: RowDrag;
}) {
  const { today, listsById, canEdit } = useApp();
  const { openEdit } = useTaskForm();
  const flag = taskFlag(task, today);
  const list = task.listId ? listsById.get(task.listId) : undefined;
  const classes = ['task-row', drag && 'task-row--draggable', drag?.isDragging && 'is-dragging']
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes} ref={drag?.setNodeRef}>
      <Checkbox
        checked={false}
        color={ringColor === 'priority' ? PRIORITY_COLOR[task.priority] : (list?.color ?? null)}
        label={`Complete “${task.title}”${list ? ` (${list.name})` : ''}`}
        onChange={() => onComplete(task)}
        disabled={!canEdit}
      />
      <button
        type="button"
        className="task-row__main"
        onClick={() => openEdit(task)}
        {...drag?.attributes}
        {...drag?.listeners}
      >
        <span className={titleClass(task.priority)}>{task.title}</span>
        <span className="task-row__meta">
          {task.recurringId && <WeeklyMark />}
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
          {/* Phones: the list goes at the end of the metadata line. */}
          {ringColor === 'priority' && <ListLabel list={list} className="task-row__list--inline" />}
        </span>
        {/* Desktop: the list sits at the right end of the row. */}
        {ringColor === 'priority' && <ListLabel list={list} className="task-row__list--end" />}
      </button>
    </li>
  );
}

export function TaskList({ tasks, ringColor = 'list' }: { tasks: Task[]; ringColor?: RingColor }) {
  const { complete } = useTaskMutations();
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          ringColor={ringColor}
          onComplete={(t) => complete.mutate(t)}
        />
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
