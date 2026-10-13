import { lazy, Suspense, type ComponentType } from 'react';
import { AppShell } from './components/AppShell';
import { TaskFormProvider } from './components/TaskFormProvider';
import { ApiError } from './lib/api';
import { AppProvider } from './lib/appContext';
import { useMe } from './lib/queries';
import { useRouter } from './lib/router';
import { AllTasksScreen } from './screens/AllTasksScreen';
import { CompletedScreen } from './screens/CompletedScreen';
import { HabitDetailScreen } from './screens/habits/HabitDetailScreen';
import { HabitsScreen } from './screens/habits/HabitsScreen';
import { InventoryScreen } from './screens/habits/InventoryScreen';
import { ManageRewardsScreen } from './screens/habits/ManageRewardsScreen';
import { ShopScreen } from './screens/habits/ShopScreen';
import { RecurringScreen } from './screens/recurring/RecurringScreen';
import { ListsScreen } from './screens/ListsScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';

// FullCalendar is large; load it only when the calendar is opened (still cached for offline).
const CalendarScreen = lazy(() =>
  import('./screens/calendar/CalendarScreen').then((module) => ({
    default: module.CalendarScreen,
  })),
);

const SCREENS: Record<string, ComponentType> = {
  '/': TodayScreen,
  '/calendar': CalendarScreen,
  '/tasks': AllTasksScreen,
  '/completed': CompletedScreen,
  '/lists': ListsScreen,
  '/settings': SettingsScreen,
  '/habits': HabitsScreen,
  '/habits/shop': ShopScreen,
  '/habits/shop/rewards': ManageRewardsScreen,
  '/habits/inventory': InventoryScreen,
  '/recurring': RecurringScreen,
  // Old address of the screen, before monthly tasks (SPEC §6.1).
  '/weekly': RecurringScreen,
};

function Screen() {
  const { location } = useRouter();
  const habitId = SCREENS[location.pathname]
    ? undefined
    : location.pathname.match(/^\/habits\/([^/]+)$/)?.[1];
  if (habitId) return <HabitDetailScreen id={decodeURIComponent(habitId)} />;
  const Component = SCREENS[location.pathname] ?? TodayScreen;
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

export function App() {
  const me = useMe();

  if (me.error instanceof ApiError && me.error.status === 401) return <LoginScreen />;

  if (me.data) {
    return (
      <AppProvider timeZone={me.data.timeZone}>
        <TaskFormProvider>
          <AppShell>
            <Screen />
          </AppShell>
        </TaskFormProvider>
      </AppProvider>
    );
  }

  if (me.isPending && me.fetchStatus !== 'paused') return null;

  return (
    <main className="center-note">
      <p>
        {me.fetchStatus === 'paused'
          ? 'Offline. Connect once to load your data on this device.'
          : 'Can’t reach the server.'}
      </p>
      <button type="button" className="button" onClick={() => void me.refetch()}>
        Try again
      </button>
    </main>
  );
}
