import { Flag, TriangleAlert } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { EntryKind } from '../../../shared/calendar';
import type { Task, TaskFlag } from '../../../shared/types';

const KIND_LABEL: Record<EntryKind, string> = {
  planned: 'planned',
  deadline: 'deadline',
  both: 'planned and deadline',
};

const FLAG_LABEL: Record<NonNullable<TaskFlag>, string> = {
  overdue: 'overdue',
  missed_plan: 'missed plan',
};

/**
 * Planned entries are filled with the list color; deadline entries are outlined
 * with a flag; "both" is filled with a flag. Flagged tasks get a red/orange edge.
 */
export function CalendarChip({
  task,
  kind,
  flag,
  color,
  afterDeadline = false,
}: {
  task: Task;
  kind: EntryKind;
  flag: TaskFlag;
  color: string | null;
  /** Planned after the deadline: shows an amber warning badge. */
  afterDeadline?: boolean;
}) {
  const classes = [
    'chip',
    kind === 'deadline' ? 'chip--outline' : 'chip--filled',
    flag === 'overdue' && 'chip--overdue',
    flag === 'missed_plan' && 'chip--missed',
    task.priority === 'high' && 'chip--high',
  ]
    .filter(Boolean)
    .join(' ');
  const description = [
    KIND_LABEL[kind],
    flag && FLAG_LABEL[flag],
    afterDeadline && 'planned after the deadline',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <span
      className={classes}
      style={{ '--chip-color': color ?? 'var(--no-list)' } as CSSProperties}
      title={`${task.title} (${description})`}
    >
      {afterDeadline && (
        <span className="chip__warn" aria-hidden="true">
          <TriangleAlert size={11} strokeWidth={2.5} />
        </span>
      )}
      {kind !== 'planned' && <Flag className="chip__flag" size={12} aria-hidden="true" />}
      <span className="chip__title">{task.title}</span>
      <span className="visually-hidden">, {description}</span>
    </span>
  );
}
