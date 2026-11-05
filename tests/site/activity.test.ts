import { describe, expect, it } from 'vitest';
import type { ActivityRow, KeeperOut } from '../../src/lib/data';
import { formatStamp } from '../../src/lib/format';
import { collapseMints, latestByKind, summary, summaryMonths, toDisplayRows } from '../../src/lib/activity';

export const row = (p: Partial<ActivityRow>): ActivityRow => ({
  id: 'e1', kind: 'sale', contract: '0xc', tokenId: '1', quantity: 1, from: '0x00000000000000000000000000000000000000a1', to: '0x00000000000000000000000000000000000000b2',
  priceWei: '1000', txHash: '0xt', timestamp: '2026-11-04T14:02:00.000Z', slug: 'worthless', code: '366', tokenName: 'WORTHLESS', accession: 'GRF.25.366', thumb: '/media/w-t.webp', fromEns: null, toEns: 'keeper.eth', ...p,
});

describe('toDisplayRows', () => {
  it('maps an event to a display row with names', () => {
    expect(toDisplayRows([row({})])[0]).toMatchObject({ key: 'e1', label: 'sale', ids: ['1'], fromName: '0x000…0a1', toName: 'keeper.eth' });
  });
});

describe('collapseMints', () => {
  it('merges mints of one tx to one recipient', () => {
    const rows = [
      row({ id: 'a', kind: 'mint', tokenId: '2203', txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null }),
      row({ id: 'b', kind: 'mint', tokenId: '2202', txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null }),
      row({ id: 'c', kind: 'mint', tokenId: '2201', txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null }),
      row({ id: 'd', kind: 'sale' }),
    ];
    const out = collapseMints(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ label: 'mint ×3', ids: ['2203', '2202', '2201'] });
  });
});

describe('collapseMints edge cases', () => {
  const mint = (id: string, tokenId: string, extra: Partial<ActivityRow> = {}) => row({ id, kind: 'mint', tokenId, txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null, ...extra });
  it('does not merge mints to different recipients', () => {
    expect(collapseMints([mint('a', '2', {}), mint('b', '1', { to: '0x00000000000000000000000000000000000000d4' })])).toHaveLength(2);
  });
  it('does not merge across an intervening row', () => {
    expect(collapseMints([mint('a', '3'), row({ id: 's', kind: 'sale' }), mint('b', '2')])).toHaveLength(3);
  });
  it('sums quantities in the label', () => {
    const out = collapseMints([mint('a', '3', { quantity: 2 }), mint('b', '2', { quantity: 5 })]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('mint ×7');
  });
});

describe('summary', () => {
  it('counts recent sales, volume and new keepers', () => {
    const now = new Date('2026-11-05T00:00:00.000Z');
    const rows = [row({ priceWei: '100', timestamp: '2026-11-01T00:00:00.000Z' }), row({ id: 'x', priceWei: '50', timestamp: '2026-09-01T00:00:00.000Z' }), row({ id: 'y', kind: 'mint', priceWei: null })];
    const k = [{ firstAcquired: '2026-10-20T00:00:00.000Z' }, { firstAcquired: '2024-01-01T00:00:00.000Z' }] as KeeperOut[];
    expect(summary(rows, k, now)).toEqual({ sales: 1, volumeWei: '100', newKeepers: 1 });
  });
});

describe('summary edge cases', () => {
  const now = new Date('2026-11-05T00:00:00.000Z');
  it('excludes non-sale kinds from volume', () => {
    const rows = [row({ id: 'a', kind: 'transfer', priceWei: '900', timestamp: '2026-11-01T00:00:00.000Z' }), row({ id: 'b', kind: 'listed', priceWei: '800', timestamp: '2026-11-01T00:00:00.000Z' })];
    expect(summary(rows, [], now)).toEqual({ sales: 0, volumeWei: '0', newKeepers: 0 });
  });
  it('counts a null price as zero', () => {
    expect(summary([row({ priceWei: null, timestamp: '2026-11-01T00:00:00.000Z' })], [], now)).toEqual({ sales: 1, volumeWei: '0', newKeepers: 0 });
  });
  it('includes exactly 30 days back and excludes older', () => {
    const rows = [row({ id: 'a', priceWei: '5', timestamp: '2026-10-06T00:00:00.000Z' }), row({ id: 'b', priceWei: '7', timestamp: '2026-10-05T23:59:59.999Z' })];
    expect(summary(rows, [], now)).toEqual({ sales: 1, volumeWei: '5', newKeepers: 0 });
  });
});

describe('formatStamp', () => {
  it('is an absolute UTC date and time', () => {
    expect(formatStamp('2026-11-05T14:02:00.000Z')).toBe('05.11.2026 14:02 utc');
  });
});

describe('summaryMonths', () => {
  it('names the current and previous month when the window crosses a boundary', () => {
    expect(summaryMonths(new Date('2026-11-05T12:00:00.000Z'))).toEqual(['2026-11', '2026-10']);
    expect(summaryMonths(new Date('2027-01-10T00:00:00.000Z'))).toEqual(['2027-01', '2026-12']);
  });
  it('names a single month when the window stays inside it', () => {
    expect(summaryMonths(new Date('2026-03-31T12:00:00.000Z'))).toEqual(['2026-03']);
  });
  it('counts sales that a short latest list would have missed', () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const sale = row({ priceWei: '7', timestamp: '2026-10-10T00:00:00.000Z' });
    expect(summary([sale], [], now)).toEqual({ sales: 1, volumeWei: '7', newKeepers: 0 });
  });
});

describe('latestByKind', () => {
  const months = [
    [row({ id: 'a', kind: 'mint', timestamp: '2026-09-30T00:00:00.000Z' }), row({ id: 'b', kind: 'transfer', timestamp: '2026-09-29T00:00:00.000Z' }), row({ id: 'c', kind: 'mint', timestamp: '2026-09-28T00:00:00.000Z' })],
    [row({ id: 'd', kind: 'mint', timestamp: '2026-08-30T00:00:00.000Z' }), row({ id: 'e', kind: 'sale', timestamp: '2026-08-29T00:00:00.000Z' })],
  ];
  it('takes the newest rows of one kind across months', () => {
    expect(latestByKind(months, 'mint', 2).map((r) => r.id)).toEqual(['a', 'c']);
    expect(latestByKind(months, 'mint', 10).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });
  it('sorts newest first even when months are given oldest first', () => {
    expect(latestByKind([...months].reverse(), 'mint', 3).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });
  it('is empty when the kind never happened', () => {
    expect(latestByKind(months, 'listed', 5)).toEqual([]);
  });
});
