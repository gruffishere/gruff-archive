import { describe, expect, it } from 'vitest';
import type { KeeperOut } from '../../src/lib/data';
import { maskCells, matchesQuery, sortKeepers } from '../../src/lib/keepers';

const k = (p: Partial<KeeperOut>) => ({ address: '0x00000000000000000000000000000000000000a1', ens: null, pieces: 1, works: 1, collections: [], mask: '00', firstAcquired: '2024-01-01T00:00:00.000Z', lastAcquired: null, fromArtist: { pieces: 0, paidWei: '0' }, firstFromArtist: null, longestHeld: null, holdings: [], ...p }) as KeeperOut;

describe('keepers', () => {
  const list = [
    k({ address: '0xa', pieces: 10, works: 1, mask: '10', firstAcquired: '2025-01-01T00:00:00.000Z' }),
    k({ address: '0xb', pieces: 3, works: 3, mask: '11', firstAcquired: '2023-01-01T00:00:00.000Z' }),
    k({ address: '0xc', pieces: 3, works: 2, mask: '01', firstAcquired: null }),
  ];
  it('sorts by pieces, works, collections and since', () => {
    expect(sortKeepers(list, 'pieces').map((x) => x.address)).toEqual(['0xa', '0xb', '0xc']);
    expect(sortKeepers(list, 'works').map((x) => x.address)).toEqual(['0xb', '0xc', '0xa']);
    expect(sortKeepers(list, 'collections').map((x) => x.address)).toEqual(['0xb', '0xa', '0xc']);
    expect(sortKeepers(list, 'since').map((x) => x.address)).toEqual(['0xb', '0xa', '0xc']);
  });
  it('maps the mask and matches queries', () => {
    expect(maskCells('101')).toEqual([true, false, true]);
    expect(matchesQuery(k({ ens: 'keeper.eth' }), 'KEEP')).toBe(true);
    expect(matchesQuery(k({}), '0x000000')).toBe(true);
    expect(matchesQuery(k({}), 'nope')).toBe(false);
    expect(matchesQuery(k({}), '  ')).toBe(true);
  });
});
