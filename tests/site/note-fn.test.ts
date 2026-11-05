import { describe, expect, it } from 'vitest';
import { makeNoteHandler, makeNotesHandler, validateNote, type KV } from '../../functions/lib/note';

/** A fake KV with put/get/list and TTL, on a clock the test controls. */
const fakeKV = (clock: { now: number }) => {
  const m = new Map<string, { v: string; exp?: number }>();
  const live = () => [...m.entries()].filter(([, e]) => e.exp === undefined || e.exp > clock.now).sort(([a], [b]) => (a < b ? -1 : 1));
  const kv: KV & { dump: () => [string, string][] } = {
    async put(k, v, o) { m.set(k, { v, exp: o?.expirationTtl ? clock.now + o.expirationTtl * 1000 : undefined }); },
    async get(k) { const e = m.get(k); return e && (e.exp === undefined || e.exp > clock.now) ? e.v : null; },
    async list(o) {
      const all = live().filter(([k]) => k.startsWith(o?.prefix ?? ''));
      const start = o?.cursor ? Number(o.cursor) : 0;
      const limit = o?.limit ?? 1000;
      const page = all.slice(start, start + limit);
      const more = start + limit < all.length;
      return { keys: page.map(([name]) => ({ name })), list_complete: !more, cursor: more ? String(start + limit) : undefined };
    },
    dump: () => live().map(([k, e]) => [k, e.v]),
  };
  return kv;
};

const KEY = 'test-key-not-real';
const setup = () => {
  const clock = { now: Date.parse('2026-11-06T10:00:00Z') };
  const NOTES = fakeKV(clock);
  const env = { NOTES, NOTES_KEY: KEY };
  const post = makeNoteHandler({ now: () => clock.now });
  const get = makeNotesHandler();
  const send = (body: unknown, ip = '203.0.113.7', e: object = env) =>
    post({ request: new Request('https://gruff.test/api/note', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env: e as never });
  const read = (auth?: string, e: object = env) =>
    get({ request: new Request('https://gruff.test/api/notes', { headers: auth ? { authorization: auth } : {} }), env: e as never });
  return { clock, NOTES, env, send, read };
};
const ok = { text: 'hello there', name: '@visitor', hp: '', page: '/catalog/' };

describe('validateNote', () => {
  it('trims and accepts a good note', () => {
    expect(validateNote({ ...ok, text: '  hi  ' })).toEqual({ ok: true, note: { text: 'hi', name: '@visitor', page: '/catalog/' } });
  });
  it('rejects bad text', () => {
    for (const text of ['', '   ', 'x'.repeat(501), 5, null, undefined]) expect(validateNote({ ...ok, text }).ok).toBe(false);
    expect(validateNote({ ...ok, text: 'x'.repeat(500) }).ok).toBe(true);
  });
  it('limits name to 40 and allows none', () => {
    expect(validateNote({ ...ok, name: 'n'.repeat(41) }).ok).toBe(false);
    expect(validateNote({ ...ok, name: 'n'.repeat(40) }).ok).toBe(true);
    expect(validateNote({ text: 'a' }).ok).toBe(true);
  });
  it('requires an empty honeypot', () => {
    expect(validateNote({ ...ok, hp: 'x' }).ok).toBe(false);
  });
  it('accepts only same-site paths up to 200 chars', () => {
    for (const page of ['https://evil.test/', '//evil.test', 'catalog', '/a\\b', `/${'a'.repeat(200)}`, 3]) expect(validateNote({ ...ok, page }).ok).toBe(false);
    expect(validateNote({ ...ok, page: `/${'a'.repeat(199)}` }).ok).toBe(true);
  });
  it('rejects non-objects', () => {
    expect(validateNote(null).ok).toBe(false);
    expect(validateNote('x').ok).toBe(false);
  });
});

describe('POST /api/note', () => {
  it('stores a valid note under note:<iso>:<rand> with country and returns 201', async () => {
    const { NOTES } = setup();
    const req = new Request('https://gruff.test/api/note', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify(ok) });
    Object.defineProperty(req, 'cf', { value: { country: 'TR' } });
    const res = await makeNoteHandler({ now: () => Date.parse('2026-11-06T10:00:00Z') })({ request: req, env: { NOTES, NOTES_KEY: KEY } });
    expect(res.status).toBe(201);
    const notes = NOTES.dump().filter(([k]) => k.startsWith('note:'));
    expect(notes).toHaveLength(1);
    expect(notes[0][0]).toMatch(/^note:2026-11-06T10:00:00\.000Z:[0-9a-f]+$/);
    expect(JSON.parse(notes[0][1])).toEqual({ text: 'hello there', name: '@visitor', page: '/catalog/', at: '2026-11-06T10:00:00.000Z', country: 'TR' });
  });
  it('omits country when unknown', async () => {
    const { send, NOTES } = setup();
    await send(ok);
    expect(JSON.parse(NOTES.dump().find(([k]) => k.startsWith('note:'))![1])).not.toHaveProperty('country');
  });
  it('400 on invalid json, invalid input and a filled honeypot, storing nothing', async () => {
    const { send, NOTES } = setup();
    expect((await send('{nope')).status).toBe(400);
    expect((await send({ ...ok, text: '' })).status).toBe(400);
    expect((await send({ ...ok, hp: 'bot' })).status).toBe(400);
    expect(NOTES.dump()).toEqual([]);
  });
  it('503 without the NOTES binding', async () => {
    const { send } = setup();
    expect((await send(ok, '1.1.1.1', {})).status).toBe(503);
  });
  it('429 after 3 notes an hour per visitor, then allows again after the TTL', async () => {
    const { send, clock } = setup();
    for (let i = 0; i < 3; i++) expect((await send(ok)).status).toBe(201);
    expect((await send(ok)).status).toBe(429);
    expect((await send(ok, '198.51.100.99')).status).toBe(201);
    clock.now += 3601_000;
    expect((await send(ok)).status).toBe(201);
  });
  it('does not count rejected notes against the limit', async () => {
    const { send } = setup();
    for (let i = 0; i < 5; i++) await send({ ...ok, text: '' });
    expect((await send(ok)).status).toBe(201);
  });
  it('never stores the raw IP', async () => {
    const { send, NOTES } = setup();
    const ip = '203.0.113.77';
    await send(ok, ip);
    expect(JSON.stringify(NOTES.dump())).not.toContain(ip);
    expect(NOTES.dump().some(([k]) => k.startsWith('rl:'))).toBe(true);
  });
  it('sends no-store', async () => {
    const { send } = setup();
    expect((await send(ok)).headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/notes', () => {
  it('401 without or with a wrong key, and when NOTES_KEY is unset or empty', async () => {
    const { read, env } = setup();
    expect((await read()).status).toBe(401);
    expect((await read('Bearer wrong')).status).toBe(401);
    expect((await read('Basic ' + KEY)).status).toBe(401);
    expect((await read(`Bearer ${KEY}`, { NOTES: env.NOTES })).status).toBe(401);
    expect((await read('Bearer ', { ...env, NOTES_KEY: '' })).status).toBe(401);
  });
  it('503 without the binding (with a good key)', async () => {
    const { read } = setup();
    expect((await read(`Bearer ${KEY}`, { NOTES_KEY: KEY })).status).toBe(503);
  });
  it('returns notes newest first, capped at 200', async () => {
    const { send, read, clock } = setup();
    for (let i = 0; i < 205; i++) {
      clock.now += 1000;
      expect((await send({ ...ok, text: `n${i}` }, `10.0.${Math.floor(i / 3)}.${i % 3}`)).status).toBe(201);
    }
    const res = await read(`Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { notes } = (await res.json()) as { notes: { text: string; at: string }[] };
    expect(notes).toHaveLength(200);
    expect(notes[0].text).toBe('n204');
    expect(notes[199].text).toBe('n5');
    expect(notes.map((n) => n.at)).toEqual([...notes.map((n) => n.at)].sort().reverse());
  });
  it('skips rate-limit keys and tolerates a corrupt value', async () => {
    const { send, read, NOTES } = setup();
    await send(ok);
    await NOTES.put('note:2026-11-06T09:00:00.000Z:dead', 'not json');
    const { notes } = (await (await read(`Bearer ${KEY}`)).json()) as { notes: unknown[] };
    expect(notes).toHaveLength(1);
  });
});
