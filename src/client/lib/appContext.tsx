import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ISODate, List } from '../../shared/types';
import { useOnline, useToday } from './hooks';
import { useCompletedTasks, useHabits, useLists, useOpenTasks, useRecurring } from './queries';

interface AppValue {
  today: ISODate;
  timeZone: string;
  lists: List[];
  listsById: Map<string, List>;
  /** Editing is disabled offline (SPEC §2.1). */
  canEdit: boolean;
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  const today = useToday(timeZone);
  const online = useOnline();
  const { data } = useLists();
  // Keep every dataset loaded (and persisted) so all screens work offline (SPEC §2.1).
  useOpenTasks();
  useCompletedTasks();
  useRecurring();
  useHabits();
  const value = useMemo(() => {
    const lists = [...(data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      today,
      timeZone,
      lists,
      listsById: new Map(lists.map((list) => [list.id, list])),
      canEdit: online,
    };
  }, [today, timeZone, data, online]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside AppProvider');
  return value;
}
