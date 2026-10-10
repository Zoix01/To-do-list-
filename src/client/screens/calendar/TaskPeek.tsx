import { TriangleAlert } from 'lucide-react';
import { formatShortDate } from '../../../shared/dates';
import { deadlineLabel, isPlannedAfterDeadline, taskFlag } from '../../../shared/tasks';
import type { Task } from '../../../shared/types';
import { Checkbox, ColorDot } from '../../components/controls';
import { Dialog } from '../../components/Dialog';
import { useTaskForm } from '../../components/TaskFormProvider';
import { PRIORITY_LABELS, PriorityTag } from '../../components/TaskRow';
import { useApp } from '../../lib/appContext';
import { useTaskMutations } from '../../lib/queries';

/** Small panel shown when a calendar chip or tray item is tapped. */
export function TaskPeek({ task, onClose }: { task: Task | undefined; onClose: () => void }) {
  const { today, listsById, canEdit } = useApp();
  const { complete, plan } = useTaskMutations();
  const { openEdit } = useTaskForm();
  const list = task?.listId ? listsById.get(task.listId) : undefined;
  const flag = task ? taskFlag(task, today) : null;

  return (
    <Dialog open={task !== undefined} onClose={onClose} title={task?.title ?? 'Task'} hideTitle>
      {task && (
        <div className="peek">
          <div className="peek__head">
            <Checkbox
              checked={false}
              color={list?.color ?? null}
              label={`Complete “${task.title}”`}
              disabled={!canEdit}
              onChange={() => {
                complete.mutate(task);
                onClose();
              }}
            />
            <h2
              className={
                task.priority === 'high' ? 'peek__title task-row__title--high' : 'peek__title'
              }
            >
              {task.title}
            </h2>
          </div>
          <dl className="peek__facts">
            <dt>List</dt>
            <dd>
              <ColorDot color={list?.color ?? null} />
              {list?.name ?? 'No list'}
            </dd>
            <dt>Deadline</dt>
            <dd>
              <span className={flag === 'overdue' ? 'is-overdue' : undefined}>
                {formatShortDate(task.deadline)}
              </span>
              {/* Add "due in 3 days" etc., but not when it would just repeat the date. */}
              {deadlineLabel(task.deadline, today) !== `due ${formatShortDate(task.deadline)}` && (
                <span className="muted">{deadlineLabel(task.deadline, today)}</span>
              )}
              {flag === 'overdue' && <span className="flag flag--overdue">Overdue</span>}
            </dd>
            <dt>Planned</dt>
            <dd>
              {task.plannedDate ? formatShortDate(task.plannedDate) : 'Not planned'}
              {flag === 'missed_plan' && <span className="flag flag--missed">Missed plan</span>}
              {isPlannedAfterDeadline(task) && (
                <span className="field-warning">
                  <TriangleAlert size={14} aria-hidden="true" /> After deadline
                </span>
              )}
            </dd>
            <dt>Priority</dt>
            <dd>
              <PriorityTag priority={task.priority} />
              {PRIORITY_LABELS[task.priority]}
            </dd>
          </dl>
          {task.notes && <p className="peek__notes">{task.notes}</p>}
          <div className="dialog__actions">
            {task.plannedDate && (
              <button
                type="button"
                className="button button--quiet dialog__actions-start"
                disabled={!canEdit}
                onClick={() => plan.mutate({ id: task.id, plannedDate: null })}
              >
                Unplan
              </button>
            )}
            <button type="button" className="button" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                onClose();
                openEdit(task);
              }}
            >
              Edit
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
