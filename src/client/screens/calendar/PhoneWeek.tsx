import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { canPlanOn, type CalendarEntry } from '../../../shared/calendar';
import { formatShortDate } from '../../../shared/dates';
import type { ISODate, Task } from '../../../shared/types';
import { useApp } from '../../lib/appContext';
import { CalendarChip } from './CalendarChip';
import { LONG_PRESS_MS } from './UnplannedTray';

interface DragData {
  taskId: string;
}

function chipColor(task: Task, listsById: Map<string, { color: string }>): string | null {
  return task.listId ? (listsById.get(task.listId)?.color ?? null) : null;
}

function WeekChip({
  entry,
  task,
  onOpen,
}: {
  entry: CalendarEntry;
  task: Task;
  onOpen: (id: string) => void;
}) {
  const { listsById, canEdit } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
    data: { taskId: entry.taskId } satisfies DragData,
    disabled: !canEdit || !entry.draggable,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={isDragging ? 'week-chip is-dragging' : 'week-chip'}
      onClick={() => onOpen(entry.taskId)}
      {...attributes}
      {...listeners}
    >
      <CalendarChip
        task={task}
        kind={entry.kind}
        flag={entry.flag}
        color={chipColor(task, listsById)}
      />
    </button>
  );
}

function WeekDay({
  date,
  children,
  onDayTap,
}: {
  date: ISODate;
  children: ReactNode;
  onDayTap: (date: ISODate) => void;
}) {
  const { today } = useApp();
  const past = date < today;
  const { setNodeRef, isOver } = useDroppable({ id: date, disabled: !canPlanOn(date, today) });
  const classes = ['week-day', past && 'is-past', date === today && 'is-today', isOver && 'is-over']
    .filter(Boolean)
    .join(' ');
  // Taps on the day itself (not on a chip) create a task / show what was completed.
  const onClick = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).closest('.week-chip')) onDayTap(date);
  };
  return (
    <section ref={setNodeRef} className={classes} onClick={onClick}>
      <h2 className="week-day__date">
        {formatShortDate(date)}
        {date === today && <span className="week-day__today">Today</span>}
      </h2>
      <div className="week-day__chips">{children}</div>
    </section>
  );
}

/** Week on phones: 7 stacked days; long-press a chip to drag it to another day. */
export function PhoneWeek({
  dates,
  entries,
  tasksById,
  onOpen,
  onDayTap,
  onPlan,
  tray,
}: {
  dates: ISODate[];
  entries: CalendarEntry[];
  tasksById: Map<string, Task>;
  onOpen: (taskId: string) => void;
  onDayTap: (date: ISODate) => void;
  onPlan: (taskId: string, date: ISODate) => void;
  /** The unplanned tray; rendered inside the drag context so its items can be dropped here. */
  tray: ReactNode;
}) {
  const { today, listsById } = useApp();
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: 8 } }),
  );

  const onDragStart = ({ active }: DragStartEvent) =>
    setDragging((active.data.current as DragData).taskId);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const date = over ? String(over.id) : null;
    const taskId = (active.data.current as DragData).taskId;
    if (!date || !canPlanOn(date, today)) return;
    if (tasksById.get(taskId)?.plannedDate !== date) onPlan(taskId, date);
  };

  const draggedTask = dragging ? tasksById.get(dragging) : undefined;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="week-list">
        {dates.map((date) => (
          <WeekDay key={date} date={date} onDayTap={onDayTap}>
            {entries
              .filter((entry) => entry.date === date)
              .sort((a, b) => a.order - b.order)
              .map((entry) => {
                const task = tasksById.get(entry.taskId);
                return task ? (
                  <WeekChip key={entry.id} entry={entry} task={task} onOpen={onOpen} />
                ) : null;
              })}
          </WeekDay>
        ))}
      </div>
      {tray}
      <DragOverlay dropAnimation={null}>
        {draggedTask && (
          <span className="week-chip week-chip--overlay">
            <CalendarChip
              task={draggedTask}
              kind="planned"
              flag={null}
              color={chipColor(draggedTask, listsById)}
            />
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}
