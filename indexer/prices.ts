import type { FetchJson } from './http';

/** CoinGecko, then Coinbase; when both fail the previous value is kept (null on a first run). */
export async function ethUsd(fetchJson: FetchJson, previous: number | null = null): Promise<number | null> {
  try {
    const r = await fetchJson<{ ethereum?: { usd?: number } }>('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (typeof r.ethereum?.usd === 'number') return r.ethereum.usd;
  } catch {
    // fall through to the next source
  }
  try {
    const r = await fetchJson<{ data?: { amount?: string } }>('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    const n = Number(r.data?.amount);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // fall through to the previous value
  }
  return previous;
}
