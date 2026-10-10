import type { ReactNode } from 'react';
import { AppShell } from './components/AppShell';
import { TaskFormProvider } from './components/TaskFormProvider';
import { ApiError } from './lib/api';
import { AppProvider } from './lib/appContext';
import { useMe } from './lib/queries';
import { useRouter } from './lib/router';
import { AllTasksScreen } from './screens/AllTasksScreen';
import { CompletedScreen } from './screens/CompletedScreen';
import { ListsScreen } from './screens/ListsScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';

const SCREENS: Record<string, () => ReactNode> = {
  '/': TodayScreen,
  '/tasks': AllTasksScreen,
  '/completed': CompletedScreen,
  '/lists': ListsScreen,
  '/settings': SettingsScreen,
};

function Screen() {
  const { location } = useRouter();
  const Component = SCREENS[location.pathname] ?? TodayScreen;
  return <Component />;
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
