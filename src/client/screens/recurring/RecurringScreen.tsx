import { Pause, Play } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { formatWeekdayShort } from '../../../shared/dates';
import { describeSchedule, periodStartOf } from '../../../shared/recurrence';
import { czechCollator } from '../../../shared/tasks';
import type { RecurringTask, Task } from '../../../shared/types';
import { AddButton, ScreenHeader } from '../../components/AppShell';
import { Dialog } from '../../components/Dialog';
import { PriorityTag, titleClass } from '../../components/TaskRow';
import { useApp } from '../../lib/appContext';
import {
  useCompletedTasks,
  useOpenTasks,
  useRecurring,
  useRecurringMutations,
  useRewards,
} from '../../lib/queries';
import { RecurringForm } from './RecurringForm';

function TemplateRow({ template, onOpen }: { template: RecurringTask; onOpen: () => void }) {
  const { listsById, canEdit, today } = useApp();
  const { update } = useRecurringMutations();
  const { data: openTasks } = useOpenTasks();
  const { data: completedTasks } = useCompletedTasks();
  const { data: rewards } = useRewards();
  const list = template.listId ? listsById.get(template.listId) : undefined;
  // Created this week: earns from the next snapshot (SPEC §13.3).
  const earnsFromMonday =
    rewards?.started && template.active && !rewards.weekly[template.id]?.inSnapshot;

  // Monthly progress: this month's tasks of the template (SPEC §6.1).
  const periodStart = periodStartOf(template.period, today);
  const inPeriod = (task: Task) =>
    task.recurringId === template.id && task.weekStart === periodStart;
  const open = (openTasks ?? []).filter(inPeriod).length;
  const done = (completedTasks ?? []).filter(inPeriod).length;
  const total = open + done;

  return (
    <li className={template.active ? 'task-row' : 'task-row is-paused'}>
      {/* Templates can't be ticked off; their tasks are completed where they show up. */}
      <span
        className="template-ring"
        style={{ '--check-color': list?.color ?? 'var(--no-list)' } as CSSProperties}
        aria-hidden="true"
      />
      <button type="button" className="task-row__main" onClick={onOpen}>
        <span className={titleClass(template.priority)}>{template.title}</span>
        <span className="task-row__meta">
          <PriorityTag priority={template.priority} />
          <span>{describeSchedule(template, formatWeekdayShort)}</span>
          {template.period === 'month' && total > 0 && (
            <span>
              <span className="mono">
                {done}/{total}
              </span>{' '}
              this month
            </span>
          )}
          {list && <span>{list.name}</span>}
          {!template.active && <span className="paused-tag">Paused</span>}
          {earnsFromMonday && <span>Earns from Mon</span>}
        </span>
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!canEdit}
        aria-label={template.active ? `Pause “${template.title}”` : `Resume “${template.title}”`}
        title={template.active ? 'Pause' : 'Resume'}
        onClick={() => update.mutate({ id: template.id, changes: { active: !template.active } })}
      >
        {template.active ? (
          <Pause size={16} aria-hidden="true" />
        ) : (
          <Play size={16} aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

const byWeekdayThenTitle = (a: RecurringTask, b: RecurringTask) =>
  (a.weekday ?? 0) - (b.weekday ?? 0) || czechCollator.compare(a.title, b.title);
const byTitle = (a: RecurringTask, b: RecurringTask) => czechCollator.compare(a.title, b.title);

/** Recurring task templates, grouped by schedule (SPEC §8.5). */
export function RecurringScreen() {
  const { data: templates } = useRecurring();
  // undefined = closed; null = new template.
  const [editing, setEditing] = useState<RecurringTask | null | undefined>(undefined);
  const all = templates ?? [];
  const groups = [
    {
      title: 'Weekly on a set day',
      items: all.filter((t) => t.period === 'week' && t.mode === 'fixed').sort(byWeekdayThenTitle),
    },
    {
      title: 'Weekly, any day',
      items: all.filter((t) => t.period === 'week' && t.mode === 'flexible').sort(byTitle),
    },
    { title: 'Monthly', items: all.filter((t) => t.period === 'month').sort(byTitle) },
  ];

  return (
    <>
      <ScreenHeader
        title="Recurring"
        actions={<AddButton label="Add recurring task" onClick={() => setEditing(null)} />}
      />
      {templates && templates.length === 0 && (
        <p className="empty">
          No recurring tasks yet. Add one that should come back every week or month.
        </p>
      )}
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.title} className="section">
            <h2 className="section__title">
              {group.title}
              <span className="section__count">{group.items.length}</span>
            </h2>
            <ul className="task-list">
              {group.items.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  onOpen={() => setEditing(template)}
                />
              ))}
            </ul>
          </section>
        ))}

      <Dialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit recurring task' : 'New recurring task'}
        hideTitle
      >
        {editing !== undefined && (
          <RecurringForm
            key={editing?.id ?? 'new'}
            template={editing ?? undefined}
            onClose={() => setEditing(undefined)}
          />
        )}
      </Dialog>
    </>
  );
}
