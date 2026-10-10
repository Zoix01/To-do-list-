import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { ApiError } from './api';

// onlineManager assumes "online" until an event fires; start from the real state
// so an app opened without a connection knows it is offline.
onlineManager.setOnline(navigator.onLine);

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long data persisted on the device stays usable offline. */
export const PERSIST_MAX_AGE = 90 * DAY_MS;

/** Drops every cached task/list, on this device too (after logout or an expired session). */
export async function forgetUserData(): Promise<void> {
  await persister.removeClient();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
}

function onUnauthorized(error: unknown, queryKey?: readonly unknown[]) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  void forgetUserData();
  // The "me" query decides whether the login screen is shown.
  if (queryKey?.[0] !== 'me') void queryClient.invalidateQueries({ queryKey: ['me'] });
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => onUnauthorized(error, query.queryKey) }),
  mutationCache: new MutationCache({ onError: (error) => onUnauthorized(error) }),
  defaultOptions: {
    queries: {
      // Keep everything in memory so it can be persisted for offline use. Must not be a
      // large finite number: setTimeout overflows above ~24.8 days and would drop queries at once.
      gcTime: Infinity,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError) && count < 2,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((value) => value ?? null),
    setItem: (key, value: string) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'planner-cache',
});
