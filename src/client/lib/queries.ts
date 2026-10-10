import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListCreateInput,
  ListUpdateInput,
  TaskCreateInput,
  TaskUpdateInput,
} from '../../shared/schemas';
import type { List, Me, Task } from '../../shared/types';
import { api, errorMessage } from './api';
import { useFeedback } from './feedback';

export const keys = {
  me: ['me'] as const,
  lists: ['lists'] as const,
  tasks: ['tasks'] as const,
  openTasks: ['tasks', 'open'] as const,
  completedTasks: ['tasks', 'completed'] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me') });
}

export function useLists() {
  return useQuery({ queryKey: keys.lists, queryFn: () => api<List[]>('/lists') });
}

export function useOpenTasks() {
  return useQuery({ queryKey: keys.openTasks, queryFn: () => api<Task[]>('/tasks?status=open') });
}

export function useCompletedTasks() {
  return useQuery({
    queryKey: keys.completedTasks,
    queryFn: () => api<Task[]>('/tasks?status=completed'),
  });
}

export function useTaskMutations() {
  const queryClient = useQueryClient();
  const { showUndo, showError } = useFeedback();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.tasks });
  const onError = (error: unknown) => showError(errorMessage(error));

  /** Removes a task from a cached list right away; returns a function that restores it. */
  async function removeFromCache(key: readonly string[], id: string) {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<Task[]>(key);
    queryClient.setQueryData<Task[]>(key, (tasks) => tasks?.filter((task) => task.id !== id));
    return () => queryClient.setQueryData(key, previous);
  }

  const uncomplete = useMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/uncomplete`, { method: 'POST' }),
    onMutate: (id) => removeFromCache(keys.completedTasks, id),
    onError: (error, _id, restore) => {
      restore?.();
      onError(error);
    },
    onSettled: invalidate,
  });

  const complete = useMutation({
    mutationFn: (task: Task) => api<Task>(`/tasks/${task.id}/complete`, { method: 'POST' }),
    onMutate: async (task) => {
      const restore = await removeFromCache(keys.openTasks, task.id);
      showUndo('Task completed', () => uncomplete.mutate(task.id));
      return restore;
    },
    onError: (error, _task, restore) => {
      restore?.();
      onError(error);
    },
    onSettled: invalidate,
  });

  const create = useMutation({
    mutationFn: (input: TaskCreateInput) => api<Task>('/tasks', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: TaskUpdateInput }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      const restoreOpen = await removeFromCache(keys.openTasks, id);
      const restoreCompleted = await removeFromCache(keys.completedTasks, id);
      return () => {
        restoreOpen();
        restoreCompleted();
      };
    },
    onError: (error, _id, restore) => {
      restore?.();
      onError(error);
    },
    onSettled: invalidate,
  });

  const removeCompleted = useMutation({
    mutationFn: (ids: string[]) =>
      api('/tasks/delete-completed', { method: 'POST', body: { ids } }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.completedTasks });
      const previous = queryClient.getQueryData<Task[]>(keys.completedTasks);
      const gone = new Set(ids);
      queryClient.setQueryData<Task[]>(keys.completedTasks, (tasks) =>
        tasks?.filter((task) => !gone.has(task.id)),
      );
      return () => queryClient.setQueryData(keys.completedTasks, previous);
    },
    onError: (error, _ids, restore) => {
      restore?.();
      onError(error);
    },
    onSettled: invalidate,
  });

  return { create, update, complete, uncomplete, remove, removeCompleted };
}

export function useListMutations() {
  const queryClient = useQueryClient();
  const { showError } = useFeedback();
  const invalidateLists = () => queryClient.invalidateQueries({ queryKey: keys.lists });
  const onError = (error: unknown) => showError(errorMessage(error));

  const create = useMutation({
    mutationFn: (input: ListCreateInput) => api<List>('/lists', { method: 'POST', body: input }),
    onSuccess: invalidateLists,
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: ListUpdateInput }) =>
      api<List>(`/lists/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidateLists,
    onError,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api('/lists/order', { method: 'PUT', body: { ids } }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.lists });
      const previous = queryClient.getQueryData<List[]>(keys.lists);
      const byId = new Map(previous?.map((list) => [list.id, list]));
      queryClient.setQueryData<List[]>(
        keys.lists,
        ids.flatMap((id, sortOrder) => {
          const list = byId.get(id);
          return list ? [{ ...list, sortOrder }] : [];
        }),
      );
      return previous;
    },
    onError: (error, _ids, previous) => {
      queryClient.setQueryData(keys.lists, previous);
      onError(error);
    },
    onSettled: invalidateLists,
  });

  const remove = useMutation({
    mutationFn: ({ id, tasks }: { id: string; tasks: 'move' | 'delete' }) =>
      api(`/lists/${id}?tasks=${tasks}`, { method: 'DELETE' }),
    onSettled: () => {
      void invalidateLists();
      void queryClient.invalidateQueries({ queryKey: keys.tasks });
    },
    onError,
  });

  return { create, update, reorder, remove };
}
