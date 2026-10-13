import { z } from 'zod';
import { isISODate } from './dates';
import { REWARD_PRICE_MAX, REWARD_PRICE_MIN, WEIGHT_MAX, WEIGHT_MIN } from './economy';
import { REWARD_ICONS } from './shop';
import { HABIT_ICON_NAMES, TICK_ANIMATIONS } from './cosmetics';
import {
  HABIT_FREQUENCIES,
  ALL_LIST_COLORS,
  PRIORITIES,
  RECURRING_MODES,
  RECURRING_PERIODS,
} from './types';

const isoDate = z.string().refine(isISODate, 'Must be a date in YYYY-MM-DD format');
const title = z.string().trim().min(1, 'Title is required').max(500);
const notes = z.string().max(20_000).nullable();
/** Share of the weekly coin budget (SPEC §13.3). */
const weight = z.number().int().min(WEIGHT_MIN).max(WEIGHT_MAX);

export const loginSchema = z.object({ password: z.string().min(1).max(1000) });

export const listCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  color: z.enum(ALL_LIST_COLORS),
});
export type ListCreateInput = z.infer<typeof listCreateSchema>;

export const listUpdateSchema = listCreateSchema.partial();
export type ListUpdateInput = z.infer<typeof listUpdateSchema>;

export const listOrderSchema = z.object({ ids: z.array(z.string()).max(1000) });

export const taskCreateSchema = z.object({
  title,
  notes: notes.optional(),
  priority: z.enum(PRIORITIES).optional(),
  listId: z.string().nullable().optional(),
  deadline: isoDate,
  /** Omit for the automatic planned date; null = unplanned. */
  plannedDate: isoDate.nullable().optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

const weekday = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const monthDays = z.array(z.number().int().min(1).max(31)).max(31);

export const recurringCreateSchema = z.object({
  title,
  notes: notes.optional(),
  priority: z.enum(PRIORITIES).optional(),
  listId: z.string().nullable().optional(),
  period: z.enum(RECURRING_PERIODS).optional(),
  mode: z.enum(RECURRING_MODES),
  /** Weekly 'fixed'. */
  weekday: weekday.nullable().optional(),
  /** Monthly 'fixed'. */
  monthDays: monthDays.optional(),
  /** Monthly 'flexible'. */
  timesPerMonth: z.number().int().nullable().optional(),
  weight: weight.optional(),
});
export type RecurringCreateInput = z.infer<typeof recurringCreateSchema>;

export const recurringUpdateSchema = z
  .object({
    title,
    notes,
    priority: z.enum(PRIORITIES),
    listId: z.string().nullable(),
    period: z.enum(RECURRING_PERIODS),
    mode: z.enum(RECURRING_MODES),
    weekday: weekday.nullable(),
    monthDays,
    timesPerMonth: z.number().int().nullable(),
    active: z.boolean(),
    weight,
  })
  .partial()
  .strict();
export type RecurringUpdateInput = z.infer<typeof recurringUpdateSchema>;

const tickAnimation = z.enum(['default', ...TICK_ANIMATIONS]);

const habitName = z.string().trim().min(1, 'Name is required').max(100);

export const habitCreateSchema = z.object({
  name: habitName,
  color: z.enum(ALL_LIST_COLORS),
  frequency: z.enum(HABIT_FREQUENCIES),
  weekdays: z.array(weekday).max(7).optional(),
  target: z.number().int().nullable().optional(),
  weight: weight.optional(),
  icon: z.enum(HABIT_ICON_NAMES).nullable().optional(),
  tickAnimation: tickAnimation.nullable().optional(),
});
export type HabitCreateInput = z.infer<typeof habitCreateSchema>;

export const habitUpdateSchema = z
  .object({
    name: habitName,
    color: z.enum(ALL_LIST_COLORS),
    frequency: z.enum(HABIT_FREQUENCIES),
    weekdays: z.array(weekday).max(7),
    target: z.number().int().nullable(),
    archived: z.boolean(),
    weight,
    icon: z.enum(HABIT_ICON_NAMES).nullable(),
    tickAnimation: tickAnimation.nullable(),
  })
  .partial()
  .strict();
export type HabitUpdateInput = z.infer<typeof habitUpdateSchema>;

export const taskIdsSchema = z.object({ ids: z.array(z.string()).min(1).max(10_000) });

export const taskUpdateSchema = z
  .object({
    title,
    notes,
    priority: z.enum(PRIORITIES),
    listId: z.string().nullable(),
    deadline: isoDate,
    plannedDate: isoDate.nullable(),
  })
  .partial()
  .strict();
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

// ---------------------------------------------------------------- Shop and inventory (SPEC §13.6, §13.9)

const rewardName = z.string().trim().min(1, 'Name is required').max(60);
const rewardPrice = z.number().int().min(REWARD_PRICE_MIN).max(REWARD_PRICE_MAX);

export const shopRewardCreateSchema = z.object({
  name: rewardName,
  price: rewardPrice,
  icon: z.enum(REWARD_ICONS),
});
export type ShopRewardCreateInput = z.infer<typeof shopRewardCreateSchema>;

export const shopRewardUpdateSchema = z
  .object({
    name: rewardName,
    price: rewardPrice,
    icon: z.enum(REWARD_ICONS),
    archived: z.boolean(),
  })
  .partial()
  .strict();
export type ShopRewardUpdateInput = z.infer<typeof shopRewardUpdateSchema>;

export const buySchema = z.object({
  item: z.enum(['box', 'freeze', 'vacation', 'reward']),
  rewardId: z.string().optional(),
  /** Generated by the app per tap; a repeated request buys only once. */
  requestId: z.string().min(8).max(64),
});
export type BuyInput = z.infer<typeof buySchema>;

export const armSchema = z.object({ habitId: z.string() });
export const vacationSchema = z.object({ date: isoDate });

export const cosmeticBuySchema = z.object({ requestId: z.string().min(8).max(64) });

export const appearanceSchema = z.object({ tickAnimation });

/** Settings → Gamification (SPEC §13.2). */
export const economySchema = z.object({
  weeklyBudget: z.number().int().min(1000).max(1_000_000),
  expectedRate: z.number().min(0.1).max(1),
});
