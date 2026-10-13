import { asc, eq, max } from 'drizzle-orm';
import { Hono } from 'hono';
import { listCreateSchema, listOrderSchema, listUpdateSchema } from '../../shared/schemas';
import { lists, recurringTasks, tasks } from '../db/schema';
import type { AppEnv } from '../env';
import { assertCosmeticsAvailable } from '../services/cosmetics';
import { badRequest, notFound, readBody } from '../http';

export const listRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    return c.json(await c.get('db').select().from(lists).orderBy(asc(lists.sortOrder)));
  })
  .post('/', async (c) => {
    const input = await readBody(c, listCreateSchema);
    const db = c.get('db');
    await assertCosmeticsAvailable(db, { color: input.color });
    const last = await db
      .select({ value: max(lists.sortOrder) })
      .from(lists)
      .get();
    const list = {
      id: crypto.randomUUID(),
      name: input.name,
      color: input.color,
      sortOrder: (last?.value ?? -1) + 1,
      createdAt: new Date().toISOString(),
    };
    await db.insert(lists).values(list);
    return c.json(list, 201);
  })
  .put('/order', async (c) => {
    const { ids } = await readBody(c, listOrderSchema);
    const db = c.get('db');
    const existing = await db.select({ id: lists.id }).from(lists);
    const known = new Set(existing.map((row) => row.id));
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw badRequest('ids must contain every list exactly once');
    }
    const [first, ...rest] = ids.map((id, index) =>
      db.update(lists).set({ sortOrder: index }).where(eq(lists.id, id)),
    );
    if (first) await db.batch([first, ...rest]);
    return c.body(null, 204);
  })
  .patch('/:id', async (c) => {
    const input = await readBody(c, listUpdateSchema);
    const db = c.get('db');
    await assertCosmeticsAvailable(db, { color: input.color });
    const [list] = await db
      .update(lists)
      .set(input)
      .where(eq(lists.id, c.req.param('id')))
      .returning();
    if (!list) throw notFound('List not found');
    return c.json(list);
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const mode = c.req.query('tasks');
    if (mode !== 'move' && mode !== 'delete') {
      throw badRequest('Query parameter "tasks" must be "move" or "delete"');
    }
    const db = c.get('db');
    const list = await db.select({ id: lists.id }).from(lists).where(eq(lists.id, id)).get();
    if (!list) throw notFound('List not found');
    const now = new Date().toISOString();
    // Weekly templates follow the same choice as the tasks (SPEC §5.4).
    await db.batch([
      mode === 'move'
        ? db.update(tasks).set({ listId: null, updatedAt: now }).where(eq(tasks.listId, id))
        : db.delete(tasks).where(eq(tasks.listId, id)),
      mode === 'move'
        ? db.update(recurringTasks).set({ listId: null }).where(eq(recurringTasks.listId, id))
        : db.delete(recurringTasks).where(eq(recurringTasks.listId, id)),
      db.delete(lists).where(eq(lists.id, id)),
    ]);
    return c.body(null, 204);
  });
