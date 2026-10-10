import { useMemo } from 'react';
import { formatShortDate } from '../../shared/dates';
import { showOnToday } from '../../shared/habits';
import { todaySections, type TodaySections } from '../../shared/tasks';
import type { Task } from '../../shared/types';
import { AddTaskButton, ScreenHeader } from '../components/AppShell';
import { TaskList } from '../components/TaskRow';
import { useApp } from '../lib/appContext';
import { useHabits, useOpenTasks } from '../lib/queries';
import { Link } from '../lib/router';
import { HabitRow } from './habits/HabitRow';
import './habits/habits.css';

const SECTIONS: { key: keyof TodaySections<Task>; title: string; tone?: 'danger' | 'warning' }[] = [
  { key: 'overdue', title: 'Overdue', tone: 'danger' },
  { key: 'missedPlan', title: 'Missed plan', tone: 'warning' },
  { key: 'today', title: 'Today' },
  { key: 'dueToday', title: 'Due today' },
  { key: 'thisWeek', title: 'This week, unplanned' },
];

export function TodayScreen() {
  const { today, lists } = useApp();
  const { data: tasks } = useOpenTasks();
  const { data: habits } = useHabits();
  const sections = useMemo(() => todaySections(tasks ?? [], today), [tasks, today]);
  const visible = SECTIONS.filter((section) => sections[section.key].length > 0);
  // Habits due today, or already ticked today so they can be unticked (SPEC §7).
  const habitsToday = (habits ?? []).filter(
    (habit) => !habit.archived && showOnToday(habit, new Set(habit.checks), today),
  );

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
      {habitsToday.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Habits
            <span className="section__count">{habitsToday.length}</span>
          </h2>
          <ul className="task-list">
            {habitsToday.map((habit) => (
              <HabitRow key={habit.id} habit={habit} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
