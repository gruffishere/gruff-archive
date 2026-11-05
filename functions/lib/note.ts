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

export const BODY_MAX = 4096;
export const DAY_MAX = 150;
const KEY_SPAN = 9999999999999;

/** Keys count down, so a plain ascending list returns the newest note first. */
export const noteKey = (ms: number) => `note:${String(Math.max(0, KEY_SPAN - ms)).padStart(13, '0')}:${rand()}`;

/** IPv4 stays whole; an IPv6 address is reduced to its /64 prefix, since one household owns the whole range. */
export function ipBucket(ip: string): string {
  if (!ip.includes(':') || ip.includes('.')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return groups.slice(0, 4).map((g) => (parseInt(g || '0', 16) || 0).toString(16)).join(':') + '::/64';
}

export const makeNoteHandler = (deps: { now?: () => number } = {}) => async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return json({ error: 'unsupported' }, 415);
  let originHost = '';
  try {
    originHost = new URL(request.headers.get('origin') ?? '').host;
  } catch {
    // missing or malformed
  }
  if (!originHost || originHost !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > BODY_MAX) return json({ error: 'too large' }, 413);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (raw.length > BODY_MAX) return json({ error: 'too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const checked = validateNote(body);
  if (!checked.ok) return json({ error: 'bad request' }, 400);
  const kv = env.NOTES;
  if (!kv) return json({ error: 'unavailable' }, 503);

  const t = now();
  const at = new Date(t).toISOString();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const country = (request as Request & { cf?: { country?: string } }).cf?.country;
  const { text, name, page } = checked.note;
  try {
    const dayKey = `day:${at.slice(0, 10)}`;
    const today = Number((await kv.get(dayKey)) ?? 0) || 0;
    if (today >= DAY_MAX) return json({ error: 'slow down' }, 429);
    const rl = `rl:${await visitorHash(ipBucket(ip), at.slice(0, 10), env.NOTES_KEY)}`;
    const used = Number((await kv.get(rl)) ?? 0) || 0;
    if (used >= PER_HOUR) return json({ error: 'slow down' }, 429);
    await kv.put(noteKey(t), JSON.stringify({ text, name, page, at, ...(country ? { country } : {}) }));
    await kv.put(rl, String(used + 1), { expirationTtl: WINDOW_S });
    await kv.put(dayKey, String(today + 1), { expirationTtl: 86400 });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
  return json({ ok: true }, 201);
};

export const makeNotesHandler = () => async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  const key = env.NOTES_KEY?.trim();
  // An unset key must never match anything, not even an empty token. The client percent-encodes the key so any language fits in a header.
  if (!key || !m || !(await safeEqual(m[1], encodeURIComponent(key)))) return json({ error: 'unauthorized' }, 401);
  const kv = env.NOTES;
  if (!kv) return json({ error: 'unavailable' }, 503);
  try {
    // Keys count down from a fixed span, so the first 200 listed are the newest.
    const { keys } = await kv.list({ prefix: 'note:', limit: SHOWN });
    const values = await Promise.all(keys.map((k) => kv.get(k.name)));
    const notes = values.flatMap((v) => {
      try {
        return v ? [JSON.parse(v) as { at?: string }] : [];
      } catch {
        return [];
      }
    });
    notes.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
    return json({ notes });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
};
