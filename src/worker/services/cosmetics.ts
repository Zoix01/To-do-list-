import { eq, sql } from 'drizzle-orm';
import {
  animationAvailable,
  normalizeAnimation,
  colorAvailable,
  findCosmetic,
  iconAvailable,
} from '../../shared/cosmetics';
import { REFUND_WINDOW_SECONDS } from '../../shared/economy';
import { shopPrices } from '../../shared/shop';
import type { ISODate } from '../../shared/types';
import { habits, lists, ownedCosmetics, settings } from '../db/schema';
import type { Db } from '../env';
import { badRequest, jsonError, notFound } from '../http';
import { eventIf, loadEconomy, transaction } from './inventory';

/*
 * Cosmetics and appearance / economy settings (SPEC §13.2, §13.12). Cosmetics
 * aren't inventory items: they unlock right away and are owned forever.
 */

export async function loadOwnedCosmetics(db: Db): Promise<Set<string>> {
  const rows = await db.select({ id: ownedCosmetics.cosmeticId }).from(ownedCosmetics);
  return new Set(rows.map((row) => row.id));
}

export async function loadTickAnimation(db: Db): Promise<string> {
  const row = await db.select().from(settings).where(eq(settings.key, 'tickAnimation')).get();
  return normalizeAnimation(row?.value);
}

async function saveSetting(db: Db, key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Extra list colors and locked habit icons need to be owned (13.12). */
export async function assertCosmeticsAvailable(
  db: Db,
  input: { color?: string; icon?: string | null; tickAnimation?: string | null },
): Promise<void> {
  if (input.color === undefined && !input.icon && !input.tickAnimation) return;
  const owned = await loadOwnedCosmetics(db);
  if (input.color !== undefined && !colorAvailable(input.color, owned)) {
    throw badRequest('Unlock this color in the Shop first');
  }
  if (input.icon && !iconAvailable(input.icon, owned)) {
    throw badRequest('Unlock this icon in the Shop first');
  }
  if (input.tickAnimation && !animationAvailable(input.tickAnimation, owned)) {
    throw badRequest('Unlock this animation in the Shop first');
  }
}

/** Buys a cosmetic at the cosmetic price; a repeated request or an owned one buys nothing. */
export async function buyCosmetic(
  db: Db,
  today: ISODate,
  cosmeticId: string,
  requestId: string,
): Promise<void> {
  const cosmetic = findCosmetic(cosmeticId);
  if (!cosmetic) throw notFound('Cosmetic not found');
  const price = shopPrices(await loadEconomy(db)).cosmetic;
  const key = `buy:${requestId}`;
  const now = new Date().toISOString();
  await transaction(db, [
    eventIf(
      {
        key,
        kind: 'buy',
        itemId: cosmeticId,
        date: today,
        coins: -price,
        detail: { item: 'cosmetic', cosmeticId, name: cosmetic.name },
      },
      sql`(SELECT COALESCE(SUM(coins), 0) FROM rewards_ledger) >= ${price}
        AND NOT EXISTS (SELECT 1 FROM owned_cosmetics WHERE cosmetic_id = ${cosmeticId})`,
      now,
    ),
    sql`
      INSERT INTO owned_cosmetics (cosmetic_id, acquired_at, source, source_key)
      SELECT ${cosmeticId}, ${now}, 'purchase', ${key}
      WHERE EXISTS (SELECT 1 FROM rewards_ledger WHERE key = ${key})
      ON CONFLICT DO NOTHING`,
  ]);
  const owned = await db
    .select()
    .from(ownedCosmetics)
    .where(eq(ownedCosmetics.cosmeticId, cosmeticId))
    .get();
  if (!owned || owned.sourceKey !== key) {
    throw jsonError(409, owned ? 'You already own this' : 'Not enough coins');
  }
}

/** Undo buying a cosmetic shortly after, if it isn't in use yet (13.6). */
export async function refundCosmetic(db: Db, today: ISODate, cosmeticId: string): Promise<void> {
  const cosmetic = findCosmetic(cosmeticId);
  if (!cosmetic) throw notFound('Cosmetic not found');
  const inUse =
    (cosmetic.kind === 'animation' &&
      ((await loadTickAnimation(db)) === cosmetic.value ||
        (await db.select().from(habits).where(eq(habits.tickAnimation, cosmetic.value)).get()))) ||
    (cosmetic.kind === 'color' &&
      ((await db
        .select()
        .from(lists)
        .where(eq(lists.color, cosmetic.value as never))
        .get()) ||
        (await db
          .select()
          .from(habits)
          .where(eq(habits.color, cosmetic.value as never))
          .get()))) ||
    (cosmetic.kind === 'icon' &&
      (await db.select().from(habits).where(eq(habits.icon, cosmetic.value)).get()));
  if (inUse) throw jsonError(409, 'It’s already in use, so it can’t be undone');
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - REFUND_WINDOW_SECONDS * 1000).toISOString();
  await transaction(db, [
    sql`
      INSERT INTO rewards_ledger (key, kind, item_id, date, coins, shards, xp, boxes, detail, created_at)
      SELECT 'refund:' || c.source_key, 'refund', c.cosmetic_id, ${today}, -l.coins, 0, 0, 0, l.detail, ${now}
      FROM owned_cosmetics c JOIN rewards_ledger l ON l.key = c.source_key
      WHERE c.cosmetic_id = ${cosmeticId} AND c.source = 'purchase' AND c.acquired_at >= ${cutoff}
      ON CONFLICT DO NOTHING`,
    sql`
      DELETE FROM owned_cosmetics WHERE cosmetic_id = ${cosmeticId}
        AND EXISTS (SELECT 1 FROM rewards_ledger WHERE key = 'refund:' || owned_cosmetics.source_key)`,
  ]);
  if (
    await db.select().from(ownedCosmetics).where(eq(ownedCosmetics.cosmeticId, cosmeticId)).get()
  ) {
    throw jsonError(409, 'This can’t be undone any more');
  }
}

export async function setTickAnimation(db: Db, animation: string): Promise<void> {
  if (!animationAvailable(animation, await loadOwnedCosmetics(db))) {
    throw badRequest('Unlock this animation in the Shop first');
  }
  await saveSetting(db, 'tickAnimation', animation);
}

/** Settings → Gamification: the budget applies from the next snapshot, prices right away (13.18). */
export async function setEconomy(
  db: Db,
  economy: { weeklyBudget: number; expectedRate: number },
): Promise<void> {
  await saveSetting(db, 'weeklyBudget', economy.weeklyBudget);
  await saveSetting(db, 'expectedRate', economy.expectedRate);
}
