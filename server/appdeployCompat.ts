import type { IncomingMessage, ServerResponse } from 'node:http';
import { neon } from '@neondatabase/serverless';
import { getSessionUser, type AuthUser } from './auth';

export type HttpResult = { status: number; body: unknown };
export type RequestContext = {
  req: IncomingMessage & { body?: unknown };
  res: ServerResponse;
  method: string;
  path: string;
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  user?: AuthUser;
};
export type RouterMiddleware = (ctx: RequestContext) => Promise<HttpResult | void>;

type StoredRecord = Record<string, unknown> & { id?: string };

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured. Connect a Neon/Postgres database to the Vercel project.');
  return neon(url);
}

let schemaPromise: Promise<void> | null = null;
async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db`CREATE TABLE IF NOT EXISTS pitchline_records (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        record JSONB NOT NULL,
        created_at BIGINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (namespace, id)
      )`;
      await db`CREATE INDEX IF NOT EXISTS pitchline_records_namespace_idx ON pitchline_records(namespace)`;
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

const newId = () => globalThis.crypto.randomUUID();
const now = () => Date.now();

export const db = {
  async list<T = StoredRecord>(namespace: string, options: { limit?: number } = {}) {
    await ensureSchema();
    const limit = Math.max(1, Math.min(5000, Number(options.limit || 100)));
    const rows = await sql()`
      SELECT id, record
      FROM pitchline_records
      WHERE namespace = ${namespace}
      ORDER BY created_at ASC, id ASC
      LIMIT ${limit}
    ` as Array<{ id: string; record: T }>;
    return { items: rows.map(row => ({ ...(row.record as object), id: row.id }) as T) };
  },
  async get<T = StoredRecord>(namespace: string, ids: string[]) {
    await ensureSchema();
    if (!ids.length) return [] as T[];
    const rows = await sql()`
      SELECT id, record
      FROM pitchline_records
      WHERE namespace = ${namespace} AND id = ANY(${ids})
    ` as Array<{ id: string; record: T }>;
    return rows.map(row => ({ ...(row.record as object), id: row.id }) as T);
  },
  async add(namespace: string, records: StoredRecord[]) {
    await ensureSchema();
    const ids: string[] = [];
    for (const input of records) {
      const id = String(input.id || newId());
      const record = { ...input, id };
      const timestamp = now();
      await sql()`
        INSERT INTO pitchline_records(namespace, id, record, created_at, updated_at)
        VALUES(${namespace}, ${id}, ${JSON.stringify(record)}::jsonb, ${timestamp}, ${timestamp})
        ON CONFLICT (namespace, id) DO UPDATE
        SET record = EXCLUDED.record, updated_at = EXCLUDED.updated_at
      `;
      ids.push(id);
    }
    return ids;
  },
  async update(namespace: string, updates: Array<{ id: string; record: StoredRecord }>) {
    await ensureSchema();
    const result: boolean[] = [];
    for (const item of updates) {
      const timestamp = now();
      const record = { ...item.record, id: item.id };
      const rows = await sql()`
        UPDATE pitchline_records
        SET record = ${JSON.stringify(record)}::jsonb, updated_at = ${timestamp}
        WHERE namespace = ${namespace} AND id = ${item.id}
        RETURNING id
      ` as Array<{ id: string }>;
      result.push(rows.length > 0);
    }
    return result;
  },
  async delete(namespace: string, ids: string[]) {
    await ensureSchema();
    if (!ids.length) return [] as string[];
    const rows = await sql()`
      DELETE FROM pitchline_records
      WHERE namespace = ${namespace} AND id = ANY(${ids})
      RETURNING id
    ` as Array<{ id: string }>;
    return rows.map(row => row.id);
  },
};

export const ws = {
  async send(_connectionIds: string[], _message: unknown) {
    // Vercel Functions are request/response based; durable AppDeploy WebSockets are not carried across.
  },
};

export function json(body: unknown, status = 200): HttpResult { return { status, body }; }
export function error(message: string, status = 500): HttpResult { return { status, body: { error: message, message } }; }
export function requireAuth(): RouterMiddleware {
  return async ctx => {
    const user = getSessionUser(ctx.req);
    if (!user) return error('Unauthorized', 401);
    ctx.user = user;
  };
}

function compilePattern(pattern: string) {
  const names: string[] = [];
  const parts = pattern.split('/').filter(Boolean).map(part => {
    if (part.startsWith(':')) {
      names.push(part.slice(1));
      return '([^/]+)';
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { names, regex: new RegExp(`^/${parts.join('/')}/?$`) };
}

async function readBody(req: IncomingMessage & { body?: unknown }) {
  if (req.body !== undefined) return req.body;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

export function router(routes: Record<string, RouterMiddleware[]>): (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => Promise<void> {
  const compiled = Object.entries(routes).map(([key, middlewares]) => {
    const space = key.indexOf(' ');
    const method = key.slice(0, space);
    const pattern = key.slice(space + 1);
    return { method, pattern, matcher: compilePattern(pattern), middlewares };
  });

  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const method = req.method || 'GET';
    const rawUrl = req.url || '/';
    const url = new URL(rawUrl, 'https://pitchline.local');
    const path = url.pathname;
    const route = compiled.find(item => item.method === method && item.matcher.regex.test(path));
    if (!route) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found', message: 'Not found' }));
      return;
    }
    const match = path.match(route.matcher.regex);
    const params: Record<string, string> = {};
    route.matcher.names.forEach((name, index) => { params[name] = decodeURIComponent(match?.[index + 1] || ''); });
    const body = await readBody(req);
    const ctx: RequestContext = { req, res, method, path, body, params, query: Object.fromEntries(url.searchParams.entries()) };
    try {
      let result: HttpResult | void = undefined;
      for (const middleware of route.middlewares) {
        result = await middleware(ctx);
        if (result) break;
      }
      if (!result) result = json({ ok: true });
      res.statusCode = result.status;
      res.end(JSON.stringify(result.body));
    } catch (cause) {
      console.error('Pitchline API error', { method, path, cause });
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error', message: cause instanceof Error ? cause.message : 'Internal server error' }));
    }
  };
}
