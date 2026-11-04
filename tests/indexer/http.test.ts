import { describe, expect, it } from 'vitest';
import { createFetchJson, HttpError } from '../../indexer/http';

const noSleep = async () => {};

describe('createFetchJson', () => {
  it('retries a 500 and then returns json', async () => {
    const responses = [new Response('boom', { status: 500 }), new Response(JSON.stringify({ ok: 1 }), { status: 200 })];
    let calls = 0;
    const fetchJson = createFetchJson({ fetchImpl: async () => responses[calls++], sleepImpl: noSleep, minIntervalMs: 0 });
    await expect(fetchJson('https://x.test/a')).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it('retries a 200 response whose body fails to parse', async () => {
    const responses = [new Response('{not json', { status: 200 }), new Response(JSON.stringify({ ok: 1 }), { status: 200 })];
    let calls = 0;
    const fetchJson = createFetchJson({ fetchImpl: async () => responses[calls++], sleepImpl: noSleep, minIntervalMs: 0 });
    await expect(fetchJson('https://x.test/d')).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it('throws HttpError on 404 without retrying', async () => {
    let calls = 0;
    const fetchJson = createFetchJson({
      fetchImpl: async () => {
        calls++;
        return new Response('nope', { status: 404 });
      },
      sleepImpl: noSleep,
      minIntervalMs: 0,
    });
    await expect(fetchJson('https://x.test/b')).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });

  it('sends custom headers', async () => {
    let seen: Record<string, string> = {};
    const fetchJson = createFetchJson({
      fetchImpl: async (_url, init) => {
        seen = init?.headers as Record<string, string>;
        return new Response('{}', { status: 200 });
      },
      sleepImpl: noSleep,
      minIntervalMs: 0,
    });
    await fetchJson('https://x.test/c', { headers: { 'x-api-key': 'k' } });
    expect(seen['x-api-key']).toBe('k');
  });
});

describe('createFetchJson timeout (M11)', () => {
  it('passes an abort signal to every request', async () => {
    let signal: AbortSignal | null | undefined;
    const fetchJson = createFetchJson({
      fetchImpl: async (_u, init) => {
        signal = init?.signal;
        return new Response('{}', { status: 200 });
      },
      sleepImpl: noSleep,
      minIntervalMs: 0,
    });
    await fetchJson('https://x.test/t');
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
