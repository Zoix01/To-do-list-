import { ChevronDown, ListFilter } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { groupByList, sortTasks, type SortMode } from '../../shared/tasks';
import { AddTaskButton, ScreenHeader } from '../components/AppShell';
import { ColorDot, Menu, MenuItem } from '../components/controls';
import { TaskList } from '../components/TaskRow';
import { useApp } from '../lib/appContext';
import { useStoredState } from '../lib/hooks';
import { useOpenTasks } from '../lib/queries';
import { useRouter } from '../lib/router';

const SORT_LABELS: Record<SortMode, string> = {
  deadline: 'Deadline',
  urgency: 'Urgency',
  list: 'List',
};

/** Filter value for loose tasks. */
const NO_LIST = 'none';

export function AllTasksScreen() {
  const { today, lists, listsById } = useApp();
  const { data: tasks } = useOpenTasks();
  const { location, navigate } = useRouter();
  const [sort, setSort] = useStoredState<SortMode>('allTasks.sort', 'deadline');
  const [storedFilter, setFilter] = useStoredState<string[]>('allTasks.filter', []);

  // Ignore lists that have since been deleted.
  const filter = storedFilter.filter((id) => id === NO_LIST || listsById.has(id));

  // Sidebar links (/tasks?list=…) select a single list.
  const listParam = location.search.get('list');
  useEffect(() => {
    if (listParam) {
      setFilter([listParam]);
      navigate('/tasks', { replace: true });
    }
  }, [listParam]);

  const filtered = useMemo(
    () =>
      (tasks ?? []).filter(
        (task) => filter.length === 0 || filter.includes(task.listId ?? NO_LIST),
      ),
    [tasks, filter],
  );

  const toggleFilter = (id: string) =>
    setFilter(filter.includes(id) ? filter.filter((value) => value !== id) : [...filter, id]);

  const filterLabel =
    filter.length === 0
      ? 'All lists'
      : filter.length === 1
        ? filter[0] === NO_LIST
          ? 'No list'
          : (listsById.get(filter[0]!)?.name ?? 'All lists')
        : `${filter.length} lists`;

  const singleList = filter.length === 1 && filter[0] !== NO_LIST ? filter[0] : undefined;

  return (
    <>
      <ScreenHeader
        title="All tasks"
        actions={
          <>
            <Menu
              label={`Sort by ${SORT_LABELS[sort]}`}
              buttonContent={
                <>
                  {SORT_LABELS[sort]}
                  <ChevronDown size={14} aria-hidden="true" />
                </>
              }
            >
              {(close) =>
                (Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                  <MenuItem
                    key={mode}
                    selected={sort === mode}
                    onSelect={() => {
                      setSort(mode);
                      close();
                    }}
                  >
                    {SORT_LABELS[mode]}
                  </MenuItem>
                ))
              }
            </Menu>
            <Menu
              label="Filter by list"
              align="end"
              closeOnSelect={false}
              buttonContent={
                <>
                  <ListFilter size={14} aria-hidden="true" />
                  {filterLabel}
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
                      onSelect={() => toggleFilter(list.id)}
                    >
                      <ColorDot color={list.color} />
                      {list.name}
                    </MenuItem>
                  ))}
                  <MenuItem
                    role="menuitemcheckbox"
                    selected={filter.includes(NO_LIST)}
                    onSelect={() => toggleFilter(NO_LIST)}
                  >
                    <ColorDot color={null} />
                    No list
                  </MenuItem>
                </>
              )}
            </Menu>
            <AddTaskButton listId={singleList} />
          </>
        }
      />

      {tasks && filtered.length === 0 && (
        <p className="empty">{filter.length === 0 ? 'No tasks' : 'No tasks in this filter'}</p>
      )}

      {sort === 'list' ? (
        groupByList(filtered, lists, today).map((group) => (
          <section key={group.list?.id ?? NO_LIST} className="section">
            <h2 className="section__title">
              <ColorDot color={group.list?.color ?? null} />
              {group.list?.name ?? 'No list'}
              <span className="section__count">{group.tasks.length}</span>
            </h2>
            <TaskList tasks={group.tasks} />
          </section>
        ))
      ) : (
        <TaskList tasks={sortTasks(filtered, sort, today)} />
      )}
    </>
  );
}
