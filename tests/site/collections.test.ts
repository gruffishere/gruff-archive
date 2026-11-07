import { describe, expect, it } from 'vitest';
import type { CollectionOut } from '../../src/lib/data';
import { archiveSpan, countLabel, experimentCollections, filterTags, firstYear, indexLedger, indexCollections, inCirculation, layoutOf, previewPrice, workNav } from '../../src/lib/collections';

const c = (p: Partial<CollectionOut>) => ({ code: 'X', slug: 'x', title: 'X', contract: '0x', standard: 'erc721', platform: 'manifold', platformUrl: null, section: 'index', techniques: ['vector illustration'], wallText: null, accession: 'GRF.23.X', firstMint: '2023-01-01T00:00:00.000Z', lastMint: null, works: 3, pieces: 3, holders: 1, floorWei: null, coverTokenId: '1', staleSince: null, ...p }) as CollectionOut;

describe('collections', () => {
  it('tags collections for the index filters', () => {
    expect(filterTags(c({}))).toEqual(['all', 'one-of-one']);
    expect(filterTags(c({ standard: 'erc1155' }))).toEqual(['all', 'editions']);
    // an erc721 edition (Last Selfie or?, 10 tokens of one work) files under editions, not 1/1
    expect(filterTags(c({ format: 'editions' }))).toEqual(['all', 'editions']);
    expect(filterTags(c({ techniques: ['generative art'], tools: ['on-chain'] }))).toEqual(['all', 'generative', 'on-chain']);
  });
  it('orders the index newest first and keeps experiments apart', () => {
    const all = [c({ code: 'A', firstMint: '2023-01-01T00:00:00.000Z' }), c({ code: 'B', firstMint: '2026-09-01T00:00:00.000Z' }), c({ code: 'E', section: 'experiments' })];
    expect(indexCollections(all).map((x) => x.code)).toEqual(['B', 'A']);
    expect(experimentCollections(all).map((x) => x.code)).toEqual(['E']);
    expect(archiveSpan(all)).toBe('2023—2026');
  });
  it('puts experiments in the ledger, tagged, ordered with the rest', () => {
    const all = [c({ code: 'A', firstMint: '2023-01-01T00:00:00.000Z' }), c({ code: 'E', section: 'experiments', firstMint: '2026-09-01T00:00:00.000Z', techniques: ['generative art'] }), c({ code: 'B', firstMint: '2025-01-01T00:00:00.000Z' })];
    expect(indexLedger(all).map((x) => x.code)).toEqual(['E', 'B', 'A']);
    expect(filterTags(all[1])).toEqual(['all', 'generative', 'experiments']);
    expect(filterTags(all[0])).not.toContain('experiments');
  });
  it('tags OVVN with generative, on-chain and experiments together', () => {
    expect(filterTags(c({ section: 'experiments', techniques: ['generative art'], tools: ['on-chain'] }))).toEqual(['all', 'generative', 'on-chain', 'experiments']);
  });
  it('counts with correct singular and plural', () => {
    expect(countLabel(1, 'experiment')).toBe('1 experiment');
    expect(countLabel(2, 'experiment')).toBe('2 experiments');
    expect(countLabel(16, 'collection')).toBe('16 collections');
  });
  it('picks a layout and a year', () => {
    expect(layoutOf(c({ works: 12 }))).toBe('column');
    expect(layoutOf(c({ works: 13 }))).toBe('grid');
    expect(firstYear(c({ firstMint: null }))).toBe('—');
    expect(firstYear(c({}))).toBe('2023');
  });
});

describe('tokens with no copies in circulation', () => {
  const tokens = [{ id: '1', supply: 1 }, { id: '2', supply: 0 }, { id: '3', supply: 5 }, { id: '4', supply: 0 }];
  it('are filtered out of grids by supply', () => {
    expect(tokens.filter(inCirculation).map((t) => t.id)).toEqual(['1', '3']);
  });
  it('are numbered among circulating works only, and keep a page with neighbours', () => {
    const nav = workNav(tokens);
    expect(nav.map((x) => x.n)).toEqual([1, null, 2, null]);
    expect(nav.every((x) => x.total === 2)).toBe(true);
    expect(nav[0]).toMatchObject({ prev: null, next: '3' });
    expect(nav[2]).toMatchObject({ prev: '1', next: null });
    expect(nav[1]).toMatchObject({ prev: '1', next: '3' });
    expect(nav[3]).toMatchObject({ prev: '3', next: null });
  });
});

describe('previewPrice (the index preview, the artist 2026-11-07)', () => {
  const tok = (p: { id: string; listing?: string; sale?: [string, string]; supply?: number }) => ({ id: p.id, supply: p.supply ?? 1, listing: p.listing ? { priceWei: p.listing } : null, lastSale: p.sale ? { priceWei: p.sale[0], at: p.sale[1] } : null }) as never;
  it('shows the lowest listing in the collection, "listed from" when it holds several works', () => {
    const r = previewPrice(c({ works: 7 }), [tok({ id: '1', listing: '90000000000000000' }), tok({ id: '2', listing: '50000000000000000' }), tok({ id: '3', sale: ['1', '2023-01-01'] })]);
    expect(r).toEqual({ kind: 'listed', priceWei: '50000000000000000', label: 'listed from' });
    expect(previewPrice(c({ works: 1 }), [tok({ id: '1', listing: '5' })])?.label).toBe('listed');
  });
  it('falls back to the latest sale in the collection, labelled with its date', () => {
    const r = previewPrice(c({ works: 7 }), [tok({ id: '1', sale: ['300000000000000000', '2023-02-01T00:00:00.000Z'] }), tok({ id: '2', sale: ['836000000000000000', '2023-02-18T21:47:23.000Z'] })]);
    expect(r).toEqual({ kind: 'sold', priceWei: '836000000000000000', label: 'last sale · 18.02.2023' });
  });
  it('says nothing when nothing is listed or sold, and ignores burned works', () => {
    expect(previewPrice(c({}), [tok({ id: '1' })])).toBeNull();
    expect(previewPrice(c({}), [tok({ id: '1', listing: '5', supply: 0 })])).toBeNull();
  });
});
