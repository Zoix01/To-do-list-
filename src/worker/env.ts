import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from './db/schema';

export interface Env {
  DB: D1Database;
  /** Set with `npm run set-password` (Worker secret, or .dev.vars locally). */
  PASSWORD_HASH?: string;
  /** IANA time zone, e.g. "Europe/Prague" (wrangler.jsonc vars). */
  TIMEZONE: string;
  /** Overrides GAMIFICATION_START (YYYY-MM-DD), for trying rewards out locally in .dev.vars. */
  REWARDS_START?: string;
  /** Claude connector grants and tokens (SPEC §9.1). Optional: without it the connector is off. */
  OAUTH_KV?: KVNamespace;
  /** Added by the OAuth provider for requests it passes on to the app. */
  OAUTH_PROVIDER?: OAuthHelpers;
}

export type Db = DrizzleD1Database<typeof schema> & { $client: D1Database };

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    /** "Today" in the configured time zone. */
    today: string;
  };
}
