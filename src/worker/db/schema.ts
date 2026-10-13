import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { EconomyItemType, LedgerKind } from '../../shared/rewards';
import type { BoxResult } from '../../shared/boxes';
import type { Tier } from '../../shared/seasons';
import type { RewardIcon } from '../../shared/shop';
import type {
  HabitFrequency,
  InventoryItemType,
  InventorySource,
  InventoryStatus,
  ListColor,
  Priority,
  RecurringMode,
  RecurringPeriod,
  Weekday,
} from '../../shared/types';

export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').$type<ListColor>().notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: text('created_at').notNull(),
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    listId: text('list_id').references(() => lists.id),
    title: text('title').notNull(),
    notes: text('notes'),
    priority: text('priority').$type<Priority>().notNull().default('medium'),
    deadline: text('deadline').notNull(),
    plannedDate: text('planned_date'),
    plannedManual: integer('planned_manual', { mode: 'boolean' }).notNull().default(false),
    recurringId: text('recurring_id'),
    /** Start of a recurring instance's period (Monday, or the 1st for monthly). */
    weekStart: text('week_start'),
    /** Tells instances of one period apart (SPEC §6.1). */
    occurrence: integer('occurrence').notNull().default(0),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('tasks_completed_at_idx').on(table.completedAt),
    index('tasks_list_id_idx').on(table.listId),
    // One instance per template, period and occurrence (SPEC §6.1).
    uniqueIndex('tasks_recurring_period_idx').on(
      table.recurringId,
      table.weekStart,
      table.occurrence,
    ),
  ],
);

export const recurringTasks = sqliteTable('recurring_tasks', {
  id: text('id').primaryKey(),
  listId: text('list_id').references(() => lists.id),
  title: text('title').notNull(),
  notes: text('notes'),
  priority: text('priority').$type<Priority>().notNull().default('medium'),
  period: text('period').$type<RecurringPeriod>().notNull().default('week'),
  mode: text('mode').$type<RecurringMode>().notNull(),
  weekday: integer('weekday').$type<Weekday>(),
  monthDays: text('month_days', { mode: 'json' }).$type<number[]>().notNull().default([]),
  timesPerMonth: integer('times_per_month'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  activeFrom: text('active_from').notNull(),
  generatedThrough: text('generated_through'),
  /** Share of the weekly coin budget, 1–10 (SPEC §13.3). */
  weight: integer('weight').notNull().default(5),
  createdAt: text('created_at').notNull(),
});

export const habits = sqliteTable('habits', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').$type<ListColor>().notNull(),
  icon: text('icon'),
  frequency: text('frequency').$type<HabitFrequency>().notNull(),
  weekdays: text('weekdays', { mode: 'json' }).$type<Weekday[]>().notNull().default([]),
  target: integer('target'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  /** Share of the weekly coin budget, 1–10 (SPEC §13.3). */
  weight: integer('weight').notNull().default(5),
  /** Its own tick animation; null = the one chosen in Settings (SPEC §13.12). */
  tickAnimation: text('tick_animation'),
  createdAt: text('created_at').notNull(),
});

export const habitChecks = sqliteTable(
  'habit_checks',
  {
    habitId: text('habit_id')
      .notNull()
      .references(() => habits.id),
    date: text('date').notNull(),
  },
  (table) => [primaryKey({ columns: [table.habitId, table.date] })],
);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  lastRenewedAt: text('last_renewed_at').notNull(),
});

export const loginAttempts = sqliteTable('login_attempts', {
  ip: text('ip').primaryKey(),
  failedCount: integer('failed_count').notNull(),
  firstFailedAt: text('first_failed_at').notNull(),
  lockedUntil: text('locked_until'),
});

// ---------------------------------------------------------------- Gamification (SPEC §13)

/** Small key/value settings, e.g. whether the one-time catch-up has run. Values are JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

/** One per week from the start date: the budget it was computed with (13.3). */
export const weekSnapshots = sqliteTable('week_snapshots', {
  weekStart: text('week_start').primaryKey(),
  budget: integer('budget').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Locked weight and value per completion of every item in a week (13.3). */
export const weekSnapshotItems = sqliteTable(
  'week_snapshot_items',
  {
    weekStart: text('week_start').notNull(),
    itemType: text('item_type').$type<EconomyItemType>().notNull(),
    itemId: text('item_id').notNull(),
    weight: integer('weight').notNull(),
    valuePerCompletion: integer('value_per_completion').notNull(),
  },
  (table) => [primaryKey({ columns: [table.weekStart, table.itemType, table.itemId] })],
);

/**
 * Every coin, shard, XP and box movement, under a unique key that is never
 * paid twice (13.4). The wallet is the sum of these rows.
 */
export const rewardsLedger = sqliteTable(
  'rewards_ledger',
  {
    key: text('key').primaryKey(),
    kind: text('kind').$type<LedgerKind>().notNull(),
    itemId: text('item_id'),
    /** The day it belongs to (tick date, weekly task's week start, or the day it happened). */
    date: text('date').notNull(),
    coins: integer('coins').notNull().default(0),
    shards: integer('shards').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    boxes: integer('boxes').notNull().default(0),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('rewards_ledger_date_idx').on(table.date),
    index('rewards_ledger_item_idx').on(table.kind, table.itemId),
  ],
);

/** Things owned: mystery boxes now; freezes, vacation days and more later (13.14). */
export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<InventoryItemType>().notNull(),
    status: text('status').$type<InventoryStatus>().notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    source: text('source').$type<InventorySource>().notNull(),
    /** The ledger key that granted it; with `sourceIndex` it makes granting idempotent. */
    sourceKey: text('source_key').notNull(),
    sourceIndex: integer('source_index').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('inventory_source_idx').on(table.sourceKey, table.sourceIndex)],
);

/** My real-life rewards in the Shop (13.6). */
export const shopRewards = sqliteTable('shop_rewards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  icon: text('icon').$type<RewardIcon>().notNull(),
  sortOrder: integer('sort_order').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

/** Periods covered by a streak freeze (13.9). One freeze per habit and period. */
export const freezesUsed = sqliteTable(
  'freezes_used',
  {
    habitId: text('habit_id').notNull(),
    periodStart: text('period_start').notNull(),
    inventoryItemId: text('inventory_item_id').notNull().unique(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.habitId, table.periodStart] })],
);

/** Days all habits are paused (13.9). The date is the key, so a day can't be used twice. */
export const vacationDays = sqliteTable('vacation_days', {
  date: text('date').primaryKey(),
  inventoryItemId: text('inventory_item_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});

/**
 * One row per opened box, keyed by the box: the result is decided on the server,
 * stored, and only then animated, so a box can never be opened twice (13.7).
 */
export const boxOpenings = sqliteTable('box_openings', {
  boxId: text('box_id').primaryKey(),
  /** The request that opened it; its grants only apply if this row is theirs. */
  attempt: text('attempt').notNull(),
  type: text('type').$type<BoxResult['type']>().notNull(),
  tier: text('tier').$type<Tier>(),
  pieceId: text('piece_id'),
  seasonId: text('season_id'),
  duplicate: integer('duplicate', { mode: 'boolean' }).notNull().default(false),
  shards: integer('shards').notNull().default(0),
  coins: integer('coins').notNull().default(0),
  rewardId: text('reward_id'),
  rewardName: text('reward_name'),
  cosmeticId: text('cosmetic_id'),
  charmUsed: integer('charm_used', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

/** Art pieces I own (13.13). */
export const ownedPieces = sqliteTable('owned_pieces', {
  pieceId: text('piece_id').primaryKey(),
  seasonId: text('season_id').notNull(),
  acquiredAt: text('acquired_at').notNull(),
  source: text('source').$type<'box' | 'shards'>().notNull(),
});

/** Cosmetics I own, forever (13.12). */
export const ownedCosmetics = sqliteTable('owned_cosmetics', {
  cosmeticId: text('cosmetic_id').primaryKey(),
  acquiredAt: text('acquired_at').notNull(),
  source: text('source').$type<'purchase' | 'box'>().notNull(),
  /** The ledger key of the purchase, or the box that gave it. */
  sourceKey: text('source_key').notNull(),
});
