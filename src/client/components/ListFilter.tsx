import { ListFilter } from 'lucide-react';
import type { Task } from '../../shared/types';
import { useApp } from '../lib/appContext';
import { useStoredState } from '../lib/hooks';
import { ColorDot, Menu, MenuItem } from './controls';

/** Filter value for loose tasks. */
export const NO_LIST = 'none';

/** List filter state, remembered per screen on this device. Empty = all lists. */
export function useListFilter(storageKey: string) {
  const { listsById } = useApp();
  const [stored, setFilter] = useStoredState<string[]>(storageKey, []);
  // Ignore lists that have since been deleted.
  const filter = stored.filter((id) => id === NO_LIST || listsById.has(id));
  const matches = (task: Pick<Task, 'listId'>) =>
    filter.length === 0 || filter.includes(task.listId ?? NO_LIST);
  return { filter, setFilter, matches };
}

export function ListFilterMenu({
  filter,
  setFilter,
}: {
  filter: string[];
  setFilter: (filter: string[]) => void;
}) {
  const { lists, listsById } = useApp();
  const toggle = (id: string) =>
    setFilter(filter.includes(id) ? filter.filter((value) => value !== id) : [...filter, id]);

  const label =
    filter.length === 0
      ? 'All lists'
      : filter.length === 1
        ? filter[0] === NO_LIST
          ? 'No list'
          : (listsById.get(filter[0]!)?.name ?? 'All lists')
        : `${filter.length} lists`;

  return (
    <Menu
      label="Filter by list"
      align="end"
      closeOnSelect={false}
      buttonContent={
        <>
          <ListFilter size={14} aria-hidden="true" />
          {label}
        </>
      }
    >
      {() => (
        <>
          <MenuItem selected={filter.length === 0} onSelect={() => setFilter([])}>
            All lists
          </MenuItem>
          <div className="menu__divider" />
          {lists.map((list) => (
            <MenuItem
              key={list.id}
              role="menuitemcheckbox"
              selected={filter.includes(list.id)}
              onSelect={() => toggle(list.id)}
            >
              <ColorDot color={list.color} />
              {list.name}
            </MenuItem>
          ))}
          <MenuItem
            role="menuitemcheckbox"
            selected={filter.includes(NO_LIST)}
            onSelect={() => toggle(NO_LIST)}
          >
            <ColorDot color={null} />
            No list
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
