import {
  AuthorizationError,
  CimdFetchError,
  type ConsentDescription,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
import { connectionKind, isAllowedRedirectUri } from '../shared/assistant';
import { checkPassword, clientIp } from './auth';
import type { AppEnv } from './env';

/*
 * The Claude connector's authorization page (SPEC §9.1): shows which app asks
 * for access and where the access goes, and requires the app password (with
 * the login's lockout). Only Claude's redirect URIs are accepted.
 */

/** The single user of this planner (grants are stored for this id). */
export const OWNER = 'owner';
/** Everything the connector can do: read tasks, lists and habits; create and edit tasks. */
export const SCOPE = 'planner';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

interface PageText {
  clientName: string;
  redirectHost: string;
  loopback: boolean;
}

/** Same Ember tokens as the app (src/client/styles/tokens.css). */
const STYLE = `
:root { color-scheme: dark; --bg:#1c1916; --surface:#26221e; --border:#3a342e; --text:#ede6db;
  --text-muted:#9c9286; --accent:#e8925a; --danger:#d9675a; --warning:#d9b25a; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text);
  font: 14px/1.45 Geist, system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 360px; margin: 14vh auto 0; padding: 0 16px; }
h1 { font-size: 18px; font-weight: 600; margin: 0 0 16px; }
p { margin: 0 0 12px; color: var(--text-muted); }
strong { color: var(--text); font-weight: 500; }
.warn { color: var(--warning); }
.error { color: var(--danger); }
label { display:block; margin: 20px 0 4px; color: var(--text-muted); font-size: 13px; }
input[type=password] { width:100%; height:36px; padding:0 12px; border:1px solid var(--border);
  border-radius:6px; background:var(--surface); color:var(--text); font: inherit; font-size:15px; }
input:focus { outline: none; border-color: var(--accent); }
.actions { display:flex; gap:8px; margin-top: 16px; }
button { flex:1; height:36px; border-radius:6px; font: inherit; font-weight:500; cursor:pointer;
  border:1px solid var(--border); background:var(--surface); color:var(--text); }
button.primary { background:var(--accent); border-color:var(--accent); color:var(--bg); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escape(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

function consentPage(text: PageText, handle: string, error?: string): string {
  const name = escape(text.clientName);
  return layout(
    `Connect ${text.clientName} · Planner`,
    `<h1>Connect ${name} to Planner?</h1>
<p>${name} will be able to read your tasks, lists and habits, and create and edit tasks. It can't complete or delete anything.</p>
<p>Access will be sent to <strong>${escape(text.redirectHost)}</strong>.</p>
${text.loopback ? '<p class="warn">This sends access to an app on this computer (such as Claude Code). Continue only if you just started connecting from it.</p>' : ''}
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <input type="hidden" name="client" value="${name}">
  <input type="hidden" name="host" value="${escape(text.redirectHost)}">
  <input type="hidden" name="loopback" value="${text.loopback ? '1' : ''}">
  <label for="password">Your Planner password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  ${error ? `<p class="error" role="alert" style="margin-top:8px">${escape(error)}</p>` : ''}
  <div class="actions">
    <button type="submit" name="decision" value="deny" formnovalidate>Cancel</button>
    <button type="submit" name="decision" value="approve" class="primary">Connect</button>
  </div>
</form>`,
  );
}

function errorPage(message: string, status = 400): Response {
  return new Response(
    layout('Can’t connect · Planner', `<h1>Can’t connect</h1><p>${escape(message)}</p>`),
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        'X-Frame-Options': 'DENY',
      },
    },
  );
}

const NOT_CLAUDE = 'Only Claude can connect to this planner.';

function handleError(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) {
    return Response.redirect(error.redirectTo, 302);
  }
  if (error instanceof AuthorizationError) {
    return errorPage(`${error.description} Start connecting again from Claude.`);
  }
  if (error instanceof CimdFetchError) return errorPage('This app could not be verified.');
  throw error;
}

function helpers(env: AppEnv['Bindings']): OAuthHelpers {
  if (!env.OAUTH_PROVIDER) throw new Error('OAuth provider is not configured');
  return env.OAUTH_PROVIDER;
}

function pageText(details: ConsentDescription): PageText {
  return {
    clientName: details.clientName,
    redirectHost: details.redirectHost,
    loopback: details.redirectIsLoopback,
  };
}

/**
 * Claude registers a new client on every fresh connection, so without this an
 * old, unused connection would stay listed in Settings after each reconnect.
 * Revokes the other grants of the same kind (claude.ai or Claude Code).
 */
async function replaceOlderConnections(oauth: OAuthHelpers, newClientId: string): Promise<void> {
  const newClient = await oauth.lookupClient(newClientId);
  if (!newClient) return;
  const kind = connectionKind(newClient.redirectUris);
  const { items } = await oauth.listUserGrants(OWNER);
  for (const grant of items) {
    if (grant.clientId === newClientId) continue;
    const client = await oauth.lookupClient(grant.clientId).catch(() => null);
    if (!client || connectionKind(client.redirectUris) === kind) {
      await oauth.revokeGrant(grant.id, OWNER);
    }
  }
}

export const authorizeRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const oauth = helpers(c.env);
    try {
      const request = await oauth.parseAuthRequest(c.req.raw);
      if (!isAllowedRedirectUri(request.redirectUri)) return errorPage(NOT_CLAUDE, 403);
      const details = await oauth.describeConsent(request);
      const consent = await oauth.beginConsent(request);
      consent.headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(consentPage(pageText(details), consent.handle), {
        headers: consent.headers,
      });
    } catch (error) {
      return handleError(error);
    }
  })
  .post('/', async (c) => {
    const oauth = helpers(c.env);
    let form: FormData;
    try {
      form = await c.req.raw.clone().formData();
    } catch {
      return errorPage('This page expects the connect form. Start connecting again from Claude.');
    }
    const handle = String(form.get('handle') ?? '');
    // Shown again if the password is wrong; display only, never trusted for the grant.
    const text: PageText = {
      clientName: String(form.get('client') ?? 'This app'),
      redirectHost: String(form.get('host') ?? ''),
      loopback: form.get('loopback') === '1',
    };
    try {
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(c.req.raw, handle);
        denied.headers.set('Location', denied.redirectTo);
        return new Response(null, { status: 302, headers: denied.headers });
      }

      const check = await checkPassword(
        c.get('db'),
        c.env,
        clientIp(c.req.raw),
        String(form.get('password') ?? ''),
      );
      if (!check.ok) {
        const message =
          check.reason === 'locked'
            ? `Too many attempts. Try again in ${check.retryAfterSeconds} s.`
            : check.reason === 'not_set'
              ? 'No password is set for this planner yet.'
              : 'Wrong password';
        return new Response(consentPage(text, handle, message), {
          status: 401,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            // No form-action: browsers apply it to the redirect back to Claude too.
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
            'X-Frame-Options': 'DENY',
          },
        });
      }

      const approved = await oauth.approveConsent(c.req.raw, handle, { scope: [SCOPE] });
      // The request comes from server-side storage, not the form: check it again.
      if (!isAllowedRedirectUri(approved.request.redirectUri)) return errorPage(NOT_CLAUDE, 403);
      const client = await oauth.lookupClient(approved.request.clientId);
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: OWNER,
        metadata: { clientName: client?.clientName ?? text.clientName },
        scope: [SCOPE],
        props: { owner: true },
      });
      await replaceOlderConnections(oauth, approved.request.clientId);
      approved.headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    } catch (error) {
      return handleError(error);
    }
  });
