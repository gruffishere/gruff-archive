import { describe, expect, it } from 'vitest';
import { drawWall, type PoolItem } from '../../src/lib/pool';

const item = (slug: string, id: number, generative: boolean): PoolItem => ({
  slug, id: String(id), title: `t${id}`, collection: slug, generative, kind: 'img', src: `/media/${slug}${id}.webp`, large: null, tw: 100, lw: null,
  w: 100, h: 100, pixelated: false, hover: null, weight: 1, href: `/w/${slug}/${id}/`,
});
const col = (slug: string, n: number, generative: boolean) => Array.from({ length: n }, (_, i) => item(slug, i + 1, generative));
const pool = [...col('g1', 60, true), ...col('g2', 60, true), ...col('g3', 12, true), ...col('a', 40, false), ...col('b', 30, false), ...col('c', 20, false)];
const key = (p: PoolItem) => `${p.slug}/${p.id}`;

describe('drawWall', () => {
  const wall = drawWall(pool, 1);
  it('draws 5 of each generative collection and about 80 pieces in total', () => {
    for (const s of ['g1', 'g2', 'g3']) expect(wall.filter((p) => p.slug === s)).toHaveLength(5);
    expect(wall).toHaveLength(80);
    expect(wall.filter((p) => !p.generative)).toHaveLength(80 - 15);
  });
  it('never repeats a piece', () => {
    for (const seed of [1, 2, 3, 99]) {
      const w = drawWall(pool, seed);
      expect(new Set(w.map(key)).size).toBe(w.length);
    }
  });
  it('is the same for the same seed and different for different seeds', () => {
    expect(drawWall(pool, 7).map(key)).toEqual(drawWall(pool, 7).map(key));
    const sets = new Set([1, 2, 3, 4, 5, 6].map((s) => drawWall(pool, s).map(key).join()));
    expect(sets.size).toBe(6);
    const a = new Set(drawWall(pool, 11).map(key));
    const overlap = drawWall(pool, 12).filter((p) => a.has(key(p))).length;
    expect(overlap).toBeLessThan(80);
  });
  it('hangs everything when the pool is smaller than the wall, and fewer than 5 of a small generative set', () => {
    const small = [...col('g', 3, true), ...col('x', 10, false)];
    const w = drawWall(small, 5);
    expect(w).toHaveLength(13);
    expect(new Set(w.map(key)).size).toBe(13);
  });
  it('mixes the order (not grouped by collection)', () => {
    const slugs = wall.map((p) => p.slug);
    let runs = 1;
    for (let i = 1; i < slugs.length; i++) if (slugs[i] !== slugs[i - 1]) runs++;
    expect(runs).toBeGreaterThan(30);
  });
  it('handles an empty pool', () => {
    expect(drawWall([], 1)).toEqual([]);
  });
});
