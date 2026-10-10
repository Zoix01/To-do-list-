import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from './db/schema';

export interface Env {
  DB: D1Database;
  /** Set with `npm run set-password` (Worker secret, or .dev.vars locally). */
  PASSWORD_HASH?: string;
  /** IANA time zone, e.g. "Europe/Prague" (wrangler.jsonc vars). */
  TIMEZONE: string;
}

export type Db = DrizzleD1Database<typeof schema>;

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    /** "Today" in the configured time zone. */
    today: string;
  };
}
