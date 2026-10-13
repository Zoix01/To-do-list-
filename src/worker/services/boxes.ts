import { and, eq, sql } from 'drizzle-orm';
import { canUseCharm, openBox, secureRng, type BoxResult } from '../../shared/boxes';
import { currentSeason, findPiece, piecePrice, piecesOf, type Season } from '../../shared/seasons';
import { shopPrices } from '../../shared/shop';
import type { BoxOpening, ISODate, OwnedPiece } from '../../shared/types';
import { boxOpenings, inventoryItems, ownedPieces, shopRewards } from '../db/schema';
import type { Db } from '../env';
import { badRequest, jsonError, notFound } from '../http';
import { eventIf, itemIs, loadEconomy, transaction, type Event } from './inventory';

/*
 * Mystery boxes, lucky charms and the Gallery (SPEC §13.7, §13.8, §13.13).
 * A box's result is rolled with a secure random generator, stored, and only
 * then shown; everything it grants is written in the same transaction, and
 * only if this request is the one that opened the box.
 */

async function ownedPieceIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ id: ownedPieces.pieceId }).from(ownedPieces);
  return new Set(rows.map((row) => row.id));
}

async function armedCharm(db: Db) {
  return db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.type, 'charm'), eq(inventoryItems.status, 'armed')))
    .get();
}

export async function loadOpening(db: Db, boxId: string): Promise<BoxOpening | undefined> {
  const row = await db.select().from(boxOpenings).where(eq(boxOpenings.boxId, boxId)).get();
  if (!row) return undefined;
  const { attempt: _attempt, ...opening } = row;
  return opening;
}

/** Opens a box from the Inventory; opening it again returns the same stored result. */
export async function openBoxItem(
  db: Db,
  today: ISODate,
  boxId: string,
  seasons: readonly Season[],
): Promise<BoxOpening> {
  const existing = await loadOpening(db, boxId);
  if (existing) return existing;
  const box = await db.select().from(inventoryItems).where(eq(inventoryItems.id, boxId)).get();
  if (!box || box.type !== 'box') throw notFound('Box not found');
  if (box.status !== 'owned') throw jsonError(409, 'This box was already opened');

  const season = currentSeason(seasons, today);
  const owned = await ownedPieceIds(db);
  const charm = await armedCharm(db);
  const rewards = await db
    .select({
      id: shopRewards.id,
      name: shopRewards.name,
      price: shopRewards.price,
      icon: shopRewards.icon,
    })
    .from(shopRewards)
    .where(eq(shopRewards.archived, false));
  const result: BoxResult = openBox(secureRng, {
    pieces: season ? piecesOf(season) : [],
    owned,
    rewards,
    // Cosmetics arrive in step 4 of §13.17; until then this result falls back to a coin pouch.
    unownedCosmetics: [],
    charm: Boolean(charm),
    boxPrice: shopPrices(await loadEconomy(db)).box,
  });
  const reward =
    result.type === 'reward' ? rewards.find((r) => r.id === result.rewardId) : undefined;
  const charmUsed = Boolean(charm) && result.type === 'piece' && !result.duplicate;

  const attempt = crypto.randomUUID();
  const now = new Date().toISOString();
  const mine = sql`EXISTS (SELECT 1 FROM box_openings WHERE box_id = ${boxId} AND attempt = ${attempt})`;
  const piece = result.type === 'piece' ? result : null;
  const statements = [
    sql`
      INSERT INTO box_openings (box_id, attempt, type, tier, piece_id, season_id, duplicate,
        shards, coins, reward_id, reward_name, cosmetic_id, charm_used, created_at)
      SELECT ${boxId}, ${attempt}, ${result.type}, ${piece?.tier ?? null}, ${piece?.pieceId ?? null},
        ${piece ? season!.id : null}, ${piece?.duplicate ? 1 : 0}, ${piece?.shards ?? 0},
        ${result.type === 'pouch' ? result.coins : 0}, ${reward?.id ?? null}, ${reward?.name ?? null},
        ${result.type === 'cosmetic' ? result.cosmeticId : null}, ${charmUsed ? 1 : 0}, ${now}
      WHERE EXISTS (SELECT 1 FROM inventory_items WHERE id = ${boxId} AND type = 'box' AND status = 'owned')
      ON CONFLICT DO NOTHING`,
    sql`UPDATE inventory_items SET status = 'opened', updated_at = ${now}
      WHERE id = ${boxId} AND status = 'owned' AND ${mine}`,
  ];
  const event: Event = {
    key: `box:${boxId}`,
    kind: 'box',
    itemId: boxId,
    date: today,
    coins: result.type === 'pouch' ? result.coins : 0,
    shards: piece?.shards ?? 0,
    detail: { ...result, name: reward?.name ?? null },
  };
  statements.push(eventIf(event, mine, now));
  if (piece && !piece.duplicate) {
    statements.push(sql`
      INSERT INTO owned_pieces (piece_id, season_id, acquired_at, source)
      SELECT ${piece.pieceId}, ${season!.id}, ${now}, 'box' WHERE ${mine}
      ON CONFLICT DO NOTHING`);
  }
  if (result.type === 'charm' || result.type === 'freeze' || result.type === 'vacation' || reward) {
    const payload = reward
      ? JSON.stringify({
          rewardId: reward.id,
          name: reward.name,
          price: reward.price,
          icon: reward.icon,
        })
      : null;
    statements.push(sql`
      INSERT INTO inventory_items (id, type, status, payload, source, source_key, source_index, created_at, updated_at)
      SELECT ${crypto.randomUUID()}, ${result.type}, 'owned', ${payload}, 'box', ${`box:${boxId}`}, 0, ${now}, ${now}
      WHERE ${mine}
      ON CONFLICT DO NOTHING`);
  }
  if (charm && charmUsed) {
    statements.push(sql`
      UPDATE inventory_items SET status = 'consumed', payload = ${JSON.stringify({ usedOnBox: boxId })},
        updated_at = ${now}
      WHERE id = ${charm.id} AND status = 'armed' AND ${mine}`);
  }
  await transaction(db, statements);
  const opening = await loadOpening(db, boxId);
  if (!opening) throw jsonError(409, 'This box was already opened');
  return opening;
}

/** Arms a lucky charm for the next box: one at a time, and only while pieces are missing (13.7). */
export async function useCharm(
  db: Db,
  today: ISODate,
  id: string,
  seasons: readonly Season[],
): Promise<void> {
  const season = currentSeason(seasons, today);
  if (!season || !canUseCharm(piecesOf(season), await ownedPieceIds(db))) {
    throw badRequest('You already own every piece of this season');
  }
  if (await armedCharm(db)) throw jsonError(409, 'A lucky charm is already active');
  const now = new Date().toISOString();
  const [updated] = await transaction(db, [
    sql`UPDATE inventory_items SET status = 'armed', updated_at = ${now}
      WHERE id = ${id} AND type = 'charm' AND status = 'owned'
        AND NOT EXISTS (SELECT 1 FROM inventory_items WHERE type = 'charm' AND status = 'armed')`,
    eventIf(
      {
        key: `use:${id}:charm:${now}`,
        kind: 'use',
        itemId: id,
        date: today,
        detail: { action: 'charm' },
      },
      itemIs(id, 'armed', now),
      now,
    ),
  ]);
  if (!updated?.meta.changes) throw jsonError(409, 'This lucky charm can’t be used now');
}

/** Buys a missing piece with shards; past seasons cost 1.5× (13.8). */
export async function buyPiece(
  db: Db,
  today: ISODate,
  pieceId: string,
  seasons: readonly Season[],
): Promise<void> {
  const piece = findPiece(seasons, pieceId);
  const season = seasons.find((s) => s.id === piece?.seasonId);
  if (!piece || !season || season.start > today) throw notFound('Piece not found');
  const price = piecePrice(piece, currentSeason(seasons, today));
  const key = `piece:${pieceId}`;
  const now = new Date().toISOString();
  await transaction(db, [
    eventIf(
      {
        key,
        kind: 'shards',
        itemId: pieceId,
        date: today,
        shards: -price,
        detail: { pieceId, tier: piece.tier },
      },
      sql`(SELECT COALESCE(SUM(shards), 0) FROM rewards_ledger) >= ${price}
        AND NOT EXISTS (SELECT 1 FROM owned_pieces WHERE piece_id = ${pieceId})`,
      now,
    ),
    sql`
      INSERT INTO owned_pieces (piece_id, season_id, acquired_at, source)
      SELECT ${pieceId}, ${season.id}, ${now}, 'shards'
      WHERE EXISTS (SELECT 1 FROM rewards_ledger WHERE key = ${key} AND created_at = ${now})
      ON CONFLICT DO NOTHING`,
  ]);
  const bought = await db
    .select()
    .from(ownedPieces)
    .where(and(eq(ownedPieces.pieceId, pieceId), eq(ownedPieces.acquiredAt, now)))
    .get();
  if (!bought) {
    const owned = (await ownedPieceIds(db)).has(pieceId);
    throw jsonError(409, owned ? 'You already own this piece' : 'Not enough shards');
  }
}

export async function loadOwnedPieces(db: Db): Promise<OwnedPiece[]> {
  return db.select().from(ownedPieces);
}
