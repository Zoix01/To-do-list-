import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { AddButton, ScreenHeader } from '../../components/AppShell';
import { Dialog } from '../../components/Dialog';
import { useStoredState } from '../../lib/hooks';
import { useHabits } from '../../lib/queries';
import { HabitForm } from './HabitForm';
import { HabitRow } from './HabitRow';
import './habits.css';

/** Active habits with today's tick and streak; archived ones collapsed (SPEC §8.4). */
export function HabitsScreen() {
  const { data: habits } = useHabits();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useStoredState('habits.showArchived', false);
  const active = (habits ?? []).filter((habit) => !habit.archived);
  const archived = (habits ?? []).filter((habit) => habit.archived);

  return (
    <>
      <ScreenHeader
        title="Habits"
        actions={<AddButton label="Add habit" onClick={() => setAdding(true)} />}
      />
      {habits && active.length === 0 && (
        <p className="empty">No habits yet. Add one you want to keep up.</p>
      )}
      <ul className="task-list">
        {active.map((habit) => (
          <HabitRow key={habit.id} habit={habit} />
        ))}
      </ul>

      {archived.length > 0 && (
        <section className="section">
          <button
            type="button"
            className="section__title section__toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
            Archived
            <span className="section__count">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="task-list">
              {archived.map((habit) => (
                <HabitRow key={habit.id} habit={habit} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="New habit" hideTitle>
        {adding && <HabitForm onClose={() => setAdding(false)} />}
      </Dialog>
    </>
  );
}
