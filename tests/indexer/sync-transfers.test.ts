import { describe, expect, it } from 'vitest';
import { syncTransfers } from '../../indexer/sync-transfers';
import type { RawTransfer } from '../../indexer/types';

const t = (block: number, log = 0, tokenId = '1'): RawTransfer => ({
  contract: '0xc',
  tokenId,
  from: '0x0000000000000000000000000000000000000000',
  to: '0xa',
  fromEns: null,
  toEns: null,
  value: '1',
  txHash: `0x${block}`,
  logIndex: log,
  blockNumber: block,
  timestamp: new Date(Date.UTC(2024, 0, block)).toISOString(),
});

async function* from(items: RawTransfer[], counter?: { n: number }) {
  for (const i of items) {
    if (counter) counter.n++;
    yield i;
  }
}

describe('syncTransfers', () => {
  it('does a full sync from empty and sorts ascending', async () => {
    const r = await syncTransfers([], from([t(3), t(2), t(1)]));
    expect(r.transfers.map((x) => x.blockNumber)).toEqual([1, 2, 3]);
    expect(r.added).toBe(3);
  });

  it('adds only new transfers and stops after enough known ones', async () => {
    const existing = Array.from({ length: 60 }, (_, i) => t(i + 1));
    const counter = { n: 0 };
    const r = await syncTransfers(existing, from([t(62), t(61), ...[...existing].reverse()], counter), 50);
    expect(r.added).toBe(2);
    expect(r.transfers).toHaveLength(62);
    expect(counter.n).toBe(52);
  });

  it('treats the same tx + log + token as one transfer', async () => {
    const r = await syncTransfers([t(5, 1)], from([t(5, 1), t(5, 2)]));
    expect(r.added).toBe(1);
    expect(r.transfers.map((x) => x.logIndex)).toEqual([1, 2]);
  });
});
