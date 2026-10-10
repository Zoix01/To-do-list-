import { useMemo } from 'react';
import { formatShortDate } from '../../shared/dates';
import { todaySections, type TodaySections } from '../../shared/tasks';
import type { Task } from '../../shared/types';
import { AddTaskButton, ScreenHeader } from '../components/AppShell';
import { TaskList } from '../components/TaskRow';
import { useApp } from '../lib/appContext';
import { useOpenTasks } from '../lib/queries';
import { Link } from '../lib/router';

const SECTIONS: { key: keyof TodaySections<Task>; title: string; tone?: 'danger' | 'warning' }[] = [
  { key: 'overdue', title: 'Overdue', tone: 'danger' },
  { key: 'missedPlan', title: 'Missed plan', tone: 'warning' },
  { key: 'today', title: 'Today' },
  { key: 'dueToday', title: 'Due today' },
];

export function TodayScreen() {
  const { today, lists } = useApp();
  const { data: tasks } = useOpenTasks();
  const sections = useMemo(() => todaySections(tasks ?? [], today), [tasks, today]);
  const visible = SECTIONS.filter((section) => sections[section.key].length > 0);

  return (
    <>
      <ScreenHeader title="Today" subtitle={formatShortDate(today)} actions={<AddTaskButton />} />
      {tasks && visible.length === 0 && (
        <p className="empty">
          {lists.length === 0 && tasks.length === 0 ? (
            <>
              No lists yet. <Link to="/lists">Add your first list</Link>, or add a task with +.
            </>
          ) : (
            'No tasks today'
          )}
        </p>
      )}
      {visible.map((section) => (
        <section key={section.key} className="section">
          <h2 className={section.tone ? `section__title is-${section.tone}` : 'section__title'}>
            {section.title}
            <span className="section__count">{sections[section.key].length}</span>
          </h2>
          <TaskList tasks={sections[section.key]} />
        </section>
      ))}
    </>
  );
}
