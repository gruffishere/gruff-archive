import { describe, expect, it } from 'vitest';
import { mergeEvents } from '../../indexer/merge-events';
import type { ArchiveEvent } from '../../indexer/types';

const ev = (p: Partial<ArchiveEvent>): ArchiveEvent => ({
  id: 'x',
  kind: 'transfer',
  contract: '0xc',
  tokenId: '1',
  quantity: 1,
  from: '0xa',
  to: '0xb',
  priceWei: null,
  txHash: '0xt',
  timestamp: '2024-01-01T00:00:00.000Z',
  ...p,
});

describe('mergeEvents', () => {
  it('replaces the chain transfer of a sale and sorts newest first', () => {
    const chain = [ev({ id: 'c1', txHash: '0xsale' }), ev({ id: 'c2', kind: 'mint', txHash: '0xm', timestamp: '2023-01-01T00:00:00.000Z' })];
    const os = [ev({ id: 'o1', kind: 'sale', txHash: '0xsale', priceWei: '5' }), ev({ id: 'o2', kind: 'listed', txHash: null, timestamp: '2025-01-01T00:00:00.000Z' })];
    expect(mergeEvents(chain, os).map((e) => e.id)).toEqual(['o2', 'o1', 'c2']);
  });

  it('keeps both sales of one token and drops both matching chain transfers', () => {
    const chain = [ev({ id: 't1', txHash: '0xa' }), ev({ id: 't2', txHash: '0xb' })];
    const os = [
      ev({ id: 'os:0xO1:0xa:1:sale', kind: 'sale', txHash: '0xa', priceWei: '5', timestamp: '2024-02-01T00:00:00.000Z' }),
      ev({ id: 'os:0xO1:0xb:1:sale', kind: 'sale', txHash: '0xb', priceWei: '6', timestamp: '2024-03-01T00:00:00.000Z' }),
    ];
    expect(mergeEvents(chain, os).map((e) => e.id)).toEqual(['os:0xO1:0xb:1:sale', 'os:0xO1:0xa:1:sale']);
  });

  it('de-dupes by id', () => {
    expect(mergeEvents([ev({ id: 'a' })], [ev({ id: 'a', kind: 'listed', txHash: null })])).toHaveLength(1);
  });
});
