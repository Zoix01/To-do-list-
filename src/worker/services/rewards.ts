import { and, between, count, eq, gte, inArray, isNotNull, sum } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { addDays, dateInZone, endOfMonth, mondayOf, startOfMonth } from '../../shared/dates';
import { GAMIFICATION_START } from '../../shared/economy';
import { shopPrices } from '../../shared/shop';
import {
  catchUpEntries,
  itemKey,
  levelEntries,
  levelInfo,
  rewardEntries,
  snapshotItems,
  templateRules,
  snapshotValues,
  targetPeriodStart,
  tickPay,
  tickReward,
  weeklyReward,
  type EconomyItemType,
  type LedgerEntry,
} from '../../shared/rewards';
import type {
  EarnedReward,
  Habit,
  ISODate,
  ItemRewardInfo,
  RewardsSummary,
  Task,
} from '../../shared/types';
import {
  habitChecks,
  habits,
  inventoryItems,
  recurringTasks,
  rewardsLedger,
  settings,
  tasks,
  weekSnapshotItems,
  weekSnapshots,
} from '../db/schema';
import type { Db, Env } from '../env';
import { loadOwnedCosmetics, loadTickAnimation } from './cosmetics';
import { loadEconomy, loadMarks, marksFor, settleAllFreezes } from './inventory';

/*
 * Gamification on the server (SPEC §13): week snapshots, payouts into the
 * ledger, the one-time catch-up and the wallet summary. The rules themselves
 * are pure functions in shared/rewards.ts.
 */

export interface RewardsContext {
  db: Db;
  today: ISODate;
  timeZone: string;
  /** GAMIFICATION_START, or REWARDS_START for local testing. */
  start: ISODate;
}

export function rewardsStart(env: Env): ISODate {
  return env.REWARDS_START ?? GAMIFICATION_START;
}

const SETTING_CAUGHT_UP = 'catchUpDone';

async function readSetting<T>(db: Db, key: string): Promise<T | undefined> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value as T | undefined;
}

async function weeklyBudget(db: Db): Promise<number> {
  return (await loadEconomy(db)).weeklyBudget;
}

// ---------------------------------------------------------------- Week snapshots (13.3)

type Values = Map<string, number>;

async function loadSnapshot(db: Db, weekStart: ISODate): Promise<Values | null> {
  const [snapshot, items] = await db.batch([
    db.select().from(weekSnapshots).where(eq(weekSnapshots.weekStart, weekStart)),
    db.select().from(weekSnapshotItems).where(eq(weekSnapshotItems.weekStart, weekStart)),
  ]);
  if (snapshot.length === 0) return null;
  return new Map(
    items.map((item) => [itemKey(item.itemType, item.itemId), item.valuePerCompletion]),
  );
}

/** The snapshot of a week, created from the current items if it doesn't exist yet. */
async function ensureSnapshot(ctx: RewardsContext, weekStart: ISODate): Promise<Values> {
  const existing = await loadSnapshot(ctx.db, weekStart);
  if (existing) return existing;
  const { db, timeZone } = ctx;
  const [habitRows, templateRows] = await db.batch([
    db.select().from(habits),
    db.select().from(recurringTasks),
  ]);
  const createdOn = (createdAt: string) => dateInZone(new Date(createdAt), timeZone);
  const items = snapshotItems(
    habitRows.map((habit) => ({ ...habit, createdOn: createdOn(habit.createdAt), rules: habit })),
    templateRows.map((template) => ({
      ...template,
      createdOn: createdOn(template.createdAt),
      rules: templateRules(template),
    })),
    weekStart,
  );
  const budget = await weeklyBudget(db);
  const values = snapshotValues(items, budget);
  const statements: BatchItem<'sqlite'>[] = [
    db
      .insert(weekSnapshots)
      .values({ weekStart, budget, createdAt: new Date().toISOString() })
      .onConflictDoNothing(),
  ];
  // D1 allows at most 100 bound parameters per statement (5 per row).
  for (let i = 0; i < items.length; i += 18) {
    statements.push(
      db
        .insert(weekSnapshotItems)
        .values(
          items.slice(i, i + 18).map((item) => ({
            weekStart,
            itemType: item.type,
            itemId: item.id,
            weight: item.importance,
            valuePerCompletion: values.get(itemKey(item.type, item.id))!,
          })),
        )
        .onConflictDoNothing(),
    );
  }
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  // Read back, in case another request created it at the same moment.
  return (await loadSnapshot(db, weekStart)) ?? values;
}

async function valueOf(
  ctx: RewardsContext,
  type: EconomyItemType,
  id: string,
  weekStart: ISODate,
): Promise<number | null> {
  // The week the rewards start in counts, even when they start mid-week.
  if (addDays(weekStart, 6) < ctx.start) return null;
  return (await ensureSnapshot(ctx, weekStart)).get(itemKey(type, id)) ?? null;
}

// ---------------------------------------------------------------- Writing to the ledger

interface Written {
  /** Keys that were new (everything else had been paid before). */
  inserted: Set<string>;
  levelUps: number[];
}

/**
 * Inserts entries under their unique keys (existing keys are skipped) and grants
 * their boxes in the same batch, then grants any level reached since.
 */
async function writeEntries(db: Db, entries: LedgerEntry[], today: ISODate): Promise<Written> {
  const inserted = await insertEntries(db, entries);
  const [totals] = await db.select({ xp: sum(rewardsLedger.xp) }).from(rewardsLedger);
  const levels = await insertEntries(db, levelEntries(Number(totals?.xp ?? 0), today));
  for (const key of levels) inserted.add(key);
  return {
    inserted,
    levelUps: [...levels].map((key) => Number(key.slice('level:'.length))).sort((a, b) => a - b),
  };
}

async function insertEntries(db: Db, entries: LedgerEntry[]): Promise<Set<string>> {
  const inserted = new Set<string>();
  if (entries.length === 0) return inserted;
  const now = new Date().toISOString();
  const statements: BatchItem<'sqlite'>[] = [];
  const ledgerStatements: number[] = [];
  for (const entry of entries) {
    ledgerStatements.push(statements.length);
    statements.push(
      db
        .insert(rewardsLedger)
        .values({ ...entry, shards: 0, createdAt: now })
        .onConflictDoNothing()
        .returning({ key: rewardsLedger.key }),
    );
    if (entry.boxes > 0) {
      statements.push(
        db
          .insert(inventoryItems)
          .values(
            Array.from({ length: entry.boxes }, (_, index) => ({
              id: crypto.randomUUID(),
              type: 'box' as const,
              status: 'owned' as const,
              payload: null,
              source: entry.kind === 'level' ? ('level' as const) : ('milestone' as const),
              sourceKey: entry.key,
              sourceIndex: index,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .onConflictDoNothing(),
      );
    }
  }
  // D1 runs a batch as one transaction: a ledger row and its boxes are written together.
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    const results = (await db.batch(
      chunk as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]],
    )) as unknown[];
    for (const index of ledgerStatements) {
      if (index < i || index >= i + chunk.length) continue;
      for (const row of results[index - i] as { key: string }[]) inserted.add(row.key);
    }
  }
  return inserted;
}

/** The parts of a reward that were actually paid now, for the client's animations. */
function earned(entries: LedgerEntry[], written: Written, payoutKey: string): EarnedReward {
  const payout = entries.find((entry) => entry.key === payoutKey);
  return {
    coins: payout && written.inserted.has(payoutKey) ? payout.coins : 0,
    multiplier: Number(payout?.detail?.multiplier ?? 1),
    milestones: entries
      .filter(
        (entry) =>
          (entry.kind === 'streak' || entry.kind === 'count') && written.inserted.has(entry.key),
      )
      .map((entry) => ({
        kind: entry.kind as 'streak' | 'count',
        threshold: Number(entry.detail?.threshold),
        boxes: entry.boxes,
      })),
    levelUps: written.levelUps,
  };
}

const NOTHING: EarnedReward = { coins: 0, multiplier: 1, milestones: [], levelUps: [] };

// ---------------------------------------------------------------- Payouts (13.4)

/** Ticks paid for a habit in the per_week / per_month period containing `date`. */
async function paidInPeriod(db: Db, habit: Habit, date: ISODate): Promise<number> {
  const periodStart = targetPeriodStart(habit, date);
  if (!periodStart) return 0;
  const periodEnd = habit.frequency === 'per_week' ? addDays(periodStart, 6) : endOfMonth(date);
  const [row] = await db
    .select({ n: count() })
    .from(rewardsLedger)
    .where(
      and(
        eq(rewardsLedger.kind, 'tick'),
        eq(rewardsLedger.itemId, habit.id),
        between(rewardsLedger.date, periodStart, periodEnd),
      ),
    );
  return row?.n ?? 0;
}

async function ledgerHas(db: Db, key: string): Promise<boolean> {
  const row = await db
    .select({ key: rewardsLedger.key })
    .from(rewardsLedger)
    .where(eq(rewardsLedger.key, key))
    .get();
  return Boolean(row);
}

/**
 * Pays a tick of `habit` on `date`. `checksBefore` are the habit's checks
 * before this request (so a repeated tick earns nothing).
 */
export async function payTick(
  ctx: RewardsContext,
  habit: Habit,
  checksBefore: Set<ISODate>,
  date: ISODate,
): Promise<EarnedReward> {
  if (ctx.today < ctx.start) return NOTHING;
  const key = `tick:${habit.id}:${date}`;
  // Freezes and vacation days keep streaks going, so they shape the multiplier and milestones.
  await settleAllFreezes(ctx.db, ctx.today);
  const marks = marksFor(await loadMarks(ctx.db), habit.id);
  const reward = tickReward({
    marks,
    habitId: habit.id,
    rules: habit,
    checksBefore,
    date,
    today: ctx.today,
    start: ctx.start,
    value: await valueOf(ctx, 'habit', habit.id, mondayOf(date)),
    paidInPeriod: await paidInPeriod(ctx.db, habit, date),
    alreadyPaid: await ledgerHas(ctx.db, key),
  });
  const entries = rewardEntries({ key, kind: 'tick', itemId: habit.id, date }, reward, ctx.today);
  return earned(entries, await writeEntries(ctx.db, entries, ctx.today), key);
}

/** Pays a just-completed weekly-task instance. */
export async function payWeekly(ctx: RewardsContext, task: Task): Promise<EarnedReward> {
  if (ctx.today < ctx.start || !task.recurringId) return NOTHING;
  // A recurring task pays the value of the week its deadline falls in (SPEC §6.1).
  const week = mondayOf(task.deadline);
  const key = `weekly:${task.id}`;
  const [done] = await ctx.db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.recurringId, task.recurringId), isNotNull(tasks.completedAt)));
  const reward = weeklyReward({
    templateId: task.recurringId,
    weekStart: week,
    value: await valueOf(ctx, 'weekly', task.recurringId, week),
    completedBefore: Math.max(0, (done?.n ?? 1) - 1),
    alreadyPaid: await ledgerHas(ctx.db, key),
    today: ctx.today,
    start: ctx.start,
  });
  const entries = rewardEntries(
    { key, kind: 'weekly', itemId: task.recurringId, date: week },
    reward,
    ctx.today,
  );
  return earned(entries, await writeEntries(ctx.db, entries, ctx.today), key);
}

// ---------------------------------------------------------------- Lazy weekly work and catch-up

/** Weeks already prepared by this Worker instance, so most requests skip the queries. */
const preparedWeeks = new Set<string>();

/**
 * Called on every API request: creates this week's snapshot before anything can
 * change it, and runs the one-time catch-up once rewards have started (13.2).
 */
export async function prepareRewards(ctx: RewardsContext): Promise<void> {
  if (ctx.today < ctx.start) return;
  const weekStart = mondayOf(ctx.today);
  if (preparedWeeks.has(weekStart)) return;
  await ensureSnapshot(ctx, weekStart);
  if (!(await readSetting<boolean>(ctx.db, SETTING_CAUGHT_UP))) await catchUp(ctx);
  preparedWeeks.add(weekStart);
}

/** Pays everything from the start date up to today as if rewards had been live (13.2). */
async function catchUp(ctx: RewardsContext): Promise<void> {
  const { db, start, today, timeZone } = ctx;
  const snapshots = new Map<ISODate, Values>();
  for (let week = mondayOf(start); week <= today; week = addDays(week, 7)) {
    snapshots.set(week, await ensureSnapshot(ctx, week));
  }
  const [habitRows, checkRows, doneRows] = await db.batch([
    db.select().from(habits),
    db.select().from(habitChecks),
    db
      .select()
      .from(tasks)
      .where(and(isNotNull(tasks.recurringId), isNotNull(tasks.completedAt)))
      .orderBy(tasks.completedAt),
  ]);
  const entries = catchUpEntries({
    habits: habitRows.map((habit) => ({
      id: habit.id,
      rules: habit,
      checks: checkRows.filter((check) => check.habitId === habit.id).map((check) => check.date),
    })),
    weekly: doneRows.flatMap((task) =>
      task.recurringId && task.completedAt
        ? [
            {
              taskId: task.id,
              templateId: task.recurringId,
              weekStart: mondayOf(task.deadline),
              completedOn: dateInZone(new Date(task.completedAt), timeZone),
            },
          ]
        : [],
    ),
    valueOf: (type, id, weekStart) => snapshots.get(weekStart)?.get(itemKey(type, id)) ?? null,
    start,
    today,
  });
  // The entries include the level-ups reached along the way.
  await insertEntries(db, entries);
  await db
    .insert(settings)
    .values({ key: SETTING_CAUGHT_UP, value: true })
    .onConflictDoUpdate({ target: settings.key, set: { value: true } });
}

// ---------------------------------------------------------------- Summary for the header (13.10)

export async function rewardsSummary(ctx: RewardsContext): Promise<RewardsSummary> {
  const { db, today } = ctx;
  const weekStart = mondayOf(today);
  const started = today >= ctx.start;
  // Ticks paid in the running week or month, for the per_week / per_month caps.
  const periodFrom = startOfMonth(today) < weekStart ? startOfMonth(today) : weekStart;
  const [totals, weekRows, boxRows, habitRows, checkRows, templateRows, recentTicks] =
    await db.batch([
      db
        .select({
          coins: sum(rewardsLedger.coins),
          shards: sum(rewardsLedger.shards),
          xp: sum(rewardsLedger.xp),
        })
        .from(rewardsLedger),
      db
        .select({ coins: sum(rewardsLedger.coins) })
        .from(rewardsLedger)
        .where(
          and(
            inArray(rewardsLedger.kind, ['tick', 'weekly']),
            between(rewardsLedger.date, weekStart, addDays(weekStart, 6)),
          ),
        ),
      db
        .select({ n: count() })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.type, 'box'), eq(inventoryItems.status, 'owned'))),
      db.select().from(habits).where(eq(habits.archived, false)),
      db.select().from(habitChecks),
      db.select().from(recurringTasks).where(eq(recurringTasks.active, true)),
      db
        .select({ key: rewardsLedger.key, itemId: rewardsLedger.itemId, date: rewardsLedger.date })
        .from(rewardsLedger)
        .where(and(eq(rewardsLedger.kind, 'tick'), gte(rewardsLedger.date, periodFrom))),
    ]);

  const snapshot = started ? await ensureSnapshot(ctx, weekStart) : new Map<string, number>();
  const [snapshotRow] = started
    ? await db.select().from(weekSnapshots).where(eq(weekSnapshots.weekStart, weekStart))
    : [];
  const economy = await loadEconomy(db);
  const budget = economy.weeklyBudget;
  const xp = Number(totals[0]?.xp ?? 0);
  await settleAllFreezes(db, today);
  const marks = await loadMarks(db);

  const habitInfo: Record<string, ItemRewardInfo> = {};
  for (const habit of habitRows) {
    const value = snapshot.get(itemKey('habit', habit.id)) ?? null;
    const checks = new Set(checkRows.filter((c) => c.habitId === habit.id).map((c) => c.date));
    const periodStart = targetPeriodStart(habit, today);
    const nextTick =
      !started || checks.has(today)
        ? null
        : tickPay({
            rules: habit,
            marks: marksFor(marks, habit.id),
            checks: new Set(checks).add(today),
            date: today,
            today,
            start: ctx.start,
            value,
            paidInPeriod: periodStart
              ? recentTicks.filter(
                  (tick) =>
                    tick.itemId === habit.id &&
                    tick.date >= periodStart &&
                    (habit.frequency === 'per_week'
                      ? tick.date <= addDays(periodStart, 6)
                      : tick.date <= endOfMonth(today)),
                ).length
              : 0,
          });
    habitInfo[habit.id] = { inSnapshot: value !== null, value, nextTick };
  }
  const weeklyInfo: Record<string, ItemRewardInfo> = {};
  for (const template of templateRows) {
    const value = snapshot.get(itemKey('weekly', template.id)) ?? null;
    weeklyInfo[template.id] = { inSnapshot: value !== null, value, nextTick: null };
  }

  return {
    start: ctx.start,
    started,
    coins: Number(totals[0]?.coins ?? 0),
    shards: Number(totals[0]?.shards ?? 0),
    xp,
    ...levelInfo(xp),
    boxes: boxRows[0]?.n ?? 0,
    week: {
      start: weekStart,
      earned: Number(weekRows[0]?.coins ?? 0),
      budget: snapshotRow?.budget ?? budget,
    },
    nextBudget: budget,
    economy,
    prices: shopPrices(economy),
    vacationDays: [...marks.vacation].sort(),
    cosmetics: [...(await loadOwnedCosmetics(db))].sort(),
    tickAnimation: await loadTickAnimation(db),
    habits: habitInfo,
    weekly: weeklyInfo,
  };
}
