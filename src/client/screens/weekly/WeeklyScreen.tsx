import { Pause, Play } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { formatWeekdayShort } from '../../../shared/dates';
import { czechCollator } from '../../../shared/tasks';
import type { RecurringTask } from '../../../shared/types';
import { AddButton, ScreenHeader } from '../../components/AppShell';
import { Dialog } from '../../components/Dialog';
import { PriorityTag, titleClass } from '../../components/TaskRow';
import { useApp } from '../../lib/appContext';
import { useRecurring, useRecurringMutations } from '../../lib/queries';
import { RecurringForm } from './RecurringForm';

function TemplateRow({ template, onOpen }: { template: RecurringTask; onOpen: () => void }) {
  const { listsById, canEdit } = useApp();
  const { update } = useRecurringMutations();
  const list = template.listId ? listsById.get(template.listId) : undefined;
  const schedule =
    template.mode === 'fixed' && template.weekday
      ? `Every ${formatWeekdayShort(template.weekday)}`
      : 'Any day';
  return (
    <li className={template.active ? 'task-row' : 'task-row is-paused'}>
      <span
        className="template-ring"
        style={{ '--check-color': list?.color ?? 'var(--no-list)' } as CSSProperties}
        aria-hidden="true"
      />
      <button type="button" className="task-row__main" onClick={onOpen}>
        <span className={titleClass(template.priority)}>{template.title}</span>
        <span className="task-row__meta">
          <PriorityTag priority={template.priority} />
          <span>{schedule}</span>
          {list && <span>{list.name}</span>}
          {!template.active && <span className="paused-tag">Paused</span>}
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

/** Weekly task templates, grouped by fixed day / any day (SPEC §8.5). */
export function WeeklyScreen() {
  const { data: templates } = useRecurring();
  // undefined = closed; null = new template.
  const [editing, setEditing] = useState<RecurringTask | null | undefined>(undefined);
  const fixed = (templates ?? []).filter((t) => t.mode === 'fixed').sort(byWeekdayThenTitle);
  const flexible = (templates ?? [])
    .filter((t) => t.mode === 'flexible')
    .sort((a, b) => czechCollator.compare(a.title, b.title));

  return (
    <>
      <ScreenHeader
        title="Weekly"
        actions={<AddButton label="Add weekly task" onClick={() => setEditing(null)} />}
      />
      {templates && templates.length === 0 && (
        <p className="empty">No weekly tasks yet. Add one that should come back every week.</p>
      )}
      {[
        { title: 'On a set day', items: fixed },
        { title: 'Any day of the week', items: flexible },
      ]
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
        title={editing ? 'Edit weekly task' : 'New weekly task'}
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
