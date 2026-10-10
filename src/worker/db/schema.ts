import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ListColor, Priority } from '../../shared/types';

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
    weekStart: text('week_start'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('tasks_completed_at_idx').on(table.completedAt),
    index('tasks_list_id_idx').on(table.listId),
    // One instance per weekly template per week (SPEC §6).
    uniqueIndex('tasks_recurring_week_idx').on(table.recurringId, table.weekStart),
  ],
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
