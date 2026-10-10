import { eq } from 'drizzle-orm';
import { lists } from './db/schema';
import type { Db } from './env';
import { badRequest } from './http';

export async function assertListExists(db: Db, listId: string | null | undefined): Promise<void> {
  if (!listId) return;
  const list = await db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).get();
  if (!list) throw badRequest('List not found');
}

/** Blank notes are stored as null. */
export function emptyToNull(text: string | null | undefined): string | null {
  return text?.trim() ? text : null;
}
