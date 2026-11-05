import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { balance, barPct, onChainShare, techniqueYears } from '../../src/lib/techniques';

const col = (p: Partial<CollectionOut>) => ({ slug: 's', section: 'index', standard: 'erc721', techniques: ['illustration'], works: 1, pieces: 1, ...p }) as CollectionOut;
const tok = (at: string, supply = 1) => ({ supply, mint: { at } }) as TokenOut;

describe('techniques', () => {
  const cols = [col({ slug: 'a', techniques: ['illustration'], works: 2, pieces: 2 }), col({ slug: 'b', techniques: ['generative', 'on-chain'], works: 6, pieces: 6 }), col({ slug: 'e', standard: 'erc1155', pieces: 40, works: 3 }), col({ slug: 'x', section: 'experiments', techniques: ['generative'] })];
  const tokens = { a: [tok('2023-02-01T00:00:00.000Z'), tok('2023-03-01T00:00:00.000Z')], b: [tok('2026-09-01T00:00:00.000Z'), tok('2026-09-02T00:00:00.000Z', 0)], e: [tok('2023-01-01T00:00:00.000Z')], x: [tok('2026-09-01T00:00:00.000Z')] };

  it('counts works per technique and year', () => {
    expect(techniqueYears(cols, tokens)).toEqual({
      years: ['2023', '2026'],
      rows: [
        { technique: 'illustration', counts: [3, 0] },
        { technique: 'generative', counts: [0, 1] },
        { technique: 'on-chain', counts: [0, 1] },
      ],
    });
  });
  it('sizes meters as percentages', () => {
    expect(barPct(3, 3)).toBe(100);
    expect(barPct(1, 1000)).toBe(2);
    expect(barPct(0, 5)).toBe(0);
    expect(barPct(5, 0)).toBe(0);
    expect(barPct(50, 200)).toBe(25);
  });
  it('computes balance and on-chain share', () => {
    expect(balance(cols)).toEqual({ oneOfOne: 2, editionPieces: 40 });
    expect(onChainShare(cols)).toBeCloseTo(6 / 11);
  });
});
