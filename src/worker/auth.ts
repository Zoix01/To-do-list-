import { eq, lt } from 'drizzle-orm';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { afterFailedAttempt, lockRemaining, type AttemptState } from '../shared/loginThrottle';
import { loginSchema } from '../shared/schemas';
import { loginAttempts, sessions } from './db/schema';
import type { AppEnv } from './env';
import { jsonError, readBody } from './http';
import { verifyPassword } from './password';

const COOKIE_NAME = 'session';
const SESSION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Sliding expiry is refreshed at most this often, to avoid a DB write per request. */
const RENEW_INTERVAL_MS = DAY_MS;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Requires a valid session; renews it (cookie + DB) at most once a day. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) throw jsonError(401, 'Not logged in');

  const db = c.get('db');
  const now = Date.now();
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, await sha256Hex(token)))
    .get();
  if (!session || Date.parse(session.expiresAt) <= now) {
    deleteCookie(c, COOKIE_NAME, { path: '/', secure: true });
    throw jsonError(401, 'Not logged in');
  }

  if (now - Date.parse(session.lastRenewedAt) >= RENEW_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({
        expiresAt: new Date(now + SESSION_DAYS * DAY_MS).toISOString(),
        lastRenewedAt: new Date(now).toISOString(),
      })
      .where(eq(sessions.id, session.id));
    setSessionCookie(c, token);
  }
  await next();
};

export const authRoutes = new Hono<AppEnv>()
  .post('/login', async (c) => {
    if (!c.env.PASSWORD_HASH) {
      throw jsonError(500, 'No password is set. Run "npm run set-password" first.');
    }
    const db = c.get('db');
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const now = Date.now();

    const row = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip)).get();
    const state: AttemptState | null = row
      ? {
          failedCount: row.failedCount,
          lockedUntil: row.lockedUntil ? Date.parse(row.lockedUntil) : null,
        }
      : null;
    const waitMs = lockRemaining(state, now);
    if (waitMs > 0) {
      throw jsonError(429, 'Too many attempts', { retryAfterSeconds: Math.ceil(waitMs / 1000) });
    }

    const { password } = await readBody(c, loginSchema);
    if (!(await verifyPassword(password, c.env.PASSWORD_HASH))) {
      const next = afterFailedAttempt(state, now);
      const values = {
        failedCount: next.failedCount,
        lockedUntil: next.lockedUntil ? new Date(next.lockedUntil).toISOString() : null,
      };
      await db
        .insert(loginAttempts)
        .values({ ip, firstFailedAt: new Date(now).toISOString(), ...values })
        .onConflictDoUpdate({ target: loginAttempts.ip, set: values });
      if (next.lockedUntil) {
        throw jsonError(429, 'Too many attempts', {
          retryAfterSeconds: Math.ceil((next.lockedUntil - now) / 1000),
        });
      }
      throw jsonError(401, 'Wrong password');
    }

    const token = randomToken();
    const nowIso = new Date(now).toISOString();
    await db.batch([
      db.delete(loginAttempts).where(eq(loginAttempts.ip, ip)),
      db.delete(sessions).where(lt(sessions.expiresAt, nowIso)),
      db.insert(sessions).values({
        id: crypto.randomUUID(),
        tokenHash: await sha256Hex(token),
        createdAt: nowIso,
        expiresAt: new Date(now + SESSION_DAYS * DAY_MS).toISOString(),
        lastRenewedAt: nowIso,
      }),
    ]);
    setSessionCookie(c, token);
    return c.body(null, 204);
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, COOKIE_NAME);
    if (token) {
      await c
        .get('db')
        .delete(sessions)
        .where(eq(sessions.tokenHash, await sha256Hex(token)));
    }
    deleteCookie(c, COOKIE_NAME, { path: '/', secure: true });
    return c.body(null, 204);
  });
