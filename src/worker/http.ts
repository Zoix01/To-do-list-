import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';

/** Parses the JSON body with `schema`, or throws a 400 with the first problem. */
export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('Request body must be JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join('.');
    throw badRequest(field ? `${field}: ${issue?.message}` : (issue?.message ?? 'Invalid request'));
  }
  return result.data;
}

export function badRequest(message: string): HTTPException {
  return jsonError(400, message);
}

export function notFound(message = 'Not found'): HTTPException {
  return jsonError(404, message);
}

export function jsonError(
  status: 400 | 401 | 404 | 409 | 429 | 500,
  message: string,
  extra: Record<string, unknown> = {},
): HTTPException {
  return new HTTPException(status, {
    res: Response.json({ error: message, ...extra }, { status }),
  });
}
