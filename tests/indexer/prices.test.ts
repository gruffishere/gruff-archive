import { describe, expect, it } from 'vitest';
import type { FetchJson } from '../../indexer/http';
import { ethUsd } from '../../indexer/prices';

const fake = (routes: Record<string, unknown>) =>
  (async (url: string) => {
    const r = Object.entries(routes).find(([k]) => url.includes(k))?.[1];
    if (r instanceof Error || r === undefined) throw r ?? new Error('no route');
    return r;
  }) as unknown as FetchJson;

describe('ethUsd (M10)', () => {
  it('uses CoinGecko first', async () => {
    expect(await ethUsd(fake({ coingecko: { ethereum: { usd: 3100.5 } } }))).toBe(3100.5);
  });

  it('falls back to Coinbase when CoinGecko fails', async () => {
    expect(await ethUsd(fake({ coingecko: new Error('429'), 'api.coinbase.com/v2/prices/ETH-USD/spot': { data: { amount: '3050.25' } } }))).toBe(3050.25);
  });

  it('keeps the previous value when every source fails', async () => {
    expect(await ethUsd(fake({}), 2999)).toBe(2999);
    expect(await ethUsd(fake({}))).toBeNull();
  });
});
