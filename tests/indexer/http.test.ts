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

  // 2026-11-23: an OpenSea response stalled and the abort never reached the transport, so a local run hung for over
  // an hour on one request. The timeout must end the wait on its own, whatever the transport does with the signal.
  it('gives up on a request whose transport ignores the abort, then retries', async () => {
    let calls = 0;
    const fetchJson = createFetchJson({
      fetchImpl: () => {
        calls++;
        return calls === 1 ? new Promise<Response>(() => {}) : Promise.resolve(new Response('{"ok":1}', { status: 200 }));
      },
      sleepImpl: noSleep,
      minIntervalMs: 0,
      timeoutMs: 20,
    });
    await expect(fetchJson('https://x.test/t')).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it('gives up on a body that stops arriving', async () => {
    const stalled = () => new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"a":')) }), { status: 200 });
    const fetchJson = createFetchJson({ fetchImpl: async () => stalled(), sleepImpl: noSleep, minIntervalMs: 0, timeoutMs: 20, retries: 1 });
    await expect(fetchJson('https://x.test/t')).rejects.toThrow(/timed out after 20 ms/);
  });
});
