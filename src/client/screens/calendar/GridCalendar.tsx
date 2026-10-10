import FullCalendar, {
  useCalendarController,
  type EventDisplayInfo,
  type EventInput,
} from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import { useEffect, useMemo } from 'react';
import { canPlanOn, type CalendarEntry, type EntryKind } from '../../../shared/calendar';
import type { ISODate, Task, TaskFlag } from '../../../shared/types';
import { useApp } from '../../lib/appContext';
import { CalendarChip } from './CalendarChip';
import { LONG_PRESS_MS } from './UnplannedTray';

interface EntryProps {
  taskId: string;
  kind: EntryKind;
  flag: TaskFlag;
  afterDeadline: boolean;
}

/** Month and desktop-week views, built on FullCalendar's day grid. */
export function GridCalendar({
  view,
  anchor,
  entries,
  tasksById,
  onOpen,
  onDayTap,
  onPlan,
}: {
  view: 'dayGridMonth' | 'dayGridWeek';
  anchor: ISODate;
  entries: CalendarEntry[];
  tasksById: Map<string, Task>;
  onOpen: (taskId: string) => void;
  onDayTap: (date: ISODate) => void;
  onPlan: (taskId: string, date: ISODate) => void;
}) {
  const { today, listsById, canEdit } = useApp();
  const controller = useCalendarController();

  // Our own toolbar drives navigation; keep FullCalendar in sync with it.
  useEffect(() => {
    controller.changeView(view);
    controller.gotoDate(anchor);
  }, [controller, view, anchor]);

  const events = useMemo<EventInput[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        start: entry.date,
        allDay: true,
        title: tasksById.get(entry.taskId)?.title ?? '',
        editable: canEdit && entry.draggable,
        color: 'transparent',
        order: entry.order,
        extendedProps: {
          taskId: entry.taskId,
          kind: entry.kind,
          flag: entry.flag,
          afterDeadline: entry.afterDeadline,
        },
      })),
    [entries, tasksById, canEdit],
  );

  const renderEvent = (info: EventDisplayInfo) => {
    const { taskId, kind, flag, afterDeadline } = info.event.extendedProps as EntryProps;
    const task = tasksById.get(taskId);
    if (!task) return null;
    const color = task.listId ? (listsById.get(task.listId)?.color ?? null) : null;
    return (
      <CalendarChip
        task={task}
        kind={kind}
        flag={flag}
        color={color}
        afterDeadline={afterDeadline}
      />
    );
  };

  return (
    <div className="grid-calendar">
      <FullCalendar
        controller={controller}
        plugins={[dayGridPlugin, interactionPlugin, classicThemePlugin]}
        initialView={view}
        initialDate={anchor}
        now={today}
        firstDay={1}
        height="100%"
        fixedWeekCount={false}
        dayMaxEvents
        dayHeaderFormat={{ weekday: 'short' }}
        events={events}
        eventOrder="order"
        eventContent={renderEvent}
        eventClass="cal-event"
        dayCellClass={(info) => (info.isPast ? 'cal-day is-past' : 'cal-day')}
        editable={canEdit}
        eventDurationEditable={false}
        droppable={canEdit}
        longPressDelay={LONG_PRESS_MS}
        eventLongPressDelay={LONG_PRESS_MS}
        eventAllow={(span) => canPlanOn(span.startStr, today)}
        eventDrop={(info) => {
          const date = info.event.startStr;
          // The data is the source of truth: put the chip back and let the update move it.
          info.revert();
          if (canPlanOn(date, today)) onPlan((info.event.extendedProps as EntryProps).taskId, date);
        }}
        eventReceive={(info) => {
          const date = info.event.startStr;
          const taskId = String(info.event.extendedProps.taskId);
          info.revert();
          if (canPlanOn(date, today)) onPlan(taskId, date);
        }}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onOpen((info.event.extendedProps as EntryProps).taskId);
        }}
        dateClick={(info) => onDayTap(info.dateStr)}
      />
    </div>
  );
}
