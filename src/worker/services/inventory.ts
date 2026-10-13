import { and, desc, eq, inArray, is, SQL, sql } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import { isISODate } from '../../shared/dates';
import { EXPECTED_RATE, REFUND_WINDOW_SECONDS, WEEKLY_BUDGET } from '../../shared/economy';
import { settleFreezes, type HabitMarks } from '../../shared/habits';
import { shopPrices, type Economy } from '../../shared/shop';
import type {
  HistoryEntry,
  InventoryItem,
  InventoryItemType,
  InventoryView,
  ISODate,
} from '../../shared/types';
import {
  freezesUsed,
  habitChecks,
  habits,
  inventoryItems,
  recurringTasks,
  rewardsLedger,
  settings,
  shopRewards,
  vacationDays,
} from '../db/schema';
import type { Db } from '../env';
import { badRequest, jsonError, notFound } from '../http';

/*
 * Shop, inventory, streak freezes and vacation days (SPEC §13.6, §13.9, §13.10).
 * Every spend, use and arm is one D1 batch (a transaction) whose statements
 * only act when the state is still right, so a double tap can never buy twice,
 * overspend or use an item twice.
 */

/** A Drizzle query or a raw SQL statement. */
type Statement = { toSQL(): { sql: string; params: unknown[] } } | SQL;

const dialect = new SQLiteAsyncDialect();

/**
 * Runs statements as one D1 batch, which D1 executes as a single transaction.
 * (Drizzle's own batch can't mix in raw SQL statements.)
 */
async function transaction(db: Db, statements: Statement[]): Promise<D1Result[]> {
  if (statements.length === 0) return [];
  const client = db.$client;
  return client.batch(
    statements.map((statement) => {
      const query = is(statement, SQL) ? dialect.sqlToQuery(statement) : statement.toSQL();
      return client.prepare(query.sql).bind(...query.params);
    }),
  );
}

// ---------------------------------------------------------------- Economy settings

export async function loadEconomy(db: Db): Promise<Economy> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ['weeklyBudget', 'expectedRate']));
  const value = (key: string) => rows.find((row) => row.key === key)?.value as number | undefined;
  return {
    weeklyBudget: value('weeklyBudget') ?? WEEKLY_BUDGET,
    expectedRate: value('expectedRate') ?? EXPECTED_RATE,
  };
}

// ---------------------------------------------------------------- Ledger events

interface Event {
  key: string;
  kind: 'buy' | 'refund' | 'use';
  itemId: string | null;
  date: ISODate;
  coins?: number;
  detail: Record<string, unknown>;
}

/** Writes a ledger row only if `condition` holds (in the same transaction); an existing key is skipped. */
function eventIf(event: Event, condition: SQL, now: string) {
  return sql`
    INSERT INTO rewards_ledger (key, kind, item_id, date, coins, shards, xp, boxes, detail, created_at)
    SELECT ${event.key}, ${event.kind}, ${event.itemId}, ${event.date}, ${event.coins ?? 0},
      0, 0, 0, ${JSON.stringify(event.detail)}, ${now}
    WHERE ${condition}
    ON CONFLICT DO NOTHING`;
}

const itemIs = (id: string, status: string, now: string) =>
  sql`EXISTS (SELECT 1 FROM inventory_items WHERE id = ${id} AND status = ${status} AND updated_at = ${now})`;

// ---------------------------------------------------------------- Habit marks (13.9)

export interface MarksData {
  vacation: Set<ISODate>;
  frozen: Map<string, Set<ISODate>>;
  armed: Map<string, number>;
}

export async function loadMarks(db: Db): Promise<MarksData> {
  const [vacationRows, frozenRows, armedRows] = await db.batch([
    db.select({ date: vacationDays.date }).from(vacationDays),
    db.select().from(freezesUsed),
    db
      .select({ payload: inventoryItems.payload })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.type, 'freeze'), eq(inventoryItems.status, 'armed'))),
  ]);
  const frozen = new Map<string, Set<ISODate>>();
  for (const row of frozenRows) {
    const set = frozen.get(row.habitId) ?? new Set<ISODate>();
    set.add(row.periodStart);
    frozen.set(row.habitId, set);
  }
  const armed = new Map<string, number>();
  for (const row of armedRows) {
    const habitId = String(row.payload?.habitId);
    armed.set(habitId, (armed.get(habitId) ?? 0) + 1);
  }
  return { vacation: new Set(vacationRows.map((row) => row.date)), frozen, armed };
}

export function marksFor(data: MarksData, habitId: string): HabitMarks {
  return { vacation: data.vacation, frozen: data.frozen.get(habitId) ?? new Set() };
}

/**
 * Uses armed freezes on periods that ended missed and returns freezes whose
 * period was back-filled (13.9). Deterministic, so it can run on any request.
 */
export async function settleAllFreezes(db: Db, today: ISODate): Promise<void> {
  const freezes = await db
    .select()
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.type, 'freeze'), inArray(inventoryItems.status, ['armed', 'consumed'])),
    );
  if (freezes.length === 0) return;
  const used = await db.select().from(freezesUsed);
  const habitIds = [...new Set(freezes.map((item) => String(item.payload?.habitId)))];
  const [checkRows, vacationRows] = await db.batch([
    db.select().from(habitChecks).where(inArray(habitChecks.habitId, habitIds)),
    db.select({ date: vacationDays.date }).from(vacationDays),
  ]);
  const vacation = new Set(vacationRows.map((row) => row.date));
  const habitRows = await db.select().from(habits).where(inArray(habits.id, habitIds));

  const now = new Date().toISOString();
  const statements: Statement[] = [];
  for (const habit of habitRows) {
    const mine = freezes.filter((item) => item.payload?.habitId === habit.id);
    const armedOn = (item: (typeof freezes)[number]) => String(item.payload?.armedOn);
    const settlement = settleFreezes(
      habit,
      new Set(checkRows.filter((c) => c.habitId === habit.id).map((c) => c.date)),
      today,
      vacation,
      used.flatMap((row) => {
        const item = mine.find((i) => i.id === row.inventoryItemId && i.status === 'consumed');
        return item ? [{ id: item.id, armedOn: armedOn(item), periodStart: row.periodStart }] : [];
      }),
      mine.filter((i) => i.status === 'armed').map((i) => ({ id: i.id, armedOn: armedOn(i) })),
    );
    for (const id of settlement.release) {
      const row = used.find((u) => u.inventoryItemId === id)!;
      statements.push(
        db.delete(freezesUsed).where(eq(freezesUsed.inventoryItemId, id)),
        db
          .update(inventoryItems)
          .set({
            status: 'armed',
            payload: { habitId: habit.id, armedOn: armedOn(mine.find((i) => i.id === id)!) },
            updatedAt: now,
          })
          .where(and(eq(inventoryItems.id, id), eq(inventoryItems.status, 'consumed'))),
        eventIf(
          {
            key: `use:${id}:returned:${row.periodStart}`,
            kind: 'use',
            itemId: id,
            date: today,
            detail: { action: 'freeze_returned', habitId: habit.id, periodStart: row.periodStart },
          },
          itemIs(id, 'armed', now),
          now,
        ),
      );
    }
    for (const { freezeId, periodStart } of settlement.consume) {
      const item = mine.find((i) => i.id === freezeId)!;
      statements.push(
        db
          .insert(freezesUsed)
          .values({ habitId: habit.id, periodStart, inventoryItemId: freezeId, createdAt: now })
          .onConflictDoNothing(),
        db
          .update(inventoryItems)
          .set({ status: 'consumed', payload: { ...item.payload, periodStart }, updatedAt: now })
          .where(
            and(
              eq(inventoryItems.id, freezeId),
              eq(inventoryItems.status, 'armed'),
              sql`EXISTS (SELECT 1 FROM freezes_used WHERE inventory_item_id = ${freezeId})`,
            ),
          ),
        eventIf(
          {
            key: `use:${freezeId}:frozen:${periodStart}`,
            kind: 'use',
            itemId: freezeId,
            date: today,
            detail: { action: 'freeze_used', habitId: habit.id, periodStart },
          },
          itemIs(freezeId, 'consumed', now),
          now,
        ),
      );
    }
  }
  await transaction(db, statements);
}

// ---------------------------------------------------------------- Buying (13.6)

export type BuyItem = 'freeze' | 'vacation' | 'reward';

export async function buy(
  db: Db,
  today: ISODate,
  input: { item: BuyItem; rewardId?: string; requestId: string },
): Promise<InventoryItem> {
  const prices = shopPrices(await loadEconomy(db));
  let price: number;
  let type: InventoryItemType;
  let payload: Record<string, unknown> | null = null;
  let name: string;
  if (input.item === 'reward') {
    const reward = input.rewardId
      ? await db.select().from(shopRewards).where(eq(shopRewards.id, input.rewardId)).get()
      : undefined;
    if (!reward || reward.archived) throw notFound('Reward not found');
    price = reward.price;
    type = 'reward';
    payload = { rewardId: reward.id, name: reward.name, price: reward.price, icon: reward.icon };
    name = reward.name;
  } else {
    price = prices[input.item];
    type = input.item;
    name = input.item === 'freeze' ? 'Streak freeze' : 'Vacation day';
  }

  const key = `buy:${input.requestId}`;
  const now = new Date().toISOString();
  await transaction(db, [
    eventIf(
      {
        key,
        kind: 'buy',
        itemId: input.rewardId ?? null,
        date: today,
        coins: -price,
        detail: { item: type, name },
      },
      sql`(SELECT COALESCE(SUM(coins), 0) FROM rewards_ledger) >= ${price}`,
      now,
    ),
    sql`
      INSERT INTO inventory_items (id, type, status, payload, source, source_key, source_index, created_at, updated_at)
      SELECT ${crypto.randomUUID()}, ${type}, 'owned', ${payload ? JSON.stringify(payload) : null},
        'purchase', ${key}, 0, ${now}, ${now}
      WHERE EXISTS (SELECT 1 FROM rewards_ledger WHERE key = ${key})
      ON CONFLICT DO NOTHING`,
  ]);
  const item = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.sourceKey, key))
    .get();
  if (!item) throw jsonError(409, 'Not enough coins');
  return item;
}

/** Undo a purchase shortly after it, if the item is still unused (13.6). */
export async function refund(db: Db, today: ISODate, id: string): Promise<void> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - REFUND_WINDOW_SECONDS * 1000).toISOString();
  await transaction(db, [
    sql`
      UPDATE inventory_items SET status = 'refunded', updated_at = ${now}
      WHERE id = ${id} AND source = 'purchase' AND status = 'owned' AND created_at >= ${cutoff}`,
    sql`
      INSERT INTO rewards_ledger (key, kind, item_id, date, coins, shards, xp, boxes, detail, created_at)
      SELECT 'refund:' || i.id, 'refund', l.item_id, ${today}, -l.coins, 0, 0, 0, l.detail, ${now}
      FROM inventory_items i JOIN rewards_ledger l ON l.key = i.source_key
      WHERE i.id = ${id} AND i.status = 'refunded'
      ON CONFLICT DO NOTHING`,
  ]);
  const refunded = await db
    .select({ key: rewardsLedger.key })
    .from(rewardsLedger)
    .where(eq(rewardsLedger.key, `refund:${id}`))
    .get();
  if (!refunded) throw jsonError(409, 'This can’t be undone any more');
}

// ---------------------------------------------------------------- Using items (13.9)

/** Moves an item from one status to another (if it is still in it) and records the event. */
async function transition(
  db: Db,
  today: ISODate,
  id: string,
  change: {
    type: InventoryItemType;
    from: InventoryItem['status'];
    to: InventoryItem['status'];
    payload: Record<string, unknown> | null;
    detail: Record<string, unknown>;
  },
  extra: {
    before?: (now: string) => Statement[];
    after?: (now: string) => Statement[];
  } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const before = extra.before?.(now) ?? [];
  const results = await transaction(db, [
    ...before,
    db
      .update(inventoryItems)
      .set({ status: change.to, payload: change.payload, updatedAt: now })
      .where(
        and(
          eq(inventoryItems.id, id),
          eq(inventoryItems.type, change.type),
          eq(inventoryItems.status, change.from),
        ),
      )
      .returning({ id: inventoryItems.id }),
    eventIf(
      {
        key: `use:${id}:${change.detail.action}:${now}`,
        kind: 'use',
        itemId: id,
        date: today,
        detail: change.detail,
      },
      itemIs(id, change.to, now),
      now,
    ),
    ...(extra.after?.(now) ?? []),
  ]);
  if ((results[before.length]?.results ?? []).length === 0)
    throw jsonError(409, 'This item can’t be used like that');
}

export async function armFreeze(db: Db, today: ISODate, id: string, habitId: string) {
  const habit = await db.select().from(habits).where(eq(habits.id, habitId)).get();
  if (!habit || habit.archived) throw notFound('Habit not found');
  await transition(db, today, id, {
    type: 'freeze',
    from: 'owned',
    to: 'armed',
    payload: { habitId, armedOn: today },
    detail: { action: 'arm', habitId },
  });
}

export async function unarmFreeze(db: Db, today: ISODate, id: string) {
  const item = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  await transition(db, today, id, {
    type: 'freeze',
    from: 'armed',
    to: 'owned',
    payload: null,
    detail: { action: 'unarm', habitId: item?.payload?.habitId ?? null },
  });
}

export async function useReward(db: Db, today: ISODate, id: string) {
  const item = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  await transition(db, today, id, {
    type: 'reward',
    from: 'owned',
    to: 'used',
    payload: { ...item?.payload, usedOn: today },
    detail: { action: 'reward_used', name: item?.payload?.name ?? null },
  });
}

/** Schedules a vacation day on `date` (today or later); each date only once. */
export async function scheduleVacation(db: Db, today: ISODate, id: string, date: string) {
  if (!isISODate(date)) throw badRequest('Invalid date');
  if (date < today) throw badRequest('Choose today or a later day');
  try {
    await transition(
      db,
      today,
      id,
      {
        type: 'vacation',
        from: 'owned',
        to: 'scheduled',
        payload: { date },
        detail: { action: 'vacation', date },
      },
      {
        before: (now) => [
          // Fails the whole batch on a date that already is a vacation day.
          sql`
          INSERT INTO vacation_days (date, inventory_item_id, created_at)
          SELECT ${date}, ${id}, ${now}
          WHERE EXISTS (SELECT 1 FROM inventory_items WHERE id = ${id} AND type = 'vacation' AND status = 'owned')`,
        ],
      },
    );
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      throw jsonError(409, 'That day already is a vacation day');
    throw error;
  }
}

/** Cancels a future vacation day; the item goes back to the inventory. */
export async function cancelVacation(db: Db, today: ISODate, id: string) {
  const item = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  const date = String(item?.payload?.date ?? '');
  if (!item || item.status !== 'scheduled') throw notFound('Vacation day not found');
  if (date <= today) throw badRequest('Only future vacation days can be cancelled');
  await transition(
    db,
    today,
    id,
    {
      type: 'vacation',
      from: 'scheduled',
      to: 'owned',
      payload: null,
      detail: { action: 'vacation_cancelled', date },
    },
    {
      after: (now) => [
        sql`
        DELETE FROM vacation_days WHERE inventory_item_id = ${id} AND ${itemIs(id, 'owned', now)}`,
      ],
    },
  );
}

// ---------------------------------------------------------------- Inventory and History (13.10)

export async function inventoryView(db: Db, today: ISODate): Promise<InventoryView> {
  const [items, ledger, habitRows, templateRows] = await db.batch([
    db
      .select()
      .from(inventoryItems)
      .where(inArray(inventoryItems.status, ['owned', 'armed', 'scheduled'])),
    db.select().from(rewardsLedger).orderBy(desc(rewardsLedger.createdAt)).limit(1000),
    db.select({ id: habits.id, name: habits.name, frequency: habits.frequency }).from(habits),
    db.select({ id: recurringTasks.id, name: recurringTasks.title }).from(recurringTasks),
  ]);
  const names = new Map<string, string>(
    [...habitRows, ...templateRows].map((row) => [row.id, row.name]),
  );
  const nameOf = (id: unknown) => (typeof id === 'string' ? (names.get(id) ?? null) : null);

  const history: HistoryEntry[] = [];
  // Tick income is summarized per day (13.10).
  const ticksByDay = new Map<ISODate, HistoryEntry>();
  for (const row of ledger) {
    if (row.kind === 'tick') {
      const day = ticksByDay.get(row.date);
      if (day) {
        day.coins += row.coins;
        day.detail = { count: Number(day.detail?.count) + 1 };
        if (row.createdAt > day.createdAt) day.createdAt = row.createdAt;
      } else {
        const entry: HistoryEntry = {
          key: `ticks:${row.date}`,
          kind: 'ticks',
          date: row.date,
          createdAt: row.createdAt,
          coins: row.coins,
          boxes: 0,
          name: null,
          detail: { count: 1 },
        };
        ticksByDay.set(row.date, entry);
        history.push(entry);
      }
      continue;
    }
    // Streak milestones need the habit's unit (days, weeks, months) to be read.
    const frequency = habitRows.find((habit) => habit.id === row.itemId)?.frequency;
    const detail =
      row.kind === 'streak' && frequency ? { ...row.detail, frequency } : (row.detail ?? null);
    history.push({
      key: row.key,
      kind: row.kind,
      date: row.date,
      createdAt: row.createdAt,
      coins: row.coins,
      boxes: row.boxes,
      name: typeof detail?.name === 'string' ? detail.name : nameOf(detail?.habitId ?? row.itemId),
      detail,
    });
  }
  // Newest first; entries written together (the catch-up) by the day they belong to.
  history.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date));

  return {
    // Vacation days in the past are spent; only today's and planned ones stay.
    items: items.filter(
      (item) => item.status !== 'scheduled' || String(item.payload?.date) >= today,
    ),
    history,
  };
}
