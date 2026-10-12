import { Hono } from 'hono';
import type { ConnectorStatus } from '../../shared/types';
import { OWNER } from '../authorize';
import type { AppEnv } from '../env';
import { notFound } from '../http';

/** Settings → Claude connector: connected apps and Disconnect (SPEC §9.1). */
export const connectorRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const oauth = c.env.OAUTH_PROVIDER;
    if (!c.env.OAUTH_KV || !oauth) return c.json<ConnectorStatus>({ configured: false, apps: [] });
    const { items } = await oauth.listUserGrants(OWNER);
    const apps = await Promise.all(
      items.map(async (grant) => {
        const client = await oauth.lookupClient(grant.clientId).catch(() => null);
        const metadata = grant.metadata as { clientName?: string } | null;
        return {
          id: grant.id,
          name: client?.clientName ?? metadata?.clientName ?? 'Unknown app',
          connectedAt: new Date(grant.createdAt * 1000).toISOString(),
        };
      }),
    );
    apps.sort((a, b) => b.connectedAt.localeCompare(a.connectedAt));
    return c.json<ConnectorStatus>({ configured: true, apps });
  })
  // Disconnect: revokes the grant and all its tokens immediately.
  .delete('/apps/:id', async (c) => {
    const oauth = c.env.OAUTH_PROVIDER;
    if (!oauth) throw notFound('The Claude connector is not set up');
    await oauth.revokeGrant(c.req.param('id'), OWNER);
    return c.body(null, 204);
  });
