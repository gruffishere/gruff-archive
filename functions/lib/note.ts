// Visitor notes: validation, rate limiting and the two handlers. Kept apart from functions/api so tests can inject a clock and a KV.

export interface KV {
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}
export interface Env { NOTES?: KV; NOTES_KEY?: string }
type Ctx = { request: Request; env: Env };

export const TEXT_MAX = 500;
export const NAME_MAX = 40;
export const PAGE_MAX = 200;
export const PER_HOUR = 3;
export const SHOWN = 200;
const WINDOW_S = 3600;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export interface Note { text: string; name: string; page: string }
export type Checked = { ok: true; note: Note } | { ok: false };

/** Trimmed text of 1-500 chars, a name of at most 40, an empty honeypot and a same-site path. */
export function validateNote(body: unknown): Checked {
  if (!body || typeof body !== 'object') return { ok: false };
  const b = body as Record<string, unknown>;
  if (typeof b.text !== 'string') return { ok: false };
  const text = b.text.trim();
  if (text.length < 1 || text.length > TEXT_MAX) return { ok: false };
  const name = b.name === undefined || b.name === null ? '' : b.name;
  if (typeof name !== 'string' || name.trim().length > NAME_MAX) return { ok: false };
  if (b.hp !== undefined && b.hp !== null && b.hp !== '') return { ok: false };
  const page = b.page === undefined || b.page === null || b.page === '' ? '/' : b.page;
  // eslint-disable-next-line no-control-regex
  if (typeof page !== 'string' || page.length > PAGE_MAX || !page.startsWith('/') || page.startsWith('//') || /[\\\u0000-\u001f]/.test(page)) return { ok: false };
  return { ok: true, note: { text, name: name.trim(), page } };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** SHA-256 of the IP with a per-day salt (the UTC date, plus the artist's secret when set). The raw IP is never stored. */
export const visitorHash = (ip: string, day: string, secret = '') => sha256(`${day}|${secret}|${ip}`);

/** Constant-time string comparison: both sides are hashed to a fixed length, then compared without early exit. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const rand = () => hex(crypto.getRandomValues(new Uint8Array(6)).buffer);

export const makeNoteHandler = (deps: { now?: () => number } = {}) => async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const now = deps.now ?? Date.now;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const checked = validateNote(body);
  if (!checked.ok) return json({ error: 'bad request' }, 400);
  const kv = env.NOTES;
  if (!kv) return json({ error: 'unavailable' }, 503);

  const at = new Date(now()).toISOString();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rl = `rl:${await visitorHash(ip, at.slice(0, 10), env.NOTES_KEY)}`;
  const used = Number((await kv.get(rl)) ?? 0) || 0;
  if (used >= PER_HOUR) return json({ error: 'slow down' }, 429);

  const country = (request as Request & { cf?: { country?: string } }).cf?.country;
  const { text, name, page } = checked.note;
  await kv.put(`note:${at}:${rand()}`, JSON.stringify({ text, name, page, at, ...(country ? { country } : {}) }));
  await kv.put(rl, String(used + 1), { expirationTtl: WINDOW_S });
  return json({ ok: true }, 201);
};

export const makeNotesHandler = () => async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  const key = env.NOTES_KEY;
  // An unset key must never match anything, not even an empty token.
  if (!key || !m || !(await safeEqual(m[1], key))) return json({ error: 'unauthorized' }, 401);
  const kv = env.NOTES;
  if (!kv) return json({ error: 'unavailable' }, 503);

  // KV lists keys in ascending order, and note keys start with an ISO time, so the newest are last.
  const names: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const r = await kv.list({ prefix: 'note:', cursor });
    names.push(...r.keys.map((k) => k.name));
    if (r.list_complete || !r.cursor) break;
    cursor = r.cursor;
  }
  const newest = names.slice(-SHOWN).reverse();
  const values = await Promise.all(newest.map((n) => kv.get(n)));
  const notes = values.flatMap((v) => {
    try {
      return v ? [JSON.parse(v) as unknown] : [];
    } catch {
      return [];
    }
  });
  return json({ notes });
};
