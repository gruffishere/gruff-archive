import type { FetchJson } from './http';
import type { ArchiveEvent, RawTransfer } from './types';

/**
 * Sales that close on a marketplace's own contract never reach OpenSea's event feed: an auction settles, or a buy-now
 * fills, inside the house's contract, and the token simply moves from the house to the buyer with no value attached.
 * Found 2026-11-07: every oversimulated work (Transient auctions) and every Foundation sale showed "last sale none".
 * We read them from the houses' own events instead (Blockscout v2, decoded from the verified contracts): the sale from
 * the settlement transaction, the bid war from the bid events the house logged for that token or auction.
 */
export const AUCTION_HOUSES: Record<string, House> = {
  '0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d': 'transient', // TLAuctionHouse (Transient Labs)
  '0xcda72070e455bb31c7690a170224ce43623d0b6f': 'foundation', // Foundation NFTMarket
};
export type House = 'transient' | 'foundation';

const V2 = 'https://eth.blockscout.com/api/v2';

export interface Bid { bidder: string; priceWei: string; txHash: string; at: string }
export interface HouseSale {
  tokenId: string;
  house: House;
  kind: 'auction' | 'buy now' | 'offer';
  seller: string;
  buyer: string;
  priceWei: string;
  txHash: string;
  at: string;
  /** Stored newest first, the winning bid on top. */
  bids: Bid[];
  /** Set while an auction's bids are still to be read; the sale itself is already right. */
  bidsPending?: true;
  /** Foundation's auction id, needed to find its bids. */
  auctionId?: string;
}

/** A log as Blockscout v2 returns it, decoded from the verified contract. */
export interface DecodedLog {
  address: { hash: string };
  topics: (string | null)[];
  data: string;
  block_number?: number;
  block_timestamp?: string;
  transaction_hash?: string;
  decoded: { method_call: string; parameters: { name: string; value: unknown }[] } | null;
}

const lower = (a: unknown) => String(a ?? '').toLowerCase();
const param = (log: DecodedLog, name: string) => log.decoded?.parameters.find((p) => p.name === name)?.value;
const event = (log: DecodedLog) => log.decoded?.method_call.split('(')[0] ?? '';
const pad = (n: string) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const newestFirst = (a: Bid, b: Bid) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
const inWindow = (l: DecodedLog, from: number, to: number) => (l.block_number ?? -1) >= from && (l.block_number ?? Infinity) <= to;
const bidOf = (l: DecodedLog, bidder: unknown, wei: unknown): Bid => ({ bidder: lower(bidder), priceWei: String(wei), txHash: lower(l.transaction_hash), at: new Date(l.block_timestamp ?? 0).toISOString() });

/**
 * The sale a settlement transaction records for one token, with what is needed to find its bids:
 * TLAuctionHouse AuctionSettled / BuyNowFulfilled carry the listing tuple (seller [2], recipient [10],
 * highest bidder [11], highest bid [12], buy-now price [7]); Foundation's ReserveAuctionFinalized, BuyPriceAccepted and
 * OfferAccepted pay out totalFees + creatorRev + sellerRev, which is the price the buyer paid.
 */
export function saleFromLogs(logs: DecodedLog[], contract: string, tokenId: string): (Omit<HouseSale, 'txHash' | 'at' | 'bids'> & { auctionId?: string }) | null {
  for (const log of logs) {
    const house = AUCTION_HOUSES[lower(log.address.hash)];
    if (!house || !log.decoded) continue;
    const name = event(log);
    if (house === 'transient' && (name === 'AuctionSettled' || name === 'BuyNowFulfilled')) {
      if (lower(param(log, 'nftAddress')) !== contract || String(param(log, 'tokenId')) !== tokenId) continue;
      const l = param(log, 'listing') as unknown[];
      if (!Array.isArray(l)) continue;
      const buyNow = name === 'BuyNowFulfilled';
      const price = String(buyNow ? l[7] : l[12]);
      const buyer = lower(buyNow ? param(log, 'recipient') : l[11]);
      if (price === '0' || !buyer) continue;
      return { tokenId, house, kind: buyNow ? 'buy now' : 'auction', seller: lower(l[2]), buyer, priceWei: price };
    }
    if (house === 'foundation' && (name === 'ReserveAuctionFinalized' || name === 'BuyPriceAccepted' || name === 'OfferAccepted')) {
      if (name !== 'ReserveAuctionFinalized' && (lower(param(log, 'nftContract')) !== contract || String(param(log, 'tokenId')) !== tokenId)) continue;
      const paid = ['totalFees', 'creatorRev', 'sellerRev'].reduce((s, n) => s + BigInt(String(param(log, n) ?? '0')), 0n);
      if (paid === 0n) continue;
      const kind = name === 'ReserveAuctionFinalized' ? 'auction' : name === 'BuyPriceAccepted' ? 'buy now' : 'offer';
      const buyer = lower(name === 'ReserveAuctionFinalized' ? param(log, 'bidder') : param(log, 'buyer'));
      return { tokenId, house, kind, seller: lower(param(log, 'seller')), buyer, priceWei: paid.toString(), ...(name === 'ReserveAuctionFinalized' ? { auctionId: String(param(log, 'auctionId')) } : {}) };
    }
  }
  return null;
}

/** TLAuctionHouse AuctionBid logs for one token inside an auction's block window: the bidder is the sender, the bid the listing's new highest bid [12]. */
export const transientBids = (logs: DecodedLog[], tokenId: string, from: number, to: number): Bid[] =>
  logs
    .filter((l) => event(l) === 'AuctionBid' && String(param(l, 'tokenId')) === tokenId && inWindow(l, from, to))
    .map((l) => bidOf(l, param(l, 'sender'), (param(l, 'listing') as unknown[])[12]));

/** Foundation ReserveAuctionBidPlaced logs of one auction: the bidder and the amount. */
export const foundationBids = (logs: DecodedLog[], auctionId: string, from: number, to: number): Bid[] =>
  logs
    .filter((l) => event(l) === 'ReserveAuctionBidPlaced' && String(param(l, 'auctionId')) === auctionId && inWindow(l, from, to))
    .map((l) => bidOf(l, param(l, 'bidder'), param(l, 'amount')));

/** The sale events a house sale adds to a token's history; the seller stands as `from`, so an artist's first sale reads as primary. */
export const saleEvent = (contract: string, s: HouseSale): ArchiveEvent => ({
  id: `${s.house}:${s.txHash}:${s.tokenId}`,
  kind: 'sale',
  contract,
  tokenId: s.tokenId,
  quantity: 1,
  from: s.seller,
  to: s.buyer,
  priceWei: s.priceWei,
  txHash: s.txHash,
  timestamp: s.at,
});

/** Transfers out of a house to someone else: each is a sale candidate, unless the house says otherwise. */
export function houseExits(transfers: RawTransfer[]): RawTransfer[] {
  return transfers.filter((t) => AUCTION_HOUSES[t.from] && t.to !== t.from);
}

export interface AuctionCache {
  /** Settlement tx hash → the sales it recorded (empty when it was a cancel or a plain move). */
  sales: Record<string, HouseSale[]>;
}

/**
 * Finds every house sale in a collection's transfers, with its bid war. Settled sales never change, so each
 * settlement transaction is looked up once and kept in `cache`; a sale is kept as soon as it is read, and its bids are
 * filled in on this or a later run. Lookups that fail are skipped and retried next run.
 */
export async function loadHouseSales(
  contract: string,
  transfers: RawTransfer[],
  cache: AuctionCache,
  fetchJson: FetchJson,
  log: (m: string) => void = () => {},
): Promise<HouseSale[]> {
  // every log a house wrote under one topic (a collection, or a Foundation auction id), all pages, read once per run
  const pages = new Map<string, Promise<DecodedLog[]>>();
  const logsUnder = (house: string, topic: string) => {
    const key = `${house}:${topic}`;
    if (!pages.has(key)) {
      pages.set(key, (async () => {
        const out: DecodedLog[] = [];
        let next: Record<string, unknown> | null = null;
        for (let page = 0; page < 40; page++) {
          const extra: string = next ? `&${new URLSearchParams(Object.entries(next).map(([k, v]) => [k, String(v)])).toString()}` : '';
          const r: { items?: DecodedLog[]; next_page_params?: Record<string, unknown> | null } = await fetchJson(`${V2}/addresses/${house}/logs?topic=${topic}${extra}`);
          out.push(...(r.items ?? []));
          next = r.next_page_params ?? null;
          if (!next) break;
        }
        return out;
      })());
      pages.get(key)!.catch(() => pages.delete(key));
    }
    return pages.get(key)!;
  };

  const exits = houseExits(transfers);
  for (const t of exits) {
    const known = cache.sales[t.txHash];
    if (known && !known.some((x) => x.bidsPending)) continue;
    try {
      let sale = known?.[0];
      if (!sale) {
        const logs = await fetchJson<{ items: DecodedLog[] }>(`${V2}/transactions/${t.txHash}/logs`);
        const found = saleFromLogs(logs.items ?? [], contract, t.tokenId);
        if (!found) { cache.sales[t.txHash] = []; continue; }
        sale = { ...found, txHash: t.txHash, at: t.timestamp, bids: [], ...(found.kind === 'auction' ? { bidsPending: true as const } : {}) };
        cache.sales[t.txHash] = [sale];
      }
      if (!sale.bidsPending) continue;
      // the auction ran from the token's last move into the house up to this settlement
      const into = transfers.filter((x) => x.tokenId === t.tokenId && x.to === t.from && x.blockNumber <= t.blockNumber).at(-1);
      const from = into?.blockNumber ?? 0;
      let bids: Bid[] = [];
      if (sale.house === 'transient') bids = transientBids(await logsUnder(t.from, pad(BigInt(contract).toString())), t.tokenId, from, t.blockNumber);
      else if (sale.auctionId) bids = foundationBids(await logsUnder(t.from, pad(sale.auctionId)), sale.auctionId, from, t.blockNumber);
      const { bidsPending: _done, ...rest } = sale;
      cache.sales[t.txHash] = [{ ...rest, bids: bids.sort(newestFirst) }];
    } catch (err) {
      log(`  house sale lookup failed for ${t.txHash} (${(err as Error).message}); will retry next run`);
    }
  }
  return exits.flatMap((t) => cache.sales[t.txHash] ?? []).filter((x) => x.tokenId);
}
