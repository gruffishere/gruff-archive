import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { catalogPieces, pieceWeight } from '../../src/lib/catalog';

const col = (slug: string, p: Partial<CollectionOut> = {}) =>
  ({ slug, title: slug.toUpperCase(), code: slug.slice(0, 3).toUpperCase(), standard: 'erc721', section: 'index', techniques: ['illustration'], ...p }) as CollectionOut;
const img = (id: string, extra: Partial<TokenOut> = {}, tag = '') =>
  ({ id, name: `n${id}`, supply: 1, image: { kind: 'image', thumb: `/media/${tag}${id}-t.webp`, large: `/media/${tag}${id}-l.webp`, file: null }, animation: null, ...extra }) as TokenOut;
const many = (n: number, tag = '') => Array.from({ length: n }, (_, i) => img(String(i + 1), {}, tag));

const cols = [
  col('plain'),
  col('editions', { standard: 'erc1155' }),
  col('lab', { section: 'experiments' }),
  col('gen', { techniques: ['generative', 'on-chain'] }),
  col('empty-gen', { techniques: ['generative'] }),
];
const tokens: Record<string, TokenOut[]> = {
  plain: [...many(4, 'p'), img('9', { supply: 0 }), img('10', { image: null })],
  editions: [img('1', { supply: 250 }, 'e'), img('2', { supply: 3 }, 'e')],
  lab: many(2, 'l'),
  gen: many(40, 'g'),
  'empty-gen': [],
};

describe('catalogPieces', () => {
  const pieces = catalogPieces(cols, tokens);
  const count = (slug: string) => pieces.filter((p) => p.slug === slug).length;

  it('takes every work of non-generative collections once, editions as one piece', () => {
    expect(count('plain')).toBe(4);
    expect(count('editions')).toBe(2);
    expect(count('lab')).toBe(2);
  });
  it('excludes burned works and works without displayable media', () => {
    const ids = pieces.filter((p) => p.slug === 'plain').map((p) => p.id);
    expect(ids).not.toContain('9');
    expect(ids).not.toContain('10');
  });
  it('takes 5 spread pieces from generative collections and none when no media exists yet', () => {
    expect(count('gen')).toBe(5);
    expect(count('empty-gen')).toBe(0);
    const ids = pieces.filter((p) => p.slug === 'gen').map((p) => Number(p.id)).sort((a, b) => a - b);
    expect(ids[0]).toBeLessThanOrEqual(8);
    expect(ids[4]).toBeGreaterThanOrEqual(32);
    expect(new Set(ids).size).toBe(5);
  });
  it('is deterministic and mixes collections', () => {
    expect(catalogPieces(cols, tokens)).toEqual(pieces);
    expect(catalogPieces([...cols].reverse(), tokens).map((p) => p.slug + p.id).sort()).toEqual(pieces.map((p) => p.slug + p.id).sort());
    expect(new Set(pieces.slice(0, 6).map((p) => p.slug)).size).toBeGreaterThan(1);
  });
  it('shows html works live in a sandboxed square and never a gif original', () => {
    const html = img('1', { image: null, animation: { kind: 'html', thumb: null, large: null, file: '/media/p.html' } });
    const gif = img('2', { image: { kind: 'image', thumb: '/media/g-t.webp', large: '/media/g.gif', file: '/media/g.gif', animated: true } });
    const out = catalogPieces([col('h')], { h: [html, gif] });
    expect(out.find((p) => p.id === '1')).toMatchObject({ kind: 'iframe', src: '/media/p.html' });
    expect(out.find((p) => p.id === '2')).toMatchObject({ kind: 'img', src: '/media/g-t.webp', large: null });
  });
  it('offers the original gif (or its remote copy) and video files for hover motion', () => {
    const gif = img('1', { image: { kind: 'image', thumb: '/media/g-t.webp', large: '/media/g.gif', file: '/media/g.gif', animated: true } });
    const big = img('2', { image: { kind: 'image', thumb: '/media/b-t.webp', large: null, file: null, animated: true, remote: 'https://arweave.net/big' } });
    const lost = img('3', { image: { kind: 'image', thumb: '/media/l-t.webp', large: null, file: null, animated: true } });
    const vid = img('4', { image: { kind: 'video', thumb: '/media/v-t.webp', large: null, file: '/media/v.mp4' } });
    const still = img('5');
    const out = catalogPieces([col('m')], { m: [gif, big, lost, vid, still] });
    const hover = (id: string) => out.find((p) => p.id === id)?.hover;
    expect(hover('1')).toEqual({ type: 'gif', src: '/media/g.gif' });
    expect(hover('2')).toEqual({ type: 'gif', src: 'https://arweave.net/big' });
    expect(hover('3')).toBeNull();
    expect(hover('4')).toEqual({ type: 'video', src: '/media/v.mp4' });
    expect(hover('5')).toBeNull();
    // the shown file stays the static rendition
    expect(out.find((p) => p.id === '1')).toMatchObject({ kind: 'img', src: '/media/g-t.webp' });
  });
  it('never hangs the same image twice, and generative picks skip duplicates', () => {
    const dup = (id: string) => img(id, { image: { kind: 'image', thumb: '/media/ph-t.webp', large: '/media/ph-l.webp', file: null } as TokenOut['image'] });
    const live = (id: string) => img(id, { image: null, animation: { kind: 'html', thumb: null, large: null, file: `/media/${id}.html` } as TokenOut['animation'] });
    const toks = [...Array.from({ length: 10 }, (_, i) => dup(String(i + 1))), ...Array.from({ length: 4 }, (_, i) => live(String(i + 11))), ...many(3, 'u').map((t) => ({ ...t, id: String(Number(t.id) + 20) }))];
    const out = catalogPieces([col('g2', { techniques: ['generative'] })], { g2: toks });
    expect(out).toHaveLength(5);
    expect(new Set(out.map((p) => p.src)).size).toBe(5);
    expect(out.filter((p) => p.src === '/media/ph-t.webp')).toHaveLength(1);
    const two = catalogPieces([col('a'), col('b')], { a: [dup('1')], b: [dup('2'), ...many(1, 'z')] });
    expect(two.map((p) => p.src).sort()).toEqual(['/media/ph-t.webp', '/media/z1-t.webp']);
  });
  it('only counts pieces actually hung against later collections', () => {
    const shared = img('1', { image: { kind: 'image', thumb: '/media/shared-t.webp', large: '/media/shared-l.webp', file: null } as TokenOut['image'] });
    const gen = [shared, ...many(9, 'q').map((t) => ({ ...t, id: String(Number(t.id) + 1) }))];
    const out = catalogPieces([col('ga', { techniques: ['generative'] }), col('zb')], { ga: gen, zb: [{ ...shared, id: '7' }] });
    expect(out.filter((p) => p.slug === 'ga')).toHaveLength(5);
    expect(out.find((p) => p.slug === 'zb')).toBeTruthy();
  });
  it('gives each piece a stable weight between 0.6 and 1.8', () => {
    for (const p of pieces) {
      expect(p.weight).toBeGreaterThanOrEqual(0.6);
      expect(p.weight).toBeLessThanOrEqual(1.8);
      expect(pieceWeight(p.slug, p.id)).toBe(p.weight);
    }
  });
});

describe('measurePieces', () => {
  const base = { slug: 's', title: 't', collection: 'c', large: null, pixelated: false, hover: null, weight: 1 } as const;
  it('drops an unmeasurable raster piece with a warning and keeps html at 1:1', async () => {
    const { measurePieces } = await import('../../src/lib/catalog');
    const { vi } = await import('vitest');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await measurePieces(
      [
        { ...base, id: '1', kind: 'img', src: '/media/ok.webp' },
        { ...base, id: '2', kind: 'img', src: '/media/broken.webp' },
        { ...base, id: '3', kind: 'iframe', src: '/media/x.html' },
      ],
      async (src) => (src.includes('broken') ? null : { w: 300, h: 200 }),
    );
    expect(out.map((p) => p.id)).toEqual(['1', '3']);
    expect(out[0]).toMatchObject({ w: 300, h: 200, tw: 300 });
    expect(out[1]).toMatchObject({ w: 1, h: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('s/2');
    warn.mockRestore();
  });
  it('measures a viewBox-only svg through the real reader', async () => {
    const { measurePieces } = await import('../../src/lib/catalog');
    const { mkdirSync, mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'catalog-test-'));
    mkdirSync(join(root, 'media'));
    writeFileSync(join(root, 'media/vb.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20"/></svg>');
    try {
      const { mediaReader } = await import('../../src/lib/catalog');
      const [p] = await measurePieces([{ ...base, id: '1', kind: 'img', src: '/media/vb.svg' }], mediaReader(root));
      expect(p!.w / p!.h).toBeCloseTo(2, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('catalogPool', () => {
  it('holds every non-generative work and at most 60 spread works per generative collection', async () => {
    const { catalogPool } = await import('../../src/lib/catalog');
    const big = [col('plain'), col('gen', { techniques: ['generative'] }), col('gen2', { techniques: ['generative'] })];
    const pool = catalogPool(big, { plain: many(7, 'p'), gen: many(200, 'g'), gen2: many(12, 'h') });
    expect(pool.filter((p) => p.slug === 'plain')).toHaveLength(7);
    expect(pool.filter((p) => p.slug === 'gen')).toHaveLength(60);
    expect(pool.filter((p) => p.slug === 'gen2')).toHaveLength(12);
    expect(pool.every((p) => p.generative === (p.slug !== 'plain'))).toBe(true);
    const ids = pool.filter((p) => p.slug === 'gen').map((p) => Number(p.id));
    expect(ids[0]).toBeLessThanOrEqual(4);
    expect(ids[59]).toBeGreaterThanOrEqual(197);
  });
  it('keeps one image per wall and skips works without media', async () => {
    const { catalogPool } = await import('../../src/lib/catalog');
    const dup = (id: string) => img(id, { image: { kind: 'image', thumb: '/media/ph-t.webp', large: '/media/ph-l.webp', file: null } as TokenOut['image'] });
    const pool = catalogPool([col('a'), col('b')], { a: [dup('1'), dup('2'), img('3', { image: null })], b: [dup('4'), ...many(2, 'z')] });
    expect(pool.map((p) => p.src).sort()).toEqual(['/media/ph-t.webp', '/media/z1-t.webp', '/media/z2-t.webp']);
  });
  it('turns a measured piece into a pool item with its href and srcset widths', async () => {
    const { catalogPool, measurePieces, toPoolItem } = await import('../../src/lib/catalog');
    const [p] = await measurePieces(catalogPool([col('a')], { a: [img('5')] }), async (src) => ({ w: src.includes('-l') ? 2000 : 1000, h: 500 }));
    expect(toPoolItem(p!)).toMatchObject({ slug: 'a', id: '5', href: '/w/a/5/', w: 1000, h: 500, tw: 1000, lw: 2000, generative: false, kind: 'img' });
  });
});
