import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeHandler } from '../../functions/api/listing';
import { parseQuery } from '../../functions/lib/listing';

const C = '0x3be88adf4d68c32bad5707588c7d25e1af8644e0';
// the allowlist is injected: this test must not depend on what the catalog currently holds
const onRequestGet = makeHandler(new Set([C]));
const req = (qs: string) => new Request(`https://gruff.test/api/listing?${qs}`);
const env = { OPENSEA_API_KEY: 'k' };
const okContract = (url: string) => url.includes('/contract/');
afterEach(() => vi.unstubAllGlobals());

describe('parseQuery', () => {
  it('accepts a contract and numeric id', () => {
    expect(parseQuery(new URL(`https://x/api?contract=${C.toUpperCase().replace('0X', '0x')}&id=12`))).toEqual({ contract: C, id: '12' });
  });
  it('rejects bad input', () => {
    expect(parseQuery(new URL('https://x/api?contract=0x12&id=1'))).toBeNull();
    expect(parseQuery(new URL(`https://x/api?contract=${C}&id=1a`))).toBeNull();
  });
});

describe('GET /api/listing', () => {
  it('returns 400 for bad input and 503 without a key', async () => {
    expect((await onRequestGet({ request: req('contract=0x1&id=1'), env: {} })).status).toBe(400);
    expect((await onRequestGet({ request: req(`contract=${C}&id=1`), env: {} })).status).toBe(503);
  });

  it('returns the normalized best listing', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('/chain/ethereum/contract/')) return new Response(JSON.stringify({ collection: 'silver-surfer' }));
      return new Response(JSON.stringify({ order_hash: '0x1', price: { current: { currency: 'ETH', decimals: 18, value: '450000000000000000' } }, protocol_data: { parameters: { offerer: '0xMAKER', startTime: '1730800000', offer: [{ token: C, identifierOrCriteria: '1', startAmount: '1' }] } } }));
    });
    const res = await onRequestGet({ request: req(`contract=${C}&id=1`), env: { OPENSEA_API_KEY: 'k' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await res.json()).toEqual({ listing: { tokenId: '1', priceWei: '450000000000000000', maker: '0xmaker', at: '2024-11-05T09:46:40.000Z' } });
    expect(calls[1]).toContain('/listings/collection/silver-surfer/nfts/1/best');
  });

  it('returns null when nothing is listed and 502 on upstream errors', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.includes('/contract/') ? new Response(JSON.stringify({ collection: 's' })) : new Response('{}', { status: 404 })));
    expect(await (await onRequestGet({ request: req(`contract=${C}&id=1`), env: { OPENSEA_API_KEY: 'k' } })).json()).toEqual({ listing: null });
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    expect((await onRequestGet({ request: req(`contract=${C}&id=1`), env: { OPENSEA_API_KEY: 'k' } })).status).toBe(502);
  });

  it('rejects unknown contracts before any upstream call', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await onRequestGet({ request: req(`contract=0x${'ab'.repeat(20)}&id=1`), env });
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'unknown contract' });
    expect(f).not.toHaveBeenCalled();
  });

  it('returns 502 on a timeout or abort', async () => {
    vi.stubGlobal('fetch', async () => { throw new DOMException('timed out', 'TimeoutError'); });
    const res = await onRequestGet({ request: req(`contract=${C}&id=1`), env });
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('passes an abort signal to every upstream call', async () => {
    const signals: unknown[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      signals.push(init.signal);
      return okContract(url) ? new Response(JSON.stringify({ collection: 's' })) : new Response('{}', { status: 404 });
    });
    await onRequestGet({ request: req(`contract=${C}&id=1`), env });
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it('returns 502 when the best-listing call fails and does not cache it', async () => {
    const put = vi.fn();
    vi.stubGlobal('caches', { default: { match: async () => undefined, put } });
    vi.stubGlobal('fetch', async (url: string) => (okContract(url) ? new Response(JSON.stringify({ collection: 's' })) : new Response('x', { status: 500 })));
    expect((await onRequestGet({ request: req(`contract=${C}&id=1`), env })).status).toBe(502);
    expect(put).not.toHaveBeenCalled();
  });

  it('encodes the collection slug in the upstream path', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return okContract(url) ? new Response(JSON.stringify({ collection: 'a/b?c' })) : new Response('{}', { status: 404 });
    });
    await onRequestGet({ request: req(`contract=${C}&id=1`), env });
    expect(calls[1]).toContain('/collection/a%2Fb%3Fc/nfts/1/best');
  });

  it('answers from the edge cache without fetching, and stores 200s', async () => {
    const cached = new Response(JSON.stringify({ listing: null }));
    const match = vi.fn(async () => cached);
    vi.stubGlobal('caches', { default: { match, put: vi.fn() } });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await onRequestGet({ request: req(`contract=${C.toUpperCase().replace('0X', '0x')}&id=1`), env })).toBe(cached);
    expect(f).not.toHaveBeenCalled();
    expect((match.mock.calls[0] as unknown as [Request])[0].url).toBe(`https://gruff.test/api/listing?contract=${C}&id=1`);

    const put = vi.fn();
    vi.stubGlobal('caches', { default: { match: async () => undefined, put } });
    vi.stubGlobal('fetch', async (url: string) => (okContract(url) ? new Response(JSON.stringify({ collection: 's' })) : new Response('{}', { status: 404 })));
    expect((await onRequestGet({ request: req(`contract=${C}&id=1`), env })).status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
