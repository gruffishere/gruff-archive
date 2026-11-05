import { describe, expect, it } from 'vitest';
import type { CollectionOut } from '../../src/lib/data';
import { archiveSpan, experimentCollections, filterTags, firstYear, indexCollections, inCirculation, layoutOf, workNav } from '../../src/lib/collections';

const c = (p: Partial<CollectionOut>) => ({ code: 'X', slug: 'x', title: 'X', contract: '0x', standard: 'erc721', platform: 'manifold', platformUrl: null, section: 'index', techniques: ['illustration'], wallText: null, accession: 'GRF.23.X', firstMint: '2023-01-01T00:00:00.000Z', lastMint: null, works: 3, pieces: 3, holders: 1, floorWei: null, coverTokenId: '1', staleSince: null, ...p }) as CollectionOut;

describe('collections', () => {
  it('tags collections for the index filters', () => {
    expect(filterTags(c({}))).toEqual(['all', 'one-of-one']);
    expect(filterTags(c({ standard: 'erc1155' }))).toEqual(['all', 'editions']);
    expect(filterTags(c({ techniques: ['generative', 'on-chain'] }))).toEqual(['all', 'generative', 'on-chain']);
  });
  it('orders the index newest first and keeps experiments apart', () => {
    const all = [c({ code: 'A', firstMint: '2023-01-01T00:00:00.000Z' }), c({ code: 'B', firstMint: '2026-09-01T00:00:00.000Z' }), c({ code: 'E', section: 'experiments' })];
    expect(indexCollections(all).map((x) => x.code)).toEqual(['B', 'A']);
    expect(experimentCollections(all).map((x) => x.code)).toEqual(['E']);
    expect(archiveSpan(all)).toBe('2023—2026');
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
