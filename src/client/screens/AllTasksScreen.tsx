import { ChevronDown } from 'lucide-react';
import { useEffect } from 'react';
import { groupByList, sortTasks, type SortMode } from '../../shared/tasks';
import { AddTaskButton, ScreenHeader } from '../components/AppShell';
import { ColorDot, Menu, MenuItem } from '../components/controls';
import { ListFilterMenu, NO_LIST, useListFilter } from '../components/ListFilter';
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

export function AllTasksScreen() {
  const { today, lists } = useApp();
  const { data: tasks } = useOpenTasks();
  const { location, navigate } = useRouter();
  const [sort, setSort] = useStoredState<SortMode>('allTasks.sort', 'deadline');
  const { filter, setFilter, matches } = useListFilter('allTasks.filter');

  // Sidebar links (/tasks?list=…) select a single list.
  const listParam = location.search.get('list');
  useEffect(() => {
    if (listParam) {
      setFilter([listParam]);
      navigate('/tasks', { replace: true });
    }
  }, [listParam]);

  const filtered = (tasks ?? []).filter(matches);
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
            <ListFilterMenu filter={filter} setFilter={setFilter} />
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
            <TaskList tasks={group.tasks} ringColor="priority" />
          </section>
        ))
      ) : (
        <TaskList tasks={sortTasks(filtered, sort, today)} ringColor="priority" />
      )}
    </>
  );
}
