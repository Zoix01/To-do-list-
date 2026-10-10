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
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { groupByPriority } from '../../shared/tasks';
import type { Priority, Task } from '../../shared/types';
import { useApp } from '../lib/appContext';
import { useTaskMutations } from '../lib/queries';
import { PRIORITY_LABELS, PRIORITY_NUMBER, PriorityTag, TaskRow } from './TaskRow';

/** Same long-press as the calendar, so a normal swipe still scrolls on phones. */
const LONG_PRESS_MS = 300;

function DraggableRow({ task, onComplete }: { task: Task; onComplete: (task: Task) => void }) {
  const { canEdit } = useApp();
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !canEdit,
  });
  return (
    <TaskRow
      task={task}
      ringColor="priority"
      onComplete={onComplete}
      drag={{ setNodeRef, attributes, listeners, isDragging }}
    />
  );
}

function PrioritySection({
  priority,
  count,
  children,
}: {
  priority: Priority;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: priority });
  return (
    <section
      ref={setNodeRef}
      className={isOver ? 'section priority-group is-over' : 'section priority-group'}
    >
      <h2 className="section__title">
        <PriorityTag priority={priority} />
        {PRIORITY_LABELS[priority]}
        <span className="section__count">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * All tasks sorted by priority: sections 2 · High, 1 · Medium, 0 · Low.
 * Dragging a task into another section changes its priority (SPEC §8.3).
 */
export function PriorityGroups({ tasks }: { tasks: Task[] }) {
  const { today, canEdit } = useApp();
  const { complete, reprioritize } = useTaskMutations();
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: 8 } }),
  );
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = byId.get(String(active.id));
    const priority = over?.id as Priority | undefined;
    if (!canEdit || !task || !priority || task.priority === priority) return;
    reprioritize.mutate({ id: task.id, priority });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setDragging(byId.get(String(active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {groupByPriority(tasks, today).map((group) => (
        <PrioritySection key={group.priority} priority={group.priority} count={group.tasks.length}>
          <ul className="task-list">
            {group.tasks.map((task) => (
              <DraggableRow key={task.id} task={task} onComplete={(t) => complete.mutate(t)} />
            ))}
          </ul>
          {group.tasks.length === 0 && (
            <p className="priority-group__empty">
              No priority {PRIORITY_NUMBER[group.priority]} tasks
              {canEdit ? ' · drag one here' : ''}
            </p>
          )}
        </PrioritySection>
      ))}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <ul className="task-list task-list--overlay">
            <TaskRow task={dragging} ringColor="priority" onComplete={() => {}} />
          </ul>
        )}
      </DragOverlay>
    </DndContext>
  );
}
