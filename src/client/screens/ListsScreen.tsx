import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LIST_COLORS, type List, type ListColor } from '../../shared/types';
import { ScreenHeader } from '../components/AppShell';
import { ColorPicker } from '../components/ColorPicker';
import { Dialog } from '../components/Dialog';
import { useApp } from '../lib/appContext';
import { useCompletedTasks, useListMutations, useOpenTasks } from '../lib/queries';

function ListRow({
  list,
  openCount,
  onDelete,
}: {
  list: List;
  openCount: number;
  onDelete: () => void;
}) {
  const { canEdit } = useApp();
  const { update } = useListMutations();
  const [name, setName] = useState(list.name);
  // Pick up renames from other devices.
  useEffect(() => setName(list.name), [list.name]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    disabled: !canEdit,
  });

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) setName(list.name);
    else if (trimmed !== list.name) update.mutate({ id: list.id, changes: { name: trimmed } });
  };

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'list-row is-dragging' : 'list-row'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="icon-button list-row__handle"
        aria-label={`Reorder “${list.name}”`}
        disabled={!canEdit}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <ColorPicker
        value={list.color}
        disabled={!canEdit}
        onChange={(color) => update.mutate({ id: list.id, changes: { color } })}
      />
      <input
        className="inline-input list-row__name"
        value={name}
        aria-label="List name"
        maxLength={100}
        disabled={!canEdit}
        onChange={(event) => setName(event.target.value)}
        onBlur={saveName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setName(list.name);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="list-row__count">{openCount || ''}</span>
      <button
        type="button"
        className="icon-button"
        aria-label={`Delete “${list.name}”`}
        title="Delete list"
        disabled={!canEdit}
        onClick={onDelete}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function AddListForm() {
  const { lists, canEdit } = useApp();
  const { create } = useListMutations();
  const unusedColor = LIST_COLORS.find((color) => !lists.some((list) => list.color === color));
  const [color, setColor] = useState<ListColor | null>(null);
  const [name, setName] = useState('');
  const shownColor = color ?? unusedColor ?? LIST_COLORS[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color: shownColor },
      {
        onSuccess: () => {
          setName('');
          setColor(null);
        },
      },
    );
  };

  return (
    <form className="list-row list-row--new" onSubmit={submit}>
      <span className="list-row__handle-space" />
      <ColorPicker value={shownColor} onChange={setColor} disabled={!canEdit} />
      <input
        className="inline-input list-row__name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New list"
        aria-label="New list name"
        maxLength={100}
        disabled={!canEdit}
      />
      <button
        type="submit"
        className="button button--primary"
        disabled={!canEdit || !name.trim() || create.isPending}
      >
        Add list
      </button>
    </form>
  );
}

export function ListsScreen() {
  const { lists, canEdit } = useApp();
  const { data: openTasks } = useOpenTasks();
  const { data: completedTasks } = useCompletedTasks();
  const { reorder, remove } = useListMutations();
  const [toDelete, setToDelete] = useState<List | null>(null);

  const counts = useMemo(() => {
    const result = new Map<string, { open: number; done: number }>();
    const add = (listId: string | null, key: 'open' | 'done') => {
      if (!listId) return;
      const entry = result.get(listId) ?? { open: 0, done: 0 };
      entry[key] += 1;
      result.set(listId, entry);
    };
    for (const task of openTasks ?? []) add(task.listId, 'open');
    for (const task of completedTasks ?? []) add(task.listId, 'done');
    return result;
  }, [openTasks, completedTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = lists.map((list) => list.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    reorder.mutate(arrayMove(ids, from, to));
  };

  const deleteCounts = toDelete ? (counts.get(toDelete.id) ?? { open: 0, done: 0 }) : null;
  const deleteTotal = deleteCounts ? deleteCounts.open + deleteCounts.done : 0;

  return (
    <>
      <ScreenHeader title="Lists" />
      <AddListForm />
      {lists.length === 0 && <p className="empty">Add your first list above.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={lists.map((list) => list.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="list-rows">
            {lists.map((list) => (
              <ListRow
                key={list.id}
                list={list}
                openCount={counts.get(list.id)?.open ?? 0}
                onDelete={() => setToDelete(list)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <Dialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={toDelete ? `Delete “${toDelete.name}”?` : 'Delete list?'}
      >
        <p className="dialog__text">
          {deleteTotal === 0
            ? 'This list has no tasks.'
            : `It has ${deleteCounts?.open} open and ${deleteCounts?.done} completed ${
                deleteTotal === 1 ? 'task' : 'tasks'
              }. What should happen to them?`}
        </p>
        <div className="dialog__actions dialog__actions--stack">
          <button type="button" className="button" onClick={() => setToDelete(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={!canEdit}
            onClick={() => {
              if (toDelete) remove.mutate({ id: toDelete.id, tasks: 'move' });
              setToDelete(null);
            }}
          >
            Move its tasks to No list
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={!canEdit}
            onClick={() => {
              if (toDelete) remove.mutate({ id: toDelete.id, tasks: 'delete' });
              setToDelete(null);
            }}
          >
            Delete its tasks too
          </button>
        </div>
      </Dialog>
    </>
  );
}
