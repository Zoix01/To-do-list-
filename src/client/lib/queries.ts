import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  HabitCreateInput,
  HabitUpdateInput,
  ListCreateInput,
  ListUpdateInput,
  RecurringCreateInput,
  RecurringUpdateInput,
  ShopRewardCreateInput,
  ShopRewardUpdateInput,
  TaskCreateInput,
  TaskUpdateInput,
} from '../../shared/schemas';
import type {
  ConnectorStatus,
  EarnedReward,
  HabitWithChecks,
  List,
  Me,
  Priority,
  RecurringTask,
  BoxOpening,
  InventoryItem,
  InventoryView,
  OwnedPiece,
  RewardsSummary,
  ShopReward,
  Task,
} from '../../shared/types';
import { api, errorMessage } from './api';
import { useFeedback } from './feedback';
import { rewardText } from './rewards';

export const keys = {
  me: ['me'] as const,
  lists: ['lists'] as const,
  tasks: ['tasks'] as const,
  openTasks: ['tasks', 'open'] as const,
  completedTasks: ['tasks', 'completed'] as const,
  recurring: ['recurring'] as const,
  habits: ['habits'] as const,
  connector: ['connector'] as const,
  rewards: ['rewards'] as const,
  shopRewards: ['shop', 'rewards'] as const,
  inventory: ['inventory'] as const,
  gallery: ['gallery'] as const,
};

/** Wallet, level and what each habit / weekly task earns (SPEC §13.10). */
export function useRewards() {
  return useQuery({ queryKey: keys.rewards, queryFn: () => api<RewardsSummary>('/rewards') });
}

const NO_DAYS: string[] = [];

/** Vacation days pause every habit (SPEC §13.9). */
export function useVacationDays(): string[] {
  return useRewards().data?.vacationDays ?? NO_DAYS;
}

export function useShopRewards() {
  return useQuery({
    queryKey: keys.shopRewards,
    queryFn: () => api<ShopReward[]>('/shop/rewards'),
  });
}

/** Owned art pieces (SPEC §13.13). */
export function useGallery() {
  return useQuery({ queryKey: keys.gallery, queryFn: () => api<OwnedPiece[]>('/gallery') });
}

export function useInventory() {
  return useQuery({ queryKey: keys.inventory, queryFn: () => api<InventoryView>('/inventory') });
}

/** Everything a purchase or an item change can affect. */
function useInvalidateRewards() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.rewards }),
      queryClient.invalidateQueries({ queryKey: keys.inventory }),
      queryClient.invalidateQueries({ queryKey: keys.habits }),
      queryClient.invalidateQueries({ queryKey: keys.gallery }),
    ]);
}

export function useShopMutations() {
  const queryClient = useQueryClient();
  const { showUndo, showError } = useFeedback();
  const invalidate = useInvalidateRewards();
  const invalidateRewards = () => queryClient.invalidateQueries({ queryKey: keys.shopRewards });
  const onError = (error: unknown) => showError(errorMessage(error));

  const refund = useMutation({
    mutationFn: (id: string) => api(`/inventory/${id}/refund`, { method: 'POST' }),
    onSettled: invalidate,
    onError,
  });
  /** Buys an item; the toast offers to undo it (SPEC §13.6). */
  const buy = useMutation({
    mutationFn: (input: {
      item: 'box' | 'freeze' | 'vacation' | 'reward';
      rewardId?: string;
      name: string;
    }) =>
      api<InventoryItem>('/shop/buy', {
        method: 'POST',
        body: { item: input.item, rewardId: input.rewardId, requestId: crypto.randomUUID() },
      }),
    onSuccess: (item, input) => showUndo(`Bought ${input.name}`, () => refund.mutate(item.id)),
    onSettled: invalidate,
    onError,
  });
  const create = useMutation({
    mutationFn: (input: ShopRewardCreateInput) =>
      api<ShopReward>('/shop/rewards', { method: 'POST', body: input }),
    onSuccess: invalidateRewards,
  });
  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: ShopRewardUpdateInput }) =>
      api<ShopReward>(`/shop/rewards/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidateRewards,
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api('/shop/rewards/order', { method: 'PUT', body: { ids } }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.shopRewards });
      const previous = queryClient.getQueryData<ShopReward[]>(keys.shopRewards);
      const byId = new Map(previous?.map((reward) => [reward.id, reward]));
      queryClient.setQueryData<ShopReward[]>(
        keys.shopRewards,
        ids.flatMap((id, sortOrder) => {
          const reward = byId.get(id);
          return reward ? [{ ...reward, sortOrder }] : [];
        }),
      );
      return previous;
    },
    onError: (error, _ids, previous) => {
      queryClient.setQueryData(keys.shopRewards, previous);
      onError(error);
    },
    onSettled: invalidateRewards,
  });
  return { buy, refund, create, update, reorder };
}

/** Arming freezes, planning vacation days, using rewards (SPEC §13.9). */
export function useInventoryMutations() {
  const { showError } = useFeedback();
  const invalidate = useInvalidateRewards();
  const useAction = <T>(run: (input: T) => Promise<unknown>) =>
    useMutation({
      mutationFn: run,
      onSettled: invalidate,
      onError: (error: unknown) => showError(errorMessage(error)),
    });
  return {
    arm: useAction(({ id, habitId }: { id: string; habitId: string }) =>
      api(`/inventory/${id}/arm`, { method: 'POST', body: { habitId } }),
    ),
    unarm: useAction((id: string) => api(`/inventory/${id}/unarm`, { method: 'POST' })),
    planVacation: useAction(({ id, date }: { id: string; date: string }) =>
      api(`/inventory/${id}/vacation`, { method: 'POST', body: { date } }),
    ),
    cancelVacation: useAction((id: string) => api(`/inventory/${id}/cancel`, { method: 'POST' })),
    useReward: useAction((id: string) => api(`/inventory/${id}/use`, { method: 'POST' })),
    useCharm: useAction((id: string) => api(`/inventory/${id}/charm`, { method: 'POST' })),
    buyPiece: useAction((pieceId: string) =>
      api(`/gallery/pieces/${pieceId}/buy`, { method: 'POST' }),
    ),
  };
}

export function useConnector() {
  return useQuery({ queryKey: keys.connector, queryFn: () => api<ConnectorStatus>('/connector') });
}

/** Disconnects a connected app (revokes its access immediately). */
export function useDisconnectApp() {
  const queryClient = useQueryClient();
  const { showError } = useFeedback();
  return useMutation({
    mutationFn: (id: string) => api(`/connector/apps/${id}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.connector }),
    onError: (error) => showError(errorMessage(error)),
  });
}

export function useRecurring() {
  return useQuery({ queryKey: keys.recurring, queryFn: () => api<RecurringTask[]>('/recurring') });
}

export function useHabits() {
  return useQuery({ queryKey: keys.habits, queryFn: () => api<HabitWithChecks[]>('/habits') });
}

export function useRecurringMutations() {
  const queryClient = useQueryClient();
  const { showError } = useFeedback();
  // Creating / resuming a template can create this week's task, so refresh tasks too.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.recurring }),
      queryClient.invalidateQueries({ queryKey: keys.tasks }),
      queryClient.invalidateQueries({ queryKey: keys.rewards }),
    ]);

  const create = useMutation({
    mutationFn: (input: RecurringCreateInput) =>
      api<RecurringTask>('/recurring', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: RecurringUpdateInput }) =>
      api<RecurringTask>(`/recurring/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidate,
    onError: (error) => showError(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/recurring/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (error) => showError(errorMessage(error)),
  });
  return { create, update, remove };
}

export function useHabitMutations() {
  const queryClient = useQueryClient();
  const { showError } = useFeedback();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.habits }),
      queryClient.invalidateQueries({ queryKey: keys.rewards }),
    ]);

  const create = useMutation({
    mutationFn: (input: HabitCreateInput) =>
      api<HabitWithChecks>('/habits', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: HabitUpdateInput }) =>
      api(`/habits/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/habits/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (error) => showError(errorMessage(error)),
  });
  /** Tick or un-tick one day; shown right away. A tick resolves with what it earned. */
  const setCheck = useMutation({
    mutationFn: ({ id, date, checked }: { id: string; date: string; checked: boolean }) =>
      api<EarnedReward | undefined>(`/habits/${id}/checks/${date}`, {
        method: checked ? 'PUT' : 'DELETE',
      }),
    onMutate: async ({ id, date, checked }) => {
      await queryClient.cancelQueries({ queryKey: keys.habits });
      const previous = queryClient.getQueryData<HabitWithChecks[]>(keys.habits);
      queryClient.setQueryData<HabitWithChecks[]>(keys.habits, (habits) =>
        habits?.map((habit) => {
          if (habit.id !== id) return habit;
          const without = habit.checks.filter((day) => day !== date);
          return { ...habit, checks: checked ? [...without, date].sort() : without };
        }),
      );
      return () => queryClient.setQueryData(keys.habits, previous);
    },
    onError: (error, _vars, restore) => {
      restore?.();
      showError(errorMessage(error));
    },
    onSettled: invalidate,
  });
  return { create, update, remove, setCheck };
}

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
  const { showUndo, updateToast, showError } = useFeedback();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.tasks }),
      queryClient.invalidateQueries({ queryKey: keys.rewards }),
    ]);
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
    mutationFn: (task: Task) =>
      api<Task & { reward?: EarnedReward }>(`/tasks/${task.id}/complete`, { method: 'POST' }),
    onMutate: async (task) => {
      const restore = await removeFromCache(keys.openTasks, task.id);
      const toast = showUndo('Task completed', () => uncomplete.mutate(task.id));
      return { restore, toast };
    },
    onSuccess: (task, _task, context) => {
      // Weekly tasks earn coins (SPEC §13.4): "Task completed · +500".
      const earned = task.reward && rewardText(task.reward);
      if (earned) updateToast(context.toast, `Task completed · ${earned}`);
    },
    onError: (error, _task, context) => {
      context?.restore();
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

  /** Sets (or clears) the planned date by hand; shown right away, e.g. after a calendar drop. */
  const plan = useMutation({
    mutationFn: ({ id, plannedDate }: { id: string; plannedDate: string | null }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: { plannedDate } }),
    onMutate: async ({ id, plannedDate }) => {
      await queryClient.cancelQueries({ queryKey: keys.openTasks });
      const previous = queryClient.getQueryData<Task[]>(keys.openTasks);
      queryClient.setQueryData<Task[]>(keys.openTasks, (tasks) =>
        tasks?.map((task) =>
          task.id === id ? { ...task, plannedDate, plannedManual: true } : task,
        ),
      );
      return () => queryClient.setQueryData(keys.openTasks, previous);
    },
    onError: (error, _vars, restore) => {
      restore?.();
      onError(error);
    },
    onSettled: invalidate,
  });

  /** Changes the priority; shown right away, e.g. after a drop in the Priority view. */
  const reprioritize = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: Priority }) =>
      api<Task>(`/tasks/${id}`, { method: 'PATCH', body: { priority } }),
    onMutate: async ({ id, priority }) => {
      await queryClient.cancelQueries({ queryKey: keys.openTasks });
      const previous = queryClient.getQueryData<Task[]>(keys.openTasks);
      queryClient.setQueryData<Task[]>(keys.openTasks, (tasks) =>
        tasks?.map((task) => (task.id === id ? { ...task, priority } : task)),
      );
      return () => queryClient.setQueryData(keys.openTasks, previous);
    },
    onError: (error, _vars, restore) => {
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

  return { create, update, complete, uncomplete, remove, removeCompleted, plan, reprioritize };
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

/** Opens a box; its stored result comes back for the animation (SPEC §13.7). */
export function useOpenBox() {
  const invalidate = useInvalidateRewards();
  return useMutation({
    mutationFn: (id: string) => api<BoxOpening>(`/inventory/${id}/open`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

const NO_COSMETICS = new Set<string>();

/** Cosmetic ids I own (SPEC §13.12). */
export function useOwnedCosmetics(): ReadonlySet<string> {
  const cosmetics = useRewards().data?.cosmetics;
  return useMemo(() => (cosmetics ? new Set(cosmetics) : NO_COSMETICS), [cosmetics]);
}

/** Buying cosmetics (with undo) and Settings → Appearance / Gamification. */
export function useCosmeticMutations() {
  const queryClient = useQueryClient();
  const { showUndo, showError } = useFeedback();
  const invalidate = useInvalidateRewards();
  const onError = (error: unknown) => showError(errorMessage(error));

  const refund = useMutation({
    mutationFn: (id: string) => api(`/shop/cosmetics/${id}/refund`, { method: 'POST' }),
    onSettled: invalidate,
    onError,
  });
  const buy = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      api(`/shop/cosmetics/${id}/buy`, {
        method: 'POST',
        body: { requestId: crypto.randomUUID() },
      }),
    onSuccess: (_result, { id, name }) => showUndo(`Unlocked ${name}`, () => refund.mutate(id)),
    onSettled: invalidate,
    onError,
  });
  const setTickAnimation = useMutation({
    mutationFn: (tickAnimation: string) =>
      api('/settings/appearance', { method: 'PUT', body: { tickAnimation } }),
    onMutate: async (tickAnimation) => {
      await queryClient.cancelQueries({ queryKey: keys.rewards });
      queryClient.setQueryData<RewardsSummary>(keys.rewards, (summary) =>
        summary ? { ...summary, tickAnimation } : summary,
      );
    },
    onSettled: invalidate,
    onError,
  });
  const setEconomy = useMutation({
    mutationFn: (economy: { weeklyBudget: number; expectedRate: number }) =>
      api('/settings/economy', { method: 'PUT', body: economy }),
    onSettled: invalidate,
  });
  return { buy, refund, setTickAnimation, setEconomy };
}
