import { describe, expect, it } from 'vitest';
import type { FetchJson } from '../../indexer/http';
import { bestListings, createOpenSea, ethToWei, normalizeListing, normalizeOsEvent, type OsRawEvent, type OsRawListing } from '../../indexer/opensea';

const C = '0x3be88adf4d68c32bad5707588c7d25e1af8644e0';

const sale: OsRawEvent = {
  event_type: 'sale',
  event_timestamp: 1730700000,
  transaction: '0xT1',
  order_hash: '0xO1',
  nft: { identifier: '2', contract: '0x3BE88ADF4D68C32BAD5707588C7D25E1AF8644E0' },
  quantity: 1,
  seller: '0xSELLER',
  buyer: '0xBUYER',
  payment: { quantity: '300000000000000000', decimals: 18, symbol: 'ETH' },
};

const listingEvent: OsRawEvent = {
  event_type: 'order',
  order_type: 'listing',
  event_timestamp: 1730800000,
  order_hash: '0xO2',
  asset: { identifier: '3', contract: C },
  quantity: 1,
  maker: '0xMAKER',
  payment: { quantity: '450000000000000000', decimals: 18, symbol: 'ETH' },
};

const listing = (tokenId: string, value: string, amount = '1'): OsRawListing => ({
  order_hash: `0x${tokenId}${value}`,
  price: { current: { currency: 'ETH', decimals: 18, value } },
  protocol_data: { parameters: { offerer: '0xMAKER', startTime: '1730800000', offer: [{ token: C, identifierOrCriteria: tokenId, startAmount: amount }] } },
});

describe('normalizeOsEvent', () => {
  it('maps a sale', () => {
    expect(normalizeOsEvent(sale, C)).toEqual({
      id: 'os:0xO1:0xt1:2:sale',
      kind: 'sale',
      contract: C,
      tokenId: '2',
      quantity: 1,
      from: '0xseller',
      to: '0xbuyer',
      priceWei: '300000000000000000',
      txHash: '0xt1',
      timestamp: '2024-11-04T06:00:00.000Z',
    });
  });

  it('maps an order/listing event', () => {
    const e = normalizeOsEvent(listingEvent, C);
    expect(e?.kind).toBe('listed');
    expect(e?.from).toBe('0xmaker');
    expect(e?.priceWei).toBe('450000000000000000');
  });

  it('ignores other contracts and other event types', () => {
    expect(normalizeOsEvent({ ...sale, nft: { identifier: '2', contract: '0xother' } }, C)).toBeNull();
    expect(normalizeOsEvent({ ...sale, event_type: 'transfer' }, C)).toBeNull();
  });

  it('gives each sale fill its own id when the order hash repeats', () => {
    const fill1 = normalizeOsEvent({ ...sale, transaction: '0xT1' }, C);
    const fill2 = normalizeOsEvent({ ...sale, transaction: '0xT2' }, C);
    expect(fill1?.id).toBe('os:0xO1:0xt1:2:sale');
    expect(fill2?.id).toBe('os:0xO1:0xt2:2:sale');
  });
});

describe('normalizeListing currency', () => {
  const priced = (currency: string): OsRawListing => ({
    ...listing('1', '500'),
    price: { current: { currency, decimals: 18, value: '500' } },
  });

  it('accepts a WETH listing', () => {
    expect(normalizeListing(priced('WETH'), C)?.priceWei).toBe('500');
  });

  it('rejects a USDC listing', () => {
    expect(normalizeListing(priced('USDC'), C)).toBeNull();
  });
});

describe('floorWei', () => {
  const stats = (floor_price: number) => (async () => ({ total: { floor_price } })) as unknown as FetchJson;

  it('returns null for a zero floor', async () => {
    await expect(createOpenSea(stats(0), 'K').floorWei('x')).resolves.toBeNull();
  });

  it('converts a positive floor to wei', async () => {
    await expect(createOpenSea(stats(0.064), 'K').floorWei('x')).resolves.toBe('64000000000000000');
  });
});

describe('listings', () => {
  it('normalizes per-unit price and keeps the cheapest per token', () => {
    const list = [listing('1', '500'), listing('1', '300'), listing('2', '1000', '4')].map((l) => normalizeListing(l, C)!);
    const best = bestListings(list);
    expect(best.get('1')?.priceWei).toBe('300');
    expect(best.get('2')?.priceWei).toBe('250');
    expect(best.get('1')?.at).toBe('2024-11-05T09:46:40.000Z');
  });
});

describe('ethToWei', () => {
  it('converts float eth', () => {
    expect(ethToWei(0.064)).toBe('64000000000000000');
  });
});

describe('createOpenSea', () => {
  it('pages events with the api key and both event types', async () => {
    const urls: string[] = [];
    const keys: string[] = [];
    const fetchJson = (async (url: string, init?: { headers?: Record<string, string> }) => {
      urls.push(url);
      keys.push(init?.headers?.['x-api-key'] ?? '');
      return urls.length === 1 ? { asset_events: [sale], next: 'CUR' } : { asset_events: [listingEvent], next: null };
    }) as unknown as FetchJson;
    const os = createOpenSea(fetchJson, 'KEY');
    const got: OsRawEvent[] = [];
    for await (const e of os.events('silver-surfer', 1700000000)) got.push(e);
    expect(got).toHaveLength(2);
    expect(urls[0]).toContain('/events/collection/silver-surfer?event_type=sale&event_type=listing&after=1700000000&limit=50');
    expect(urls[1]).toContain('next=CUR');
    expect(keys).toEqual(['KEY', 'KEY']);
  });

  it('returns null for a missing best listing', async () => {
    const { HttpError } = await import('../../indexer/http');
    const fetchJson = (async (url: string) => {
      throw new HttpError(404, url);
    }) as unknown as FetchJson;
    await expect(createOpenSea(fetchJson, 'K').bestListing('x', '1')).resolves.toBeNull();
  });
});
