import { asc, eq, max } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  appearanceSchema,
  armSchema,
  buySchema,
  cosmeticBuySchema,
  economySchema,
  listOrderSchema,
  shopRewardCreateSchema,
  shopRewardUpdateSchema,
  vacationSchema,
} from '../../shared/schemas';
import type {
  BoxOpening,
  InventoryItem,
  InventoryView,
  OwnedPiece,
  ShopReward,
} from '../../shared/types';
import { shopRewards } from '../db/schema';
import type { AppEnv } from '../env';
import { badRequest, notFound, readBody } from '../http';
import {
  armFreeze,
  buy,
  cancelVacation,
  inventoryView,
  refund,
  scheduleVacation,
  settleAllFreezes,
  unarmFreeze,
  useReward,
} from '../services/inventory';
import { seasonsFrom } from '../../shared/seasonData';
import { buyPiece, loadOwnedPieces, openBoxItem, useCharm } from '../services/boxes';
import { buyCosmetic, refundCosmetic, setEconomy, setTickAnimation } from '../services/cosmetics';
import { seasonStart } from '../services/rewards';
import { rewardsContext } from './rewards';
import type { Context } from 'hono';

const seasonsOf = (c: Context<AppEnv>) => seasonsFrom(seasonStart(rewardsContext(c)));

/** The Shop: my real-life rewards and buying (SPEC §13.6). */
export const shopRoutes = new Hono<AppEnv>()
  .get('/rewards', async (c) =>
    c.json<ShopReward[]>(
      await c.get('db').select().from(shopRewards).orderBy(asc(shopRewards.sortOrder)),
    ),
  )
  .post('/rewards', async (c) => {
    const input = await readBody(c, shopRewardCreateSchema);
    const db = c.get('db');
    const [last] = await db.select({ order: max(shopRewards.sortOrder) }).from(shopRewards);
    const reward: ShopReward = {
      id: crypto.randomUUID(),
      ...input,
      sortOrder: (last?.order ?? -1) + 1,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    await db.insert(shopRewards).values(reward);
    return c.json(reward, 201);
  })
  .put('/rewards/order', async (c) => {
    const { ids } = await readBody(c, listOrderSchema);
    const db = c.get('db');
    const known = new Set(
      (await db.select({ id: shopRewards.id }).from(shopRewards)).map((r) => r.id),
    );
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw badRequest('ids must contain every reward exactly once');
    }
    const [first, ...rest] = ids.map((id, index) =>
      db.update(shopRewards).set({ sortOrder: index }).where(eq(shopRewards.id, id)),
    );
    if (first) await db.batch([first, ...rest]);
    return c.body(null, 204);
  })
  .patch('/rewards/:id', async (c) => {
    const input = await readBody(c, shopRewardUpdateSchema);
    const [reward] = await c
      .get('db')
      .update(shopRewards)
      .set(input)
      .where(eq(shopRewards.id, c.req.param('id')))
      .returning();
    if (!reward) throw notFound('Reward not found');
    return c.json(reward);
  })
  // Cosmetics unlock right away instead of going to the Inventory (13.12).
  .post('/cosmetics/:id/buy', async (c) => {
    const { requestId } = await readBody(c, cosmeticBuySchema);
    await buyCosmetic(c.get('db'), c.get('today'), c.req.param('id'), requestId);
    return c.body(null, 204);
  })
  .post('/cosmetics/:id/refund', async (c) => {
    await refundCosmetic(c.get('db'), c.get('today'), c.req.param('id'));
    return c.body(null, 204);
  })
  .post('/buy', async (c) => {
    const input = await readBody(c, buySchema);
    return c.json<InventoryItem>(await buy(c.get('db'), c.get('today'), input), 201);
  });

/** The Inventory: using, arming and undoing, plus the History (SPEC §13.9, §13.10). */
export const inventoryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    await settleAllFreezes(c.get('db'), c.get('today'));
    return c.json<InventoryView>(await inventoryView(c.get('db'), c.get('today')));
  })
  .post('/:id/refund', async (c) => {
    await refund(c.get('db'), c.get('today'), c.req.param('id'));
    return c.body(null, 204);
  })
  .post('/:id/arm', async (c) => {
    const { habitId } = await readBody(c, armSchema);
    await armFreeze(c.get('db'), c.get('today'), c.req.param('id'), habitId);
    return c.body(null, 204);
  })
  .post('/:id/unarm', async (c) => {
    await unarmFreeze(c.get('db'), c.get('today'), c.req.param('id'));
    return c.body(null, 204);
  })
  .post('/:id/vacation', async (c) => {
    const { date } = await readBody(c, vacationSchema);
    await scheduleVacation(c.get('db'), c.get('today'), c.req.param('id'), date);
    return c.body(null, 204);
  })
  .post('/:id/cancel', async (c) => {
    await cancelVacation(c.get('db'), c.get('today'), c.req.param('id'));
    return c.body(null, 204);
  })
  // Opening a box returns its stored result; opening it again returns the same one (13.7).
  .post('/:id/open', async (c) =>
    c.json<BoxOpening>(
      await openBoxItem(c.get('db'), c.get('today'), c.req.param('id'), seasonsOf(c)),
    ),
  )
  .post('/:id/charm', async (c) => {
    await useCharm(c.get('db'), c.get('today'), c.req.param('id'), seasonsOf(c));
    return c.body(null, 204);
  })
  .post('/:id/use', async (c) => {
    await useReward(c.get('db'), c.get('today'), c.req.param('id'));
    return c.body(null, 204);
  });

/** Owned art pieces, and buying missing ones with shards (SPEC §13.8, §13.13). */
export const galleryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json<OwnedPiece[]>(await loadOwnedPieces(c.get('db'))))
  .post('/pieces/:id/buy', async (c) => {
    await buyPiece(c.get('db'), c.get('today'), c.req.param('id'), seasonsOf(c));
    return c.body(null, 204);
  });

/** Settings → Appearance and Gamification (SPEC §13.2, §13.12). */
export const gamificationSettingsRoutes = new Hono<AppEnv>()
  .put('/appearance', async (c) => {
    const { tickAnimation } = await readBody(c, appearanceSchema);
    await setTickAnimation(c.get('db'), tickAnimation);
    return c.body(null, 204);
  })
  .put('/economy', async (c) => {
    await setEconomy(c.get('db'), await readBody(c, economySchema));
    return c.body(null, 204);
  });
