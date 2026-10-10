import { useDraggable } from '@dnd-kit/core';
import { Draggable } from '@fullcalendar/react/interaction';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { deadlineLabel } from '../../../shared/tasks';
import type { Task } from '../../../shared/types';
import { useApp } from '../../lib/appContext';
import { useStoredState } from '../../lib/hooks';

export const LONG_PRESS_MS = 300;

function TrayItemContent({ task }: { task: Task }) {
  const { today, listsById } = useApp();
  const list = task.listId ? listsById.get(task.listId) : undefined;
  return (
    <>
      <span
        className="tray-item__ring"
        style={{ '--check-color': list?.color ?? 'var(--no-list)' } as CSSProperties}
        aria-hidden="true"
      />
      <span className="tray-item__title">{task.title}</span>
      <span className="tray-item__meta">{deadlineLabel(task.deadline, today)}</span>
    </>
  );
}

/** Tray item draggable by FullCalendar (grid views); see the Draggable set up in UnplannedTray. */
function GridTrayItem({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      className="tray-item"
      data-task-id={task.id}
      data-title={task.title}
      onClick={() => onOpen(task.id)}
    >
      <TrayItemContent task={task} />
    </button>
  );
}

/** Tray item draggable with dnd-kit (phone week list). */
function ListTrayItem({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { canEdit } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray:${task.id}`,
    data: { taskId: task.id, kind: 'tray' },
    disabled: !canEdit,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={isDragging ? 'tray-item is-dragging' : 'tray-item'}
      onClick={() => onOpen(task.id)}
      {...attributes}
      {...listeners}
    >
      <TrayItemContent task={task} />
    </button>
  );
}

/**
 * Unplanned tasks to drag onto a day: a side panel on desktop, a docked strip
 * above the tab bar on phones.
 */
export function UnplannedTray({
  tasks,
  onOpen,
  dragMode,
  variant,
}: {
  tasks: Task[];
  onOpen: (id: string) => void;
  /** "grid" = FullCalendar handles the drop; "list" = dnd-kit (phone week). */
  dragMode: 'grid' | 'list';
  variant: 'side' | 'dock';
}) {
  const { canEdit } = useApp();
  const [collapsed, setCollapsed] = useStoredState('calendar.trayCollapsed', false);
  const listRef = useRef<HTMLDivElement>(null);
  // The phone dock only takes space when there is something to drag.
  const expanded = variant === 'side' || (!collapsed && tasks.length > 0);

  useEffect(() => {
    const el = listRef.current;
    if (dragMode !== 'grid' || !el || !canEdit || !expanded) return;
    const draggable = new Draggable(el, {
      itemSelector: '.tray-item',
      minDistance: 4,
      longPressDelay: LONG_PRESS_MS,
      eventData: (itemEl: HTMLElement) => ({
        title: itemEl.dataset.title,
        allDay: true,
        create: true,
        extendedProps: { taskId: itemEl.dataset.taskId },
      }),
    });
    return () => draggable.destroy();
  }, [dragMode, canEdit, expanded]);

  const Item = dragMode === 'grid' ? GridTrayItem : ListTrayItem;

  return (
    <aside className={`tray tray--${variant}`} aria-label="Unplanned tasks">
      <button
        type="button"
        className="tray__header"
        onClick={() => variant === 'dock' && setCollapsed(!collapsed)}
        aria-expanded={expanded}
        disabled={variant === 'side'}
      >
        Unplanned
        <span className="section__count">{tasks.length}</span>
        {variant === 'dock' &&
          (expanded ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronUp size={16} aria-hidden="true" />
          ))}
      </button>
      {expanded && (
        <div className="tray__list" ref={listRef}>
          {tasks.length === 0 && <p className="tray__empty">Every task is planned</p>}
          {tasks.map((task) => (
            <Item key={task.id} task={task} onOpen={onOpen} />
          ))}
        </div>
      )}
      {expanded && tasks.length > 0 && (
        <p className="tray__hint">
          {variant === 'dock' ? 'Hold and drag onto a day' : 'Drag onto a day to plan'}
        </p>
      )}
    </aside>
  );
}
