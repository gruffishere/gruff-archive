import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { catalogPieces, pieceWeight } from '../../src/lib/catalog';

const col = (slug: string, p: Partial<CollectionOut> = {}) =>
  ({ slug, title: slug.toUpperCase(), code: slug.slice(0, 3).toUpperCase(), standard: 'erc721', section: 'index', techniques: ['illustration'], ...p }) as CollectionOut;
const img = (id: string, extra: Partial<TokenOut> = {}) =>
  ({ id, name: `n${id}`, supply: 1, image: { kind: 'image', thumb: `/media/${id}-t.webp`, large: `/media/${id}-l.webp`, file: null }, animation: null, ...extra }) as TokenOut;
const many = (n: number) => Array.from({ length: n }, (_, i) => img(String(i + 1)));

const cols = [
  col('plain'),
  col('editions', { standard: 'erc1155' }),
  col('lab', { section: 'experiments' }),
  col('gen', { techniques: ['generative', 'on-chain'] }),
  col('empty-gen', { techniques: ['generative'] }),
];
const tokens: Record<string, TokenOut[]> = {
  plain: [...many(4), img('9', { supply: 0 }), img('10', { image: null })],
  editions: [img('1', { supply: 250 }), img('2', { supply: 3 })],
  lab: many(2),
  gen: many(40),
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
  it('gives each piece a stable weight between 0.6 and 1.8', () => {
    for (const p of pieces) {
      expect(p.weight).toBeGreaterThanOrEqual(0.6);
      expect(p.weight).toBeLessThanOrEqual(1.8);
      expect(pieceWeight(p.slug, p.id)).toBe(p.weight);
    }
  });
});

describe('measurePieces', () => {
  const base = { slug: 's', title: 't', collection: 'c', large: null, pixelated: false, weight: 1 } as const;
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
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    mkdirSync('public/media', { recursive: true });
    const f = 'public/media/__vb-test.svg';
    writeFileSync(f, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20"/></svg>');
    try {
      const [p] = await measurePieces([{ ...base, id: '1', kind: 'img', src: '/media/__vb-test.svg' }]);
      expect(p!.w / p!.h).toBeCloseTo(2, 1);
    } finally {
      rmSync(f, { force: true });
    }
  });
});
