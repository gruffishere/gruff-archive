import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { continuousLine, quarterOf, quarterSpan, summary, techniqueShares, timelineQuarters } from '../../src/lib/techniques';

const col = (p: Partial<CollectionOut>) => ({ slug: 's', section: 'index', standard: 'erc721', techniques: ['vector illustration'], tools: [], works: 1, pieces: 1, ...p }) as CollectionOut;
const tok = (at: string, supply = 1) => ({ supply, mint: { at } }) as TokenOut;
const many = (n: number, at: string) => Array.from({ length: n }, () => tok(at));

describe('quarters', () => {
  it('names a quarter and spans quarters inclusively', () => {
    expect(quarterOf('2023-01-31T00:00:00.000Z')).toBe('2023Q1');
    expect(quarterOf('2025-08-14T10:00:00.000Z')).toBe('2025Q3');
    expect(quarterOf('2026-12-01')).toBe('2026Q4');
    expect(quarterSpan('2024Q4', '2025Q2')).toEqual(['2024Q4', '2025Q1', '2025Q2']);
    expect(quarterSpan('2025Q1', '2025Q1')).toEqual(['2025Q1']);
  });
  it('runs from the first dated work or room to the last', () => {
    const cols = [col({ slug: 'a' })];
    expect(timelineQuarters(cols, { a: [tok('2023-02-01T00:00:00.000Z')] }, [{ date: '2023-11-30', since: '2023-11' }])).toEqual(['2023Q1', '2023Q2', '2023Q3', '2023Q4']);
    expect(timelineQuarters([], {}, [])).toEqual([]);
  });
});

describe('techniqueShares', () => {
  const Q = ['2023Q1', '2023Q2', '2023Q3'];
  it('gives every collection one vote, whatever its size', () => {
    const cols = [col({ slug: 'big', techniques: ['generative art'] }), col({ slug: 'one', techniques: ['vector illustration'] })];
    const s = techniqueShares(cols, { big: many(673, '2023-02-01T00:00:00.000Z'), one: [tok('2023-03-01T00:00:00.000Z')] }, Q);
    expect(s['generative art'][0]).toBe(50);
    expect(s['vector illustration'][0]).toBe(50);
  });
  it('counts a collection fully on each of its techniques', () => {
    const s = techniqueShares([col({ slug: 'p', techniques: ['vector illustration', 'glitch art'] })], { p: [tok('2023-05-01T00:00:00.000Z')] }, Q);
    expect(s['vector illustration'][1]).toBe(100);
    expect(s['glitch art'][1]).toBe(100);
    expect(s['code art'][1]).toBe(0);
  });
  it('leaves a quarter with no mints empty, not zero, and skips burned or undated tokens', () => {
    const s = techniqueShares([col({ slug: 'a' })], { a: [tok('2023-01-10T00:00:00.000Z'), tok('2023-02-10T00:00:00.000Z', 0), { supply: 1, mint: null } as unknown as TokenOut] }, Q);
    expect(s['vector illustration']).toEqual([100, null, null]);
  });
  it('splits a collection across the quarters it minted in', () => {
    const cols = [col({ slug: 'a', techniques: ['glitch art'] }), col({ slug: 'b', techniques: ['code art'] })];
    const s = techniqueShares(cols, { a: [tok('2023-01-10T00:00:00.000Z'), tok('2023-04-10T00:00:00.000Z')], b: [tok('2023-04-11T00:00:00.000Z')] }, Q);
    expect(s['glitch art']).toEqual([100, 33, null]);
    expect(s['code art']).toEqual([0, 67, null]);
  });
});

describe('continuousLine', () => {
  it('bridges quarters without mints, so the line runs in one piece (the artist, 2026-11-06)', () => {
    expect(continuousLine([100, null, null, 40])).toEqual([100, 80, 60, 40]);
    expect(continuousLine([73, null, null, 20, 0])).toEqual([73, 55, 38, 20, 0]);
  });
  it('is born at 0 the quarter before it first appears and ends at 0 after it is last used', () => {
    expect(continuousLine([0, 0, 0, 42, 0, 0, 0])).toEqual([null, null, 0, 42, 0, null, null]);
    expect(continuousLine([0, 0, null, 0, 55, 100])).toEqual([null, null, null, 0, 55, 100]);
  });
  it('draws nothing for a technique never used, and leaves empty edges empty', () => {
    expect(continuousLine([0, null, 0])).toEqual([null, null, null]);
    expect(continuousLine([null, 50, null])).toEqual([null, 50, null]);
  });
});

describe('summary', () => {
  it('counts on-chain share, 1/1 works and edition pieces', () => {
    const cols = [col({ slug: 'a', works: 2 }), col({ slug: 'b', techniques: ['generative art', 'code art'], tools: ['on-chain'], works: 6 }), col({ slug: 'e', standard: 'erc1155', pieces: 40, works: 3 }), col({ slug: 'x', section: 'experiments', techniques: ['generative art'], works: 1 })];
    expect(summary(cols)).toEqual({ onChainPct: 50, oneOfOne: 2, editionPieces: 40 });
  });
});

describe('smoothPath', () => {
  it('draws a line in one piece with curves, and never leaves the 0..100 band', async () => {
    const { smoothPath, yOf } = await import('../../src/lib/chart-path');
    const d = smoothPath([100, null, null, 100, 10, 73, null, 20, 0], 0);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d).toContain(' C');
    const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(yOf(100, 0) - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(yOf(0, 0) + 0.01);
    expect(smoothPath([0, 0, 0], 1)).toBe('');
  });
});
