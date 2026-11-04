import { describe, expect, it } from 'vitest';
import { buildBalances, chainEvents, DEAD, ensMap, ZERO } from '../../indexer/ledger';
import type { RawTransfer } from '../../indexer/types';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

const tr = (p: Partial<RawTransfer>): RawTransfer => ({
  contract: '0xc',
  tokenId: '1',
  from: ZERO,
  to: A,
  fromEns: null,
  toEns: null,
  value: '1',
  txHash: '0x1',
  logIndex: 0,
  blockNumber: 1,
  timestamp: '2024-01-01T00:00:00.000Z',
  ...p,
});

const history: RawTransfer[] = [
  tr({ value: '5', txHash: '0x1', logIndex: 0, blockNumber: 1, timestamp: '2024-01-01T00:00:00.000Z' }),
  tr({ value: '2', txHash: '0x1', logIndex: 1, blockNumber: 1, timestamp: '2024-01-01T00:00:00.000Z' }),
  tr({ from: A, to: B, value: '3', txHash: '0x2', blockNumber: 2, timestamp: '2024-02-01T00:00:00.000Z', toEns: 'bee.eth' }),
  tr({ from: B, to: DEAD, value: '1', txHash: '0x3', blockNumber: 3, timestamp: '2024-03-01T00:00:00.000Z' }),
];

describe('buildBalances', () => {
  it('tracks mints, transfers and burns', () => {
    const b = buildBalances(history).get('1')!;
    expect(b.get(A)).toBe(4n);
    expect(b.get(B)).toBe(2n);
    expect(b.has(DEAD)).toBe(false);
  });

  it('can stop at a date', () => {
    const b = buildBalances(history, '2024-01-31T23:59:59.999Z').get('1')!;
    expect([...b.entries()]).toEqual([[A, 7n]]);
  });

  it('drops holders whose balance reaches zero', () => {
    const b = buildBalances([tr({}), tr({ from: A, to: B, txHash: '0x9', blockNumber: 9 })]).get('1')!;
    expect(b.has(A)).toBe(false);
    expect(b.get(B)).toBe(1n);
  });
});

describe('chainEvents', () => {
  it('merges mints in one tx and classifies burns', () => {
    const e = chainEvents(history);
    expect(e.map((x) => [x.kind, x.quantity, x.from, x.to])).toEqual([
      ['mint', 7, null, A],
      ['transfer', 3, A, B],
      ['burn', 1, B, null],
    ]);
  });
});

describe('ensMap', () => {
  it('collects ens names', () => {
    expect(ensMap(history).get(B)).toBe('bee.eth');
  });
});

describe('zero-value transfers (I1)', () => {
  const zero = tr({ value: '0', to: B, txHash: '0xz', logIndex: 3 });

  it('keeps the token id known but adds no holder', () => {
    const b = buildBalances([zero]);
    expect(b.has('1')).toBe(true);
    expect(b.get('1')!.size).toBe(0);
  });

  it('does not let a zero-value transfer move or drop a holder', () => {
    const b = buildBalances([tr({}), tr({ from: A, to: B, value: '0', txHash: '0xz', blockNumber: 5 })]).get('1')!;
    expect(b.get(A)).toBe(1n);
    expect(b.has(B)).toBe(false);
  });

  it('emits no events for zero-value transfers', () => {
    expect(chainEvents([zero, tr({ from: A, to: B, value: '0', txHash: '0xz2', logIndex: 4 })])).toEqual([]);
  });
});
