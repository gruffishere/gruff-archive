import type { Balances } from '../ledger';
import type { ArchiveEvent, CollectionConfig, RawTransfer } from '../types';
import { isKeeperAddress } from './exclusions';
import type { TokenOut } from './tokens';

export interface KeeperOut {
  address: string;
  ens: string | null;
  pieces: number;
  works: number;
  collections: string[];
  mask: string;
  firstAcquired: string | null;
  lastAcquired: string | null;
  fromArtist: { pieces: number; paidWei: string };
  firstFromArtist: { slug: string; tokenId: string; at: string; priceWei: string | null } | null;
  longestHeld: { slug: string; tokenId: string; since: string } | null;
  holdings: { slug: string; tokenId: string; quantity: number }[];
}

interface Draft {
  address: string;
  pieces: number;
  works: number;
  codes: Set<string>;
  first: string | null;
  last: string | null;
  fromArtistPieces: number;
  fromArtistPaid: bigint;
  firstFromArtist: KeeperOut['firstFromArtist'];
  longest: KeeperOut['longestHeld'];
  holdings: KeeperOut['holdings'];
}

export function buildKeepers(i: {
  artist: string;
  ens: Map<string, string>;
  indexOrder: string[];
  /** Config `excludeHolders`. */
  excludeHolders?: Iterable<string>;
  collections: { cfg: CollectionConfig; transfers: RawTransfer[]; balances: Balances; events: ArchiveEvent[]; tokens: TokenOut[] }[];
}): KeeperOut[] {
  const extra = new Set(i.excludeHolders ?? []);
  const isKeeper = (address: string) => isKeeperAddress(address, i.artist, extra);
  const drafts = new Map<string, Draft>();
  const get = (address: string): Draft => {
    let d = drafts.get(address);
    if (!d) {
      d = { address, pieces: 0, works: 0, codes: new Set(), first: null, last: null, fromArtistPieces: 0, fromArtistPaid: 0n, firstFromArtist: null, longest: null, holdings: [] };
      drafts.set(address, d);
    }
    return d;
  };
  const noteFirstFromArtist = (d: Draft, candidate: NonNullable<KeeperOut['firstFromArtist']>) => {
    if (!d.firstFromArtist || candidate.at < d.firstFromArtist.at) d.firstFromArtist = candidate;
  };

  for (const c of i.collections) {
    const lastInbound = new Map<string, string>();
    for (const t of c.transfers) {
      if (!isKeeper(t.to) || BigInt(t.value || '0') <= 0n) continue; // zero-value transfers move nothing
      const d = get(t.to);
      if (!d.first || t.timestamp < d.first) d.first = t.timestamp;
      if (!d.last || t.timestamp > d.last) d.last = t.timestamp;
      lastInbound.set(`${t.tokenId}:${t.to}`, t.timestamp);
    }

    for (const [tokenId, holders] of c.balances) {
      for (const [address, qty] of holders) {
        if (!isKeeper(address)) continue;
        const d = get(address);
        d.pieces += Number(qty);
        d.works += 1;
        d.codes.add(c.cfg.code);
        d.holdings.push({ slug: c.cfg.slug, tokenId, quantity: Number(qty) });
        const since = lastInbound.get(`${tokenId}:${address}`);
        if (since && (!d.longest || since < d.longest.since)) d.longest = { slug: c.cfg.slug, tokenId, since };
      }
    }

    const paidMint = new Map(c.tokens.map((t) => [t.id, t.mint && !t.mint.primary ? t.mint.priceWei : null]));
    for (const e of c.events) {
      if (!e.to || !isKeeper(e.to)) continue;
      if (e.kind === 'sale' && e.from === i.artist) {
        const d = get(e.to);
        // An unpriced artist sale (non-ETH/WETH payment) still counts for firstFromArtist, but not for the fromArtist totals.
        if (e.priceWei) {
          d.fromArtistPieces += e.quantity;
          d.fromArtistPaid += BigInt(e.priceWei);
        }
        noteFirstFromArtist(d, { slug: c.cfg.slug, tokenId: e.tokenId, at: e.timestamp, priceWei: e.priceWei });
      } else if (e.kind === 'mint') {
        const price = paidMint.get(e.tokenId);
        if (!price) continue;
        const d = get(e.to);
        const paid = BigInt(price) * BigInt(e.quantity);
        d.fromArtistPieces += e.quantity;
        d.fromArtistPaid += paid;
        noteFirstFromArtist(d, { slug: c.cfg.slug, tokenId: e.tokenId, at: e.timestamp, priceWei: paid.toString() });
      }
    }
  }

  const order = new Map(i.indexOrder.map((code, idx) => [code, idx]));
  return [...drafts.values()]
    .filter((d) => d.pieces > 0)
    .sort((a, b) => b.pieces - a.pieces || b.works - a.works || (a.first ?? '').localeCompare(b.first ?? ''))
    .map((d) => ({
      address: d.address,
      ens: i.ens.get(d.address) ?? null,
      pieces: d.pieces,
      works: d.works,
      collections: [...d.codes].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)),
      mask: i.indexOrder.map((code) => (d.codes.has(code) ? '1' : '0')).join(''),
      firstAcquired: d.first,
      lastAcquired: d.last,
      fromArtist: { pieces: d.fromArtistPieces, paidWei: d.fromArtistPaid.toString() },
      firstFromArtist: d.firstFromArtist,
      longestHeld: d.longest,
      holdings: d.holdings,
    }));
}
