import { describe, expect, it } from 'vitest';
import { buildKeepers } from '../../indexer/aggregate/keepers';
import { buildTimeline, monthEnd, monthRange } from '../../indexer/aggregate/timeline';
import { buildTokens } from '../../indexer/aggregate/tokens';
import { buildBalances, chainEvents, ZERO } from '../../indexer/ledger';
import type { ArchiveEvent, CollectionConfig, RawTransfer } from '../../indexer/types';

const ARTIST = '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

const cfg = (code: string, slug: string): CollectionConfig => ({
  code,
  slug,
  title: slug,
  contract: `0x${code.toLowerCase()}`,
  standard: 'erc1155',
  platform: 'manifold',
  section: 'index',
  techniques: ['illustration'],
});

let block = 0;
const tr = (contract: string, tokenId: string, from: string, to: string, value: string, timestamp: string): RawTransfer => ({
  contract,
  tokenId,
  from,
  to,
  fromEns: null,
  toEns: to === A ? 'aa.eth' : null,
  value,
  txHash: `0x${++block}`,
  logIndex: 0,
  blockNumber: block,
  timestamp,
});

const vbsTransfers = [
  tr('0xvbs', '1', ZERO, A, '2', '2023-01-15T00:00:00.000Z'),
  tr('0xvbs', '1', ZERO, B, '1', '2023-02-10T00:00:00.000Z'),
];
const fctTransfers = [
  tr('0xfct', '7', ZERO, ARTIST, '1', '2026-09-08T00:00:00.000Z'),
  tr('0xfct', '7', ARTIST, A, '1', '2026-09-20T00:00:00.000Z'),
];

function collection(c: CollectionConfig, transfers: RawTransfer[], extra: ArchiveEvent[] = []) {
  const balances = buildBalances(transfers);
  const events = [...chainEvents(transfers), ...extra].sort((x, y) => (x.timestamp < y.timestamp ? 1 : -1));
  const mints = new Map([...balances.keys()].map((id) => [id, { at: transfers[0].timestamp, txHash: transfers[0].txHash, priceWei: '10', primary: false }]));
  const tokens = buildTokens({ cfg: c, artist: ARTIST, year: 2023, metas: new Map(), balances, mints, events, listings: new Map(), media: new Map(), ens: new Map() });
  return { cfg: c, transfers, balances, events, tokens };
}

describe('buildKeepers', () => {
  const sale: ArchiveEvent = {
    id: 's',
    kind: 'sale',
    contract: '0xfct',
    tokenId: '7',
    quantity: 1,
    from: ARTIST,
    to: A,
    priceWei: '300',
    txHash: '0xs',
    timestamp: '2026-09-20T00:00:00.000Z',
  };
  const keepers = buildKeepers({
    artist: ARTIST,
    ens: new Map([[A, 'aa.eth']]),
    indexOrder: ['VBS', 'FCT'],
    collections: [collection(cfg('VBS', 'vibes'), vbsTransfers), collection(cfg('FCT', 'facets'), fctTransfers, [sale])],
  });

  it('ranks keepers and excludes the artist', () => {
    expect(keepers.map((k) => [k.address, k.pieces, k.works])).toEqual([
      [A, 3, 2],
      [B, 1, 1],
    ]);
  });

  it('computes mask, dates, from-artist totals and longest held', () => {
    expect(keepers[0]).toMatchObject({
      ens: 'aa.eth',
      collections: ['VBS', 'FCT'],
      mask: '11',
      firstAcquired: '2023-01-15T00:00:00.000Z',
      lastAcquired: '2026-09-20T00:00:00.000Z',
      fromArtist: { pieces: 3, paidWei: '320' },
      longestHeld: { slug: 'vibes', tokenId: '1', since: '2023-01-15T00:00:00.000Z' },
    });
    expect(keepers[1].mask).toBe('10');
  });

  it('names the earliest piece acquired from the artist, with its price', () => {
    expect(keepers[0].firstFromArtist).toEqual({ slug: 'vibes', tokenId: '1', at: '2023-01-15T00:00:00.000Z', priceWei: '20' });
  });

  it('leaves firstFromArtist null for a keeper that only bought on the secondary market', () => {
    const C = '0x00000000000000000000000000000000000000cc';
    const resold = [
      tr('0xvbs', '1', ZERO, A, '1', '2023-01-15T00:00:00.000Z'),
      tr('0xvbs', '1', A, C, '1', '2023-03-01T00:00:00.000Z'),
    ];
    const withResale = buildKeepers({
      artist: ARTIST,
      ens: new Map(),
      indexOrder: ['VBS'],
      collections: [collection(cfg('VBS', 'vibes'), resold)],
    });
    expect(withResale.find((k) => k.address === C)).toMatchObject({ pieces: 1, firstFromArtist: null });
  });
});

describe('timeline', () => {
  it('builds month ranges and month ends', () => {
    expect(monthRange('2022-11', '2023-02')).toEqual(['2022-11', '2022-12', '2023-01', '2023-02']);
    expect(monthEnd('2023-02')).toBe('2023-02-28T23:59:59.999Z');
  });

  it('summarises the archive at each month end', () => {
    const t = buildTimeline({
      artist: ARTIST,
      from: '2023-01',
      to: '2023-02',
      collections: [{ code: 'VBS', transfers: vbsTransfers }],
    });
    expect(t).toEqual([
      { month: '2023-01', collections: [{ code: 'VBS', works: 1 }], holders: 1 },
      { month: '2023-02', collections: [{ code: 'VBS', works: 1 }], holders: 2 },
    ]);
  });
});

describe('excludeHolders (M3)', () => {
  it('omits configured addresses from keepers and the timeline holder count', () => {
    const c = collection(cfg('VBS', 'vibes-and-times'), vbsTransfers);
    const keepers = buildKeepers({ artist: ARTIST, ens: new Map(), indexOrder: ['VBS'], collections: [c], excludeHolders: [A] });
    expect(keepers.map((k) => k.address)).toEqual([B]);
    const tl = buildTimeline({ artist: ARTIST, from: '2023-02', to: '2023-02', collections: [{ code: 'VBS', transfers: vbsTransfers }], excludeHolders: [A] });
    expect(tl[0].holders).toBe(1);
  });
});
