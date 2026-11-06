import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { laneLayout, laneMarks, markSize, quarterOf, quarterSpan, summary } from '../../src/lib/techniques';

const col = (p: Partial<CollectionOut>) => ({ code: 'AAA', slug: 's', title: 'S', section: 'index', standard: 'erc721', techniques: ['vector illustration'], tools: [], works: 1, pieces: 1, ...p }) as CollectionOut;
const tok = (at: string, supply = 1) => ({ supply, mint: { at } }) as TokenOut;

describe('quarters', () => {
  it('names a quarter and spans quarters inclusively', () => {
    expect(quarterOf('2023-01-31T00:00:00.000Z')).toBe('2023Q1');
    expect(quarterOf('2025-08-14T10:00:00.000Z')).toBe('2025Q3');
    expect(quarterOf('2026-12-01')).toBe('2026Q4');
    expect(quarterSpan('2024Q4', '2025Q2')).toEqual(['2024Q4', '2025Q1', '2025Q2']);
    expect(quarterSpan('2025Q1', '2025Q1')).toEqual(['2025Q1']);
  });
});

describe('laneMarks', () => {
  it('places every collection once, at its first dated mint, oldest first', () => {
    const cols = [
      col({ code: 'BBB', slug: 'b', title: 'B', techniques: ['glitch art'], works: 24 }),
      col({ code: 'AAA', slug: 'a', title: 'A', works: 2 }),
      col({ code: 'NON', slug: 'n' }),
      col({ code: 'HID', slug: 'h', section: 'hidden' as CollectionOut['section'] }),
    ];
    const marks = laneMarks(cols, {
      a: [tok('2023-02-01T00:00:00.000Z'), tok('2023-01-10T00:00:00.000Z')],
      b: [tok('2025-05-01T00:00:00.000Z'), tok('2025-04-02T00:00:00.000Z', 0)],
      n: [],
      h: [tok('2023-01-01T00:00:00.000Z')],
    });
    expect(marks.map((m) => [m.code, m.debut])).toEqual([['AAA', '2023-01'], ['BBB', '2025-05']]);
    expect(marks[1]).toMatchObject({ slug: 'b', title: 'B', works: 24, techniques: ['glitch art'] });
  });
});

describe('markSize', () => {
  it('grows with the works, slowly, from 4 to about 14 px', () => {
    expect(markSize(1)).toBe(4);
    expect(markSize(10)).toBe(7);
    expect(markSize(673)).toBe(12);
    expect(markSize(2222)).toBe(14);
    expect(markSize(0)).toBe(4);
  });
});

describe('laneLayout', () => {
  const marks = laneMarks(
    [
      col({ code: 'ANT', slug: 'ant' }),
      col({ code: 'BLS', slug: 'bls' }),
      col({ code: 'GRT', slug: 'grt', techniques: ['generative art', 'vector illustration'], works: 673 }),
      col({ code: 'FCT', slug: 'fct', techniques: ['generative art', 'code art'], works: 2222 }),
    ],
    { ant: [tok('2023-01-05T00:00:00Z')], bls: [tok('2023-02-05T00:00:00Z')], grt: [tok('2023-10-05T00:00:00Z')], fct: [tok('2026-09-05T00:00:00Z')] },
  );
  it('spans whole years in quarters, and stacks a lane cell oldest first', () => {
    const l = laneLayout(marks, 'quarter');
    expect(l.columns).toHaveLength(16);
    expect(l.columns[0]).toBe('2023Q1');
    expect(l.columns.at(-1)).toBe('2026Q4');
    const vector = l.lanes.find((x) => x.technique === 'vector illustration')!;
    expect(vector.rows).toBe(2);
    expect(vector.cells[0]!.map((m) => m.code)).toEqual(['ANT', 'BLS']);
    expect(l.lanes.find((x) => x.technique === 'glitch art')!.rows).toBe(0);
  });
  it('puts a collection with two techniques in both lanes, and records where, for the connector', () => {
    const l = laneLayout(marks, 'quarter');
    expect(l.at['GRT|vector illustration']).toEqual({ col: 3, row: 0 });
    expect(l.at['GRT|generative art']).toEqual({ col: 3, row: 0 });
    expect(l.at['FCT|code art']).toEqual({ col: 14, row: 0 });
    expect(l.links).toEqual([
      { code: 'GRT', from: 'vector illustration', to: 'generative art' },
      { code: 'FCT', from: 'generative art', to: 'code art' },
    ]);
  });
  it('folds into years for narrow screens', () => {
    const l = laneLayout(marks, 'year');
    expect(l.columns).toEqual(['2023', '2024', '2025', '2026']);
    expect(l.lanes.find((x) => x.technique === 'vector illustration')!.cells[0]!.map((m) => m.code)).toEqual(['ANT', 'BLS', 'GRT']);
    expect(l.at['FCT|generative art']).toEqual({ col: 3, row: 0 });
  });
  it('is empty without marks', () => {
    expect(laneLayout([], 'quarter')).toMatchObject({ columns: [], links: [] });
  });
});

describe('summary', () => {
  it('counts on-chain share, 1/1 works and edition pieces', () => {
    const cols = [col({ slug: 'a', works: 2 }), col({ slug: 'b', techniques: ['generative art', 'code art'], tools: ['on-chain'], works: 6 }), col({ slug: 'e', standard: 'erc1155', pieces: 40, works: 3 }), col({ slug: 'x', section: 'experiments', techniques: ['generative art'], works: 1 })];
    expect(summary(cols)).toEqual({ onChainPct: 50, oneOfOne: 2, editionPieces: 40 });
  });
});
