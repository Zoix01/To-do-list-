import {
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  ListTodo,
  Menu as MenuIcon,
  Plus,
  Settings,
  WifiOff,
  X,
  Sun,
  Sprout,
  Repeat,
} from 'lucide-react';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../lib/appContext';
import { useFeedback } from '../lib/feedback';
import { useMediaQuery } from '../lib/hooks';
import { useOpenTasks } from '../lib/queries';
import { Link, useRouter } from '../lib/router';
import { ColorDot } from './controls';
import { Dialog } from './Dialog';
import { useTaskForm } from './TaskFormProvider';

const DESKTOP_QUERY = '(min-width: 768px)';

const ShellContext = createContext<{ isDesktop: boolean; openDrawer: () => void }>({
  isDesktop: true,
  openDrawer: () => {},
});

const MAIN_NAV = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'All tasks', icon: ListTodo },
  { to: '/habits', label: 'Habits', icon: Sprout },
  { to: '/weekly', label: 'Weekly', icon: Repeat },
];

export function useIsDesktop(): boolean {
  return useContext(ShellContext).isDesktop;
}

function NavLink({
  to,
  icon: Icon,
  children,
  onNavigate,
}: {
  to: string;
  icon?: typeof CalendarDays;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const { location } = useRouter();
  // A habit's detail page (/habits/…) keeps "Habits" highlighted.
  const active =
    (location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`))) &&
    !location.search.has('list');
  return (
    <Link
      to={to}
      className="nav-link"
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      <span className="nav-link__label">{children}</span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { lists } = useApp();
  const { data: tasks } = useOpenTasks();
  const { location } = useRouter();
  const counts = useMemo(() => {
    const result = new Map<string | null, number>();
    for (const task of tasks ?? []) result.set(task.listId, (result.get(task.listId) ?? 0) + 1);
    return result;
  }, [tasks]);
  const activeList = location.pathname === '/tasks' ? location.search.get('list') : null;

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar__brand">Planner</div>
      {MAIN_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} icon={item.icon} onNavigate={onNavigate}>
          {item.label}
        </NavLink>
      ))}
      <NavLink to="/completed" icon={CircleCheck} onNavigate={onNavigate}>
        Completed
      </NavLink>

      <div className="sidebar__section">
        <Link to="/lists" className="sidebar__heading" onClick={onNavigate}>
          Lists
        </Link>
        {lists.map((list) => (
          <Link
            key={list.id}
            to={`/tasks?list=${list.id}`}
            className="nav-link"
            aria-current={activeList === list.id ? 'page' : undefined}
            onClick={onNavigate}
          >
            <span className="nav-link__dot">
              <ColorDot color={list.color} />
            </span>
            <span className="nav-link__label">{list.name}</span>
            <span className="nav-link__count">{counts.get(list.id) || ''}</span>
          </Link>
        ))}
        {lists.length === 0 && (
          <Link to="/lists" className="nav-link nav-link--muted" onClick={onNavigate}>
            <span className="nav-link__dot">
              <Plus size={14} aria-hidden="true" />
            </span>
            <span className="nav-link__label">Add list</span>
          </Link>
        )}
      </div>

      <div className="sidebar__footer">
        <NavLink to="/settings" icon={Settings} onNavigate={onNavigate}>
          Settings
        </NavLink>
      </div>
    </nav>
  );
}

function TabBar() {
  const { location } = useRouter();
  return (
    <nav className="tabbar" aria-label="Main">
      {MAIN_NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="tabbar__item"
          aria-current={
            location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`))
              ? 'page'
              : undefined
          }
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function StatusLine() {
  const { canEdit } = useApp();
  const { error, clearError } = useFeedback();
  if (!canEdit) {
    return (
      <p className="status-line">
        <WifiOff size={14} aria-hidden="true" />
        Offline — changes are disabled until you reconnect
      </p>
    );
  }
  if (error) {
    return (
      <p className="status-line status-line--error" role="alert">
        {error}
        <button type="button" className="icon-button" aria-label="Dismiss" onClick={clearError}>
          <X size={14} aria-hidden="true" />
        </button>
      </p>
    );
  }
  return null;
}

export function ScreenHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Shows a back arrow to this path (and replaces the menu button on phones). */
  back?: string;
}) {
  const { isDesktop, openDrawer } = useContext(ShellContext);
  return (
    <>
      <header className="screen-header">
        {back ? (
          <Link to={back} className="icon-button" aria-label="Back">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
        ) : (
          !isDesktop && (
            <button
              type="button"
              className="icon-button"
              aria-label="Open menu"
              onClick={openDrawer}
            >
              <MenuIcon size={18} aria-hidden="true" />
            </button>
          )
        )}
        <h1 className="screen-header__title">{title}</h1>
        {subtitle && <span className="screen-header__subtitle">{subtitle}</span>}
        {actions && <div className="screen-header__actions">{actions}</div>}
      </header>
      <StatusLine />
    </>
  );
}

/** "Add task": a header button on desktop, a floating button on phones. */
/** Primary "add" action: a header button on desktop, a floating button on phones. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { isDesktop } = useContext(ShellContext);
  const { canEdit } = useApp();
  return (
    <button
      type="button"
      className={isDesktop ? 'button button--primary' : 'fab'}
      onClick={onClick}
      disabled={!canEdit}
      aria-label={label}
    >
      <Plus size={isDesktop ? 16 : 22} aria-hidden="true" />
      {isDesktop && label}
    </button>
  );
}

export function AddTaskButton({ listId }: { listId?: string | null }) {
  const { openNew } = useTaskForm();
  return <AddButton label="Add task" onClick={() => openNew({ listId })} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shell = useMemo(() => ({ isDesktop, openDrawer: () => setDrawerOpen(true) }), [isDesktop]);

  return (
    <ShellContext.Provider value={shell}>
      <div className={isDesktop ? 'app app--desktop' : 'app app--phone'}>
        {isDesktop && <Sidebar />}
        <main className="main">
          <div className="main__inner">{children}</div>
        </main>
        {!isDesktop && <TabBar />}
      </div>
      {!isDesktop && (
        <Dialog
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Menu"
          hideTitle
          variant="drawer"
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </Dialog>
      )}
    </ShellContext.Provider>
  );
}
