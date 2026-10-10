import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { dateInZone } from '../../shared/dates';
import type { ISODate } from '../../shared/types';

export function useOnline(): boolean {
  return useSyncExternalStore(
    (callback) => onlineManager.subscribe(callback),
    () => onlineManager.isOnline(),
  );
}

/** "Today" in the app's time zone; updates around midnight and when the app regains focus. */
export function useToday(timeZone: string): ISODate {
  const [today, setToday] = useState(() => dateInZone(new Date(), timeZone));
  useEffect(() => {
    const update = () => setToday(dateInZone(new Date(), timeZone));
    update();
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timeZone]);
  return today;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
  );
}

/** useState persisted in localStorage (per-device UI preferences only). */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable; keep the in-memory value.
    }
  };
  return [value, update];
}
