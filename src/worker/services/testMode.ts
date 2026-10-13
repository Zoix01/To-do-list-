import { eq, sql } from 'drizzle-orm';
import { COSMETICS, HABIT_ICONS } from '../../shared/cosmetics';
import { isISODate } from '../../shared/dates';
import { LIST_COLORS, type ISODate } from '../../shared/types';
import { settings } from '../db/schema';
import type { Db, Env } from '../env';
import { transaction } from './inventory';

/*
 * An optional test period before the rewards start (SPEC §13.18): with
 * TEST_UNTIL and TEST_COINS set (wrangler.jsonc vars), the Shop, Inventory and
 * Gallery can be tried with a one-time coin grant until TEST_UNTIL. On the first
 * request on or after that day, everything the test produced is wiped, so the
 * real start begins from zero. Ticks never earn during the test.
 */

export interface TestPeriod {
  until: ISODate;
  coins: number;
}

export function testPeriod(env: Env): TestPeriod | null {
  const until = env.TEST_UNTIL;
  const coins = Number(env.TEST_COINS ?? 0);
  if (!until || !isISODate(until)) return null;
  return { until, coins: Number.isFinite(coins) && coins > 0 ? Math.round(coins) : 0 };
}

export function testActive(test: TestPeriod | null, today: ISODate): boolean {
  return Boolean(test && today < test.until);
}

/** The one-time test grant, under a fixed ledger key so it's paid once. */
export async function grantTestCoins(db: Db, today: ISODate, test: TestPeriod): Promise<void> {
  if (test.coins === 0) return;
  await transaction(db, [
    sql`
      INSERT INTO rewards_ledger (key, kind, item_id, date, coins, shards, xp, boxes, detail, created_at)
      VALUES ('test:grant', 'buy', NULL, ${today}, ${test.coins}, 0, 0, 0,
        ${JSON.stringify({ item: 'test', name: 'Test coins' })}, ${new Date().toISOString()})
      ON CONFLICT DO NOTHING`,
  ]);
}

/**
 * Wipes everything the test produced, once: coins and the whole ledger, items,
 * opened boxes, art pieces, cosmetics, freezes and vacation days. Habits and
 * lists that used an unlocked color, icon or animation go back to defaults.
 * Real-life reward definitions and the economy settings stay.
 */
export async function resetAfterTest(db: Db): Promise<boolean> {
  const done = await db.select().from(settings).where(eq(settings.key, 'testResetDone')).get();
  if (done) return false;
  const extraColors = COSMETICS.filter((c) => c.kind === 'color').map((c) => c.value);
  const lockedIcons = HABIT_ICONS.filter((icon) => !icon.free).map((icon) => icon.name);
  const inList = (values: string[]) =>
    sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    );
  await transaction(db, [
    sql`DELETE FROM rewards_ledger`,
    sql`DELETE FROM inventory_items`,
    sql`DELETE FROM box_openings`,
    sql`DELETE FROM owned_pieces`,
    sql`DELETE FROM owned_cosmetics`,
    sql`DELETE FROM freezes_used`,
    sql`DELETE FROM vacation_days`,
    sql`DELETE FROM week_snapshot_items`,
    sql`DELETE FROM week_snapshots`,
    sql`DELETE FROM settings WHERE key IN ('tickAnimation', 'catchUpDone')`,
    sql`UPDATE habits SET tick_animation = NULL`,
    sql`UPDATE habits SET icon = NULL WHERE icon IN (${inList(lockedIcons)})`,
    sql`UPDATE habits SET color = ${LIST_COLORS[0]} WHERE color IN (${inList(extraColors)})`,
    sql`UPDATE lists SET color = ${LIST_COLORS[0]} WHERE color IN (${inList(extraColors)})`,
    sql`INSERT INTO settings (key, value) VALUES ('testResetDone', 'true') ON CONFLICT DO NOTHING`,
  ]);
  return true;
}
