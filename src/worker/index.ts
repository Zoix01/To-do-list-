import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isAllowedRedirectUri } from '../shared/assistant';
import { dateInZone } from '../shared/dates';
import type { Me } from '../shared/types';
import { authRoutes, requireSession } from './auth';
import { authorizeRoutes, SCOPE } from './authorize';
import * as schema from './db/schema';
import type { AppEnv, Env } from './env';
import { mcpHandler } from './mcp/server';
import { connectorRoutes } from './routes/connector';
import { habitRoutes } from './routes/habits';
import { listRoutes } from './routes/lists';
import { recurringRoutes } from './routes/recurring';
import { rewardRoutes, rewardsContext } from './routes/rewards';
import { galleryRoutes, inventoryRoutes, shopRoutes } from './routes/shop';
import { taskRoutes } from './routes/tasks';
import { prepareRewards } from './services/rewards';

// ---------------------------------------------------------------- The app's API (/api)

const api = new Hono<AppEnv>();
api.use(async (c, next) => {
  await next();
  // API responses are per-user data; never let a cache keep them.
  c.header('Cache-Control', 'no-store');
});
api.route('/auth', authRoutes);
api.use(requireSession);
// This week's reward snapshot is locked before any request can change habits or weights.
api.use(async (c, next) => {
  await prepareRewards(rewardsContext(c));
  await next();
});
api.get('/me', (c) => c.json<Me>({ timeZone: c.env.TIMEZONE }));
api.route('/lists', listRoutes);
api.route('/tasks', taskRoutes);
api.route('/recurring', recurringRoutes);
api.route('/habits', habitRoutes);
api.route('/connector', connectorRoutes);
api.route('/rewards', rewardRoutes);
api.route('/shop', shopRoutes);
api.route('/inventory', inventoryRoutes);
api.route('/gallery', galleryRoutes);

// ---------------------------------------------------------------- Everything the Worker serves itself

const app = new Hono<AppEnv>();
app.use(async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  c.set('today', dateInZone(new Date(), c.env.TIMEZONE));
  await next();
});
app.route('/api', api);
app.route('/authorize', authorizeRoutes);
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return c.json({ error: 'Something went wrong' }, 500);
});

// ---------------------------------------------------------------- Claude connector (SPEC §9.1)

const NOT_CLAUDE = {
  code: 'invalid_redirect_uri',
  description: 'Only Claude can connect to this planner',
  status: 400,
} as const;

/*
 * The OAuth resource must be the exact public URL of /mcp, which differs per
 * deployment (and is http://localhost in development), so one provider is
 * built per origin and reused.
 */
const providers = new Map<string, OAuthProvider<Env>>();

function providerFor(origin: string): OAuthProvider<Env> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler,
      defaultHandler: app,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      scopesSupported: [SCOPE],
      resourceMetadata: { resource: `${origin}/mcp`, resource_name: 'Planner' },
      accessTokenTTL: 60 * 60,
      // A connection lasts until it is disconnected in Settings (refresh tokens rotate).
      refreshTokenTTL: undefined,
      // Only Claude's callbacks may register (claude.ai and Claude Code).
      clientRegistrationCallback: ({ clientMetadata }) => {
        const uris = (clientMetadata as { redirect_uris?: unknown }).redirect_uris;
        const ok =
          Array.isArray(uris) &&
          uris.length > 0 &&
          uris.every((uri) => typeof uri === 'string' && isAllowedRedirectUri(uri));
        return ok ? undefined : NOT_CLAUDE;
      },
    });
    providers.set(origin, provider);
  }
  return provider;
}

function isConnectorPath(pathname: string): boolean {
  return (
    pathname === '/mcp' ||
    pathname.startsWith('/mcp/') ||
    pathname === '/authorize' ||
    pathname === '/token' ||
    pathname === '/register' ||
    pathname.startsWith('/.well-known/oauth-')
  );
}

/**
 * Reads a small request body into memory. The OAuth provider answers rejected
 * /mcp calls (401) without reading the body, which breaks the local dev server's
 * next request; a buffered body avoids that and costs nothing for small JSON-RPC.
 */
async function withBufferedBody(request: Request): Promise<Request> {
  if (request.method !== 'POST' || !request.body) return request;
  return new Request(request, { body: await request.arrayBuffer() });
}

export default {
  async fetch(request, env, ctx) {
    if (!env.OAUTH_KV) {
      // Connector not set up yet: the app works, the connector explains what's missing.
      if (isConnectorPath(new URL(request.url).pathname)) {
        return Response.json(
          { error: 'The Claude connector is not set up: add the OAUTH_KV namespace (see README).' },
          { status: 503 },
        );
      }
      return app.fetch(request, env, ctx);
    }
    const url = new URL(request.url);
    const forwarded = url.pathname === '/mcp' ? await withBufferedBody(request) : request;
    return providerFor(url.origin).fetch(forwarded, env, ctx);
  },
} satisfies ExportedHandler<Env>;
