import { describe, expect, it } from 'vitest';
import { buildActivity } from '../../indexer/aggregate/activity';
import { buildCollection, collectionYear } from '../../indexer/aggregate/collections';
import { isKeeperAddress } from '../../indexer/aggregate/exclusions';
import { DEAD, ZERO } from '../../indexer/ledger';
import { buildTokens, carryOverMedia, type TokenInputs } from '../../indexer/aggregate/tokens';
import type { ArchiveEvent, CollectionConfig } from '../../indexer/types';

const ARTIST = '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';
const ESCROW = '0xcda72070e455bb31c7690a170224ce43623d0b6f';
const K1 = '0x00000000000000000000000000000000000000a1';
const K2 = '0x00000000000000000000000000000000000000b2';

const cfg: CollectionConfig = {
  code: 'SLV',
  slug: 'silver-surfer',
  title: 'SILVER SURFER',
  contract: '0xc',
  standard: 'erc721',
  platform: 'manifold',
  section: 'index',
  techniques: ['illustration'],
};

const ev = (p: Partial<ArchiveEvent>): ArchiveEvent => ({
  id: Math.random().toString(),
  kind: 'transfer',
  contract: '0xc',
  tokenId: '1',
  quantity: 1,
  from: null,
  to: null,
  priceWei: null,
  txHash: null,
  timestamp: '2023-03-27T00:00:00.000Z',
  ...p,
});

const events = [
  ev({ kind: 'sale', tokenId: '1', from: K1, to: K2, priceWei: '900', timestamp: '2025-01-01T00:00:00.000Z' }),
  ev({ kind: 'sale', tokenId: '1', from: ARTIST, to: K1, priceWei: '500', timestamp: '2023-04-01T00:00:00.000Z' }),
  ev({ kind: 'mint', tokenId: '1', to: ARTIST, timestamp: '2023-03-27T00:00:00.000Z' }),
  ev({ kind: 'mint', tokenId: '2', to: ARTIST, timestamp: '2023-03-28T00:00:00.000Z' }),
];

const inputs: TokenInputs = {
  cfg,
  artist: ARTIST,
  year: 2023,
  metas: new Map([
    ['1', { tokenId: '1', name: "'Cosmic Power'", description: 'x', image: 'ar://a', animation: null }],
    ['2', { tokenId: '2', name: null, description: null, image: null, animation: null }],
  ]),
  balances: new Map([
    ['1', new Map([[K2, 1n]])],
    ['2', new Map([[ARTIST, 1n]])],
  ]),
  mints: new Map([
    ['1', { at: '2023-03-27T00:00:00.000Z', txHash: '0xm1', priceWei: null, primary: false }],
    ['2', { at: '2023-03-28T00:00:00.000Z', txHash: '0xm2', priceWei: null, primary: false }],
  ]),
  events,
  listings: new Map([['1', { tokenId: '1', priceWei: '1500', maker: K2, at: '2026-11-01T00:00:00.000Z' }]]),
  media: new Map([['1', { image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null }, animation: null }]]),
  ens: new Map([[K2, 'keeper.eth']]),
};

describe('isKeeperAddress', () => {
  it('excludes artist, zero, dead and the foundation escrow', () => {
    expect(isKeeperAddress(ARTIST, ARTIST)).toBe(false);
    expect(isKeeperAddress(ZERO, ARTIST)).toBe(false);
    expect(isKeeperAddress(DEAD, ARTIST)).toBe(false);
    expect(isKeeperAddress(ESCROW, ARTIST)).toBe(false);
    expect(isKeeperAddress(K1, ARTIST)).toBe(true);
  });
});

describe('buildTokens', () => {
  const tokens = buildTokens(inputs);

  it('builds accession numbers and names', () => {
    expect(tokens.map((t) => [t.id, t.accession, t.name])).toEqual([
      ['1', 'GRF.23.SLV.001', "'Cosmic Power'"],
      ['2', 'GRF.23.SLV.002', 'SILVER SURFER #2'],
    ]);
  });

  it('fills an unpaid mint price from the artist first sale', () => {
    expect(tokens[0].mint).toEqual({ at: '2023-03-27T00:00:00.000Z', txHash: '0xm1', priceWei: '500', primary: true });
    expect(tokens[1].mint?.priceWei).toBeNull();
  });

  it('exposes last sale, listing, owners and recent events', () => {
    expect(tokens[0].lastSale).toEqual({ at: '2025-01-01T00:00:00.000Z', priceWei: '900' });
    expect(tokens[0].listing?.priceWei).toBe('1500');
    expect(tokens[0].owners).toEqual([{ address: K2, ens: 'keeper.eth', quantity: 1 }]);
    expect(tokens[0].recent.map((e) => e.kind)).toEqual(['sale', 'sale', 'mint']);
    expect(tokens[0].supply).toBe(1);
  });

  it('drops the token suffix for single-token collections', () => {
    const t = buildTokens({ ...inputs, cfg: { ...cfg, code: '366', tokenIds: ['1'] }, year: 2025 });
    expect(t.map((x) => x.accession)).toEqual(['GRF.25.366']);
  });

  it('exposes the as-minted originals as public urls', () => {
    expect(tokens[0].originals).toEqual({ image: 'https://arweave.net/a', animation: null });
    expect(tokens[1].originals).toEqual({ image: null, animation: null });
  });

  it('parses collaborators from the description, with a config override', () => {
    const metas = new Map(inputs.metas);
    metas.set('1', { tokenId: '1', name: 'n', description: 'X collab w/ A & B\nrest', image: null, animation: null });
    const t = buildTokens({ ...inputs, metas });
    expect(t[0].collaborators).toEqual(['A', 'B']);
    expect(t[1].collaborators).toEqual([]);
    const o = buildTokens({ ...inputs, metas, cfg: { ...cfg, collaborators: { '1': ['Z'], '2': ['Q'] } } });
    expect(o[0].collaborators).toEqual(['Z']);
    expect(o[1].collaborators).toEqual(['Q']);
  });

  it('carries over media lost in this run', () => {
    const prev = buildTokens(inputs);
    const next = buildTokens({ ...inputs, media: new Map() });
    expect(carryOverMedia(next, prev)[0].image?.thumb).toBe('/media/a-t.webp');
  });
});

describe('buildTokens owners', () => {
  const find = (id: string, over: Partial<TokenInputs>) => buildTokens({ ...inputs, ...over }).find((t) => t.id === id);

  it('attributes escrowed quantity to the newest depositor', () => {
    const t = find('1', {
      balances: new Map([['1', new Map([[ESCROW, 1n]])]]),
      events: [
        ev({ kind: 'transfer', tokenId: '1', from: K1, to: ESCROW, timestamp: '2025-02-01T00:00:00.000Z' }),
        ev({ kind: 'transfer', tokenId: '1', from: ARTIST, to: ESCROW, timestamp: '2024-01-01T00:00:00.000Z' }),
      ],
    });
    expect(t?.owners).toEqual([{ address: K1, ens: null, quantity: 1, escrow: true }]);
    expect(t?.holderCount).toBe(1);
  });

  it('drops escrowed quantity when no depositor is known', () => {
    const t = find('1', { balances: new Map([['1', new Map([[ESCROW, 1n]])]]), events: [] });
    expect(t?.owners).toEqual([]);
    expect(t?.holderCount).toBe(0);
  });

  it('keeps the artist as an owner but does not count it as a holder', () => {
    const t = find('2', {});
    expect(t?.owners).toEqual([{ address: ARTIST, ens: null, quantity: 1, notKeeper: true }]);
    expect(t?.holderCount).toBe(0);
  });

  it('orders equal-quantity owners by address ascending', () => {
    const t = find('3', { balances: new Map([['3', new Map([[K2, 2n], [K1, 2n]])]]) });
    expect(t?.owners).toEqual([
      { address: K1, ens: null, quantity: 2 },
      { address: K2, ens: 'keeper.eth', quantity: 2 },
    ]);
    expect(t?.holderCount).toBe(2);
  });
});

describe('buildCollection', () => {
  it('summarises a collection', () => {
    const tokens = buildTokens(inputs);
    expect(collectionYear(inputs.mints)).toBe(2023);
    const c = buildCollection({ cfg, artist: ARTIST, year: 2023, tokens, balances: inputs.balances, floorWei: '700', osDescription: 'desc', staleSince: null });
    expect(c).toMatchObject({
      code: 'SLV',
      accession: 'GRF.23.SLV',
      firstMint: '2023-03-27T00:00:00.000Z',
      lastMint: '2023-03-28T00:00:00.000Z',
      works: 2,
      pieces: 2,
      holders: 1,
      floorWei: '700',
      coverTokenId: '1',
      wallText: 'desc',
      platformUrl: null,
      links: [],
    });
  });

  it('carries the configured links', () => {
    const links = [{ label: 'site', url: 'https://thefacets.art' }];
    const c = buildCollection({ cfg: { ...cfg, links }, artist: ARTIST, year: 2023, tokens: buildTokens(inputs), balances: inputs.balances, floorWei: null, osDescription: null, staleSince: null });
    expect(c.links).toEqual(links);
  });
});

describe('originals of OpenSea fallback images', () => {
  it('links the full-size png when the image came from the OpenSea fallback', () => {
    const osImage = 'https://i2c.seadn.io/ethereum/0xc/p.png';
    const media = new Map([['1', { image: { kind: 'image' as const, thumb: '/media/t.webp', large: '/media/l.webp', file: null }, animation: null, osImage }]]);
    const t = buildTokens({ ...inputs, media }).find((x) => x.id === '1')!;
    expect(t.originals.image).toBe(`${osImage}?format=png&w=4000`);
  });
  it('otherwise keeps the minted source', () => {
    const metas = new Map(inputs.metas);
    metas.set('1', { ...metas.get('1')!, image: 'ar://abc' });
    const t = buildTokens({ ...inputs, metas }).find((x) => x.id === '1')!;
    expect(t.originals.image).toBe('https://arweave.net/abc');
  });
});

describe('buildActivity', () => {
  it('enriches, sorts newest first and shards by month', () => {
    const tokens = buildTokens(inputs);
    const a = buildActivity([{ slug: cfg.slug, code: cfg.code, events, tokens, ens: inputs.ens }], 2);
    expect(a.latest.map((r) => r.timestamp)).toEqual(['2025-01-01T00:00:00.000Z', '2023-04-01T00:00:00.000Z']);
    expect(a.latest[0]).toMatchObject({ slug: 'silver-surfer', tokenName: "'Cosmic Power'", accession: 'GRF.23.SLV.001', thumb: '/media/a-t.webp', toEns: 'keeper.eth' });
    expect(Object.keys(a.months).sort()).toEqual(['2023-03', '2023-04', '2025-01']);
    expect(a.months['2023-03']).toHaveLength(2);
  });

  it('does not carry media into skipped (placeholder) ids', () => {
    const prev = buildTokens(inputs);
    const next = buildTokens({ ...inputs, media: new Map() });
    const out = carryOverMedia(next, prev, new Set([next[0].id]));
    expect(out[0].image).toBeNull();
    expect(out[0].animation).toBeNull();
  });
});

describe('carryOverMedia narrowed to the placeholder (I2)', () => {
  const stored = (name: string) => ({ kind: 'image' as const, thumb: `/media/${name}-t.webp`, large: `/media/${name}-l.webp`, file: null });
  const withImage = (name: string | null) => {
    const base = buildTokens({ ...inputs, media: new Map() });
    return base.map((t) => (t.id === '1' ? { ...t, image: name ? stored(name) : null } : t));
  };
  const phFiles = new Set(['ph-t.webp', 'ph-l.webp']);

  it('carries over a previous non-placeholder image into a placeholder id', () => {
    const out = carryOverMedia(withImage(null), withImage('real'), new Set(['1']), phFiles);
    expect(out[0].image?.thumb).toBe('/media/real-t.webp');
  });

  it('refuses a previous image that is the placeholder', () => {
    const out = carryOverMedia(withImage(null), withImage('ph'), new Set(['1']), phFiles);
    expect(out[0].image).toBeNull();
  });
});

describe('excludeHolders (M3)', () => {
  it('treats configured addresses like excluded holders for keeper checks', () => {
    expect(isKeeperAddress(K1, ARTIST)).toBe(true);
    expect(isKeeperAddress(K1, ARTIST, new Set([K1]))).toBe(false);
  });

  it('drops them from collection holders and token holderCount but keeps them as owners', () => {
    const ex = new Set([K2]);
    const tokens = buildTokens({ ...inputs, excludeHolders: ex });
    expect(tokens[0].owners).toEqual([{ address: K2, ens: 'keeper.eth', quantity: 1, notKeeper: true }]);
    expect(tokens[0].holderCount).toBe(0);
    const col = buildCollection({ cfg, artist: ARTIST, year: 2023, tokens, balances: inputs.balances, floorWei: null, osDescription: null, staleSince: null, excludeHolders: ex });
    expect(col.holders).toBe(0);
  });
});

describe('accessionWidth (M7)', () => {
  it('uses the configured width for token accessions', () => {
    const tokens = buildTokens({ ...inputs, cfg: { ...cfg, accessionWidth: 5 } });
    expect(tokens[0].accession).toBe('GRF.23.SLV.00001');
  });
});
