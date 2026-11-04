import { describe, expect, it } from 'vitest';
import { ZERO } from '../../indexer/ledger';
import { mintInfo } from '../../indexer/mint-prices';
import type { RawTransfer } from '../../indexer/types';

const mint = (tokenId: string, txHash: string, block: number, value = '1', to = '0xa'): RawTransfer => ({
  contract: '0xc',
  tokenId,
  from: ZERO,
  to,
  fromEns: null,
  toEns: null,
  value,
  txHash,
  logIndex: 0,
  blockNumber: block,
  timestamp: new Date(Date.UTC(2024, 0, block)).toISOString(),
});

describe('mintInfo', () => {
  it('uses the earliest paid mint for the price and the earliest mint for the date', async () => {
    const values: Record<string, string> = { '0xm1': '0', '0xm2': '20000000000000000', '0xm3': '0' };
    const lookups: string[] = [];
    const info = await mintInfo(
      [mint('1', '0xm1', 1), mint('1', '0xm2', 2, '2', '0xb'), mint('2', '0xm3', 3)],
      async (h) => {
        lookups.push(h);
        return values[h];
      },
    );
    expect(info.get('1')).toEqual({ at: '2024-01-01T00:00:00.000Z', txHash: '0xm1', priceWei: '10000000000000000', primary: false });
    expect(info.get('2')).toEqual({ at: '2024-01-03T00:00:00.000Z', txHash: '0xm3', priceWei: null, primary: false });
    expect(lookups).toEqual(['0xm1', '0xm2', '0xm3']);
  });

  it('divides by every unit minted in the tx across tokens', async () => {
    const info = await mintInfo([mint('1', '0xab', 1), mint('2', '0xab', 1)], async () => '60000000000000000');
    expect(info.get('1')?.priceWei).toBe('30000000000000000');
  });

  it('stops looking after maxLookupsPerToken', async () => {
    const transfers = Array.from({ length: 8 }, (_, i) => mint('1', `0x${i}`, i + 1));
    let n = 0;
    const info = await mintInfo(transfers, async () => {
      n++;
      return '0';
    }, 5);
    expect(n).toBe(5);
    expect(info.get('1')?.priceWei).toBeNull();
  });
});

describe('mintInfo with zero-value mints (I1)', () => {
  it('ignores zero-value mints for units and price', async () => {
    const info = await mintInfo(
      [mint('1', '0xpaid', 2, '2', '0xb'), mint('1', '0xpaid', 2, '0', '0xc')],
      async () => '20000000000000000',
    );
    expect(info.get('1')?.priceWei).toBe('10000000000000000');
  });

  it('dates the mint from the first non-zero mint when one exists', async () => {
    const info = await mintInfo([mint('1', '0xzero', 1, '0'), mint('1', '0xreal', 3, '1')], async () => '0');
    expect(info.get('1')).toMatchObject({ txHash: '0xreal', at: '2024-01-03T00:00:00.000Z' });
  });

  it('falls back to the zero-value creation mint and never looks up its tx', async () => {
    const lookups: string[] = [];
    const info = await mintInfo([mint('1', '0xzero', 1, '0')], async (h) => {
      lookups.push(h);
      return '5';
    });
    expect(info.get('1')).toEqual({ at: '2024-01-01T00:00:00.000Z', txHash: '0xzero', priceWei: null, primary: false });
    expect(lookups).toEqual([]);
  });
});
