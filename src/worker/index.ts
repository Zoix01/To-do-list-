import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { dateInZone } from '../shared/dates';
import type { Me } from '../shared/types';
import { authRoutes, requireSession } from './auth';
import * as schema from './db/schema';
import type { AppEnv } from './env';
import { listRoutes } from './routes/lists';
import { habitRoutes } from './routes/habits';
import { recurringRoutes } from './routes/recurring';
import { taskRoutes } from './routes/tasks';

const app = new Hono<AppEnv>().basePath('/api');

app.use(async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  c.set('today', dateInZone(new Date(), c.env.TIMEZONE));
  await next();
  // API responses are per-user data; never let a cache keep them.
  c.header('Cache-Control', 'no-store');
});

app.route('/auth', authRoutes);

app.use(requireSession);
app.get('/me', (c) => c.json<Me>({ timeZone: c.env.TIMEZONE }));
app.route('/lists', listRoutes);
app.route('/tasks', taskRoutes);
app.route('/recurring', recurringRoutes);
app.route('/habits', habitRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default app;
