import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { calendarEntries, canPlanOn, unplannedTasks } from '../../../shared/calendar';
import {
  addDays,
  addMonths,
  formatMonthTitle,
  formatWeekTitle,
  weekDates,
} from '../../../shared/dates';
import type { ISODate } from '../../../shared/types';
import { ScreenHeader, useIsDesktop } from '../../components/AppShell';
import { useTaskForm } from '../../components/TaskFormProvider';
import { useApp } from '../../lib/appContext';
import { useOpenTasks, useTaskMutations } from '../../lib/queries';
import { CompletedOnDay } from './CompletedOnDay';
import { GridCalendar } from './GridCalendar';
import { PhoneWeek } from './PhoneWeek';
import { TaskPeek } from './TaskPeek';
import { UnplannedTray } from './UnplannedTray';
import './calendar.css';

type CalendarView = 'month' | 'week';

export function CalendarScreen() {
  const { today, canEdit } = useApp();
  const isDesktop = useIsDesktop();
  const { data } = useOpenTasks();
  const { plan } = useTaskMutations();
  const { openNew } = useTaskForm();

  // Phones open on Week, desktop on Month (SPEC §8.2).
  const [view, setView] = useState<CalendarView>(isDesktop ? 'month' : 'week');
  const [anchor, setAnchor] = useState<ISODate>(today);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [completedDay, setCompletedDay] = useState<ISODate | null>(null);

  const tasks = data ?? [];
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const entries = useMemo(() => calendarEntries(tasks, today), [tasks, today]);
  const unplanned = useMemo(() => unplannedTasks(tasks, today), [tasks, today]);

  const step = (direction: 1 | -1) =>
    setAnchor(view === 'month' ? addMonths(anchor, direction) : addDays(anchor, 7 * direction));

  const onDayTap = (date: ISODate) => {
    if (canPlanOn(date, today)) openNew({ deadline: date });
    else setCompletedDay(date);
  };
  const onPlan = (taskId: string, date: ISODate) => {
    if (canEdit) plan.mutate({ id: taskId, plannedDate: date });
  };

  const phoneWeek = !isDesktop && view === 'week';
  const tray = (
    <UnplannedTray
      tasks={unplanned}
      onOpen={setPeekId}
      dragMode={phoneWeek ? 'list' : 'grid'}
      variant={isDesktop ? 'side' : 'dock'}
    />
  );

  return (
    <div className={`calendar ${phoneWeek ? 'calendar--list' : 'calendar--grid'}`}>
      <ScreenHeader
        title={view === 'month' ? formatMonthTitle(anchor) : formatWeekTitle(anchor)}
        actions={
          <>
            <div className="segmented" role="radiogroup" aria-label="Calendar view">
              {(['month', 'week'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={view === value}
                  className="segmented__option"
                  onClick={() => setView(value)}
                >
                  {value === 'month' ? 'Month' : 'Week'}
                </button>
              ))}
            </div>
            <div className="calendar__nav">
              <button
                type="button"
                className="icon-button"
                aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
                onClick={() => step(-1)}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="button" onClick={() => setAnchor(today)}>
                Today
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={view === 'month' ? 'Next month' : 'Next week'}
                onClick={() => step(1)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </>
        }
      />

      {phoneWeek ? (
        <PhoneWeek
          dates={weekDates(anchor)}
          entries={entries}
          tasksById={tasksById}
          onOpen={setPeekId}
          onDayTap={onDayTap}
          onPlan={onPlan}
          tray={tray}
        />
      ) : (
        <div className="calendar__body">
          <GridCalendar
            view={view === 'month' ? 'dayGridMonth' : 'dayGridWeek'}
            anchor={anchor}
            entries={entries}
            tasksById={tasksById}
            onOpen={setPeekId}
            onDayTap={onDayTap}
            onPlan={onPlan}
          />
          {tray}
        </div>
      )}

      <TaskPeek task={peekId ? tasksById.get(peekId) : undefined} onClose={() => setPeekId(null)} />
      <CompletedOnDay date={completedDay} onClose={() => setCompletedDay(null)} />
    </div>
  );
}
