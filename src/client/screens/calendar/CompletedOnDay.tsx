import { formatShortDate } from '../../../shared/dates';
import { groupCompleted } from '../../../shared/tasks';
import type { ISODate } from '../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { CompletedRow } from '../../components/TaskRow';
import { useApp } from '../../lib/appContext';
import { useCompletedTasks, useTaskMutations } from '../../lib/queries';

/** Tapping a past day shows what was completed that day (SPEC §8.2). */
export function CompletedOnDay({ date, onClose }: { date: ISODate | null; onClose: () => void }) {
  const { timeZone } = useApp();
  const { data: tasks } = useCompletedTasks();
  const { uncomplete } = useTaskMutations();
  const done = date
    ? (groupCompleted(tasks ?? [], timeZone).find((group) => group.date === date)?.tasks ?? [])
    : [];

  return (
    <Dialog
      open={date !== null}
      onClose={onClose}
      title={date ? `Completed on ${formatShortDate(date)}` : 'Completed'}
    >
      {done.length === 0 ? (
        <p className="dialog__text">Nothing completed on this day.</p>
      ) : (
        <ul className="task-list">
          {done.map((task) => (
            <CompletedRow key={task.id} task={task} onRestore={() => uncomplete.mutate(task.id)} />
          ))}
        </ul>
      )}
      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
