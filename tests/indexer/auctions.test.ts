import { describe, expect, it } from 'vitest';
import { foundationBids, houseExits, loadHouseSales, saleEvent, saleFromLogs, transientBids, type DecodedLog } from '../../indexer/auctions';
import type { RawTransfer } from '../../indexer/types';

// Shapes and values taken from the real chain (Blockscout v2), 2026-11-07.
const TL = '0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d';
const OVS = '0x685ec110408cede874604f75ff9ccbd297ccde21';
const ICN = '0x4b5599f580dc09db8ac3c7cbe650137d871d3ae1';
const ARTIST = '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';
const BUYER = '0xde4b72239f6d6e2342cbc48ca8fb04e05a25f1c7';

const listing = (o: { bidder?: string; bid?: string; buyNow?: string } = {}) => ['1', 'false', ARTIST, ARTIST, '0x0000000000000000000000000000000000000000', '0', '10000000000000000', o.buyNow ?? '0', '1752012719', '86400', '0x0000000000000000000000000000000000000000', o.bidder ?? BUYER, o.bid ?? '25000000000000000', '7'];
const log = (house: string, name: string, params: [string, unknown][], at: { block?: number; ts?: string; tx?: string } = {}): DecodedLog => ({
  address: { hash: house }, topics: [], data: '0x', block_number: at.block, block_timestamp: at.ts, transaction_hash: at.tx,
  decoded: { method_call: `${name}(...)`, parameters: params.map(([n, v]) => ({ name: n, value: v })) },
});
const tl = (name: string, params: [string, unknown][], at?: Parameters<typeof log>[3]) => log('0x6f66b95a0C512f3497FB46660E0BC3B94B989f8D', name, params, at);
const fnd = (name: string, params: [string, unknown][], at?: Parameters<typeof log>[3]) => log('0xcDA72070E455bb31C7690a170224Ce43623d0B6f', name, params, at);
const transfer = (p: Partial<RawTransfer>): RawTransfer => ({ contract: OVS, tokenId: '22', from: ARTIST, to: TL, fromEns: null, toEns: null, value: '1', txHash: '0xa', logIndex: 0, blockNumber: 100, timestamp: '2025-07-08T21:14:35.000Z', ...p });

describe('saleFromLogs', () => {
  it('reads a Transient auction: the highest bid and bidder from the settled listing (captive, 0.025 ETH)', () => {
    const logs = [tl('AuctionSettled', [['sender', ARTIST], ['nftAddress', '0x685EC110408CEDE874604f75Ff9CCbD297cCde21'], ['tokenId', '22'], ['listing', listing()]])];
    expect(saleFromLogs(logs, OVS, '22')).toEqual({ tokenId: '22', house: 'transient', kind: 'auction', seller: ARTIST, buyer: BUYER, priceWei: '25000000000000000' });
    expect(saleFromLogs(logs, OVS, '23')).toBeNull();
  });
  it('reads a Transient buy-now at its buy-now price, bought by the recipient', () => {
    const logs = [tl('BuyNowFulfilled', [['nftAddress', OVS], ['tokenId', '5'], ['recipient', BUYER], ['listing', listing({ buyNow: '50000000000000000', bid: '0' })]])];
    expect(saleFromLogs(logs, OVS, '5')).toMatchObject({ kind: 'buy now', priceWei: '50000000000000000', buyer: BUYER });
  });
  it("reads a Foundation auction as the sum paid out: fees + creator + seller (ICON's #1, 0.836 ETH)", () => {
    const logs = [fnd('ReserveAuctionFinalized', [['auctionId', '312774'], ['seller', '0x4730497622bDFd6EAFe1F09Fa22B3A0ACA94a646'], ['bidder', '0xbBc65012FFDBd902C9A80d652B8c1478f1880A0d'], ['totalFees', '41800000000000000'], ['creatorRev', '794200000000000000'], ['sellerRev', '0']])];
    expect(saleFromLogs(logs, ICN, '1')).toEqual({ tokenId: '1', house: 'foundation', kind: 'auction', seller: ARTIST, buyer: '0xbbc65012ffdbd902c9a80d652b8c1478f1880a0d', priceWei: '836000000000000000', auctionId: '312774' });
  });
  it('finds nothing in a cancel or a plain move', () => {
    expect(saleFromLogs([tl('ListingCanceled', [['nftAddress', OVS], ['tokenId', '22']])], OVS, '22')).toBeNull();
    expect(saleFromLogs([], OVS, '22')).toBeNull();
  });
});

describe('bids', () => {
  it('reads Transient bids for one token inside its auction window: the sender and the new highest bid', () => {
    const logs = [
      tl('AuctionBid', [['sender', '0x810657D67c68cf7299f7ecbc321b293ee064c5df'], ['tokenId', '22'], ['listing', listing({ bid: '15000000000000000' })]], { block: 150, ts: '2025-07-08T23:15:59.000000Z', tx: '0x52FAE8' }),
      tl('AuctionBid', [['sender', BUYER], ['tokenId', '23'], ['listing', listing()]], { block: 150, ts: '2025-07-08T23:16:00Z', tx: '0x1' }),
      tl('AuctionBid', [['sender', BUYER], ['tokenId', '22'], ['listing', listing()]], { block: 900, ts: '2026-01-01T00:00:00Z', tx: '0x2' }),
    ];
    expect(transientBids(logs, '22', 100, 180)).toEqual([{ bidder: '0x810657d67c68cf7299f7ecbc321b293ee064c5df', priceWei: '15000000000000000', txHash: '0x52fae8', at: '2025-07-08T23:15:59.000Z' }]);
  });
  it('reads Foundation bids of one auction: the bidder and the amount', () => {
    const logs = [fnd('ReserveAuctionBidPlaced', [['auctionId', '312774'], ['bidder', '0xbBc65012FFDBd902C9A80d652B8c1478f1880A0d'], ['amount', '836000000000000000'], ['endTime', '1676756807']], { block: 16658202, ts: '2023-02-18T21:46:47Z', tx: '0x6fa7' })];
    expect(foundationBids(logs, '312774', 16_600_000, 16_658_279)[0]).toMatchObject({ bidder: '0xbbc65012ffdbd902c9a80d652b8c1478f1880a0d', priceWei: '836000000000000000' });
    expect(foundationBids(logs, '1', 0, 99_999_999)).toEqual([]);
  });
});

describe('loadHouseSales', () => {
  const transfers = [transfer({ txHash: '0xdeposit', blockNumber: 100 }), transfer({ from: TL, to: BUYER, txHash: '0xsettle', blockNumber: 180, timestamp: '2025-07-09T22:36:59.000Z' })];
  const settled = { items: [tl('AuctionSettled', [['nftAddress', OVS], ['tokenId', '22'], ['listing', listing()]])] };
  const bidPage = { items: [
    tl('AuctionBid', [['sender', '0x810657d67c68cf7299f7ecbc321b293ee064c5df'], ['tokenId', '22'], ['listing', listing({ bid: '15000000000000000' })]], { block: 120, ts: '2025-07-08T23:00:00Z', tx: '0xb1' }),
    tl('AuctionBid', [['sender', BUYER], ['tokenId', '22'], ['listing', listing()]], { block: 170, ts: '2025-07-09T20:00:00Z', tx: '0xb2' }),
  ], next_page_params: null };
  it('looks each settlement up once, with its bids newest first, and turns it into a sale event', async () => {
    const urls: string[] = [];
    const fetchJson = (async (url: string) => {
      urls.push(url);
      if (url.includes('/transactions/0xsettle/logs')) return settled;
      if (url.includes(`/addresses/${TL}/logs?topic=0x000000000000000000000000${OVS.slice(2)}`)) return bidPage;
      throw new Error('unexpected ' + url);
    }) as never;
    const cache = { sales: {} };
    const sales = await loadHouseSales(OVS, transfers, cache, fetchJson);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ priceWei: '25000000000000000', buyer: BUYER, txHash: '0xsettle', at: '2025-07-09T22:36:59.000Z' });
    expect(sales[0]).not.toHaveProperty('bidsPending');
    expect(sales[0]!.bids.map((b) => b.priceWei)).toEqual(['25000000000000000', '15000000000000000']);
    expect(saleEvent(OVS, sales[0]!)).toMatchObject({ kind: 'sale', from: ARTIST, to: BUYER, priceWei: '25000000000000000', txHash: '0xsettle' });
    urls.length = 0;
    await loadHouseSales(OVS, transfers, cache, fetchJson);
    expect(urls).toEqual([]);
  });
  it('keeps the sale when the bid search fails, and fills the bids on a later run', async () => {
    let failing = true;
    const fetchJson = (async (url: string) => {
      if (url.includes('/transactions/')) return settled;
      if (failing) throw new Error('HTTP 429 for ' + url);
      return bidPage;
    }) as never;
    const cache = { sales: {} };
    const first = await loadHouseSales(OVS, transfers, cache, fetchJson);
    expect(first[0]).toMatchObject({ priceWei: '25000000000000000', bids: [], bidsPending: true });
    failing = false;
    const second = await loadHouseSales(OVS, transfers, cache, fetchJson);
    expect(second[0]!.bids).toHaveLength(2);
    expect(second[0]).not.toHaveProperty('bidsPending');
  });
  it('only treats moves out of a house as candidates', () => {
    expect(houseExits(transfers).map((t) => t.txHash)).toEqual(['0xsettle']);
  });
  it('skips a failed settlement lookup and leaves it for the next run', async () => {
    const cache = { sales: {} as Record<string, unknown[]> };
    const sales = await loadHouseSales(OVS, transfers, cache as never, (async () => { throw new Error('502'); }) as never);
    expect(sales).toEqual([]);
    expect(cache.sales['0xsettle']).toBeUndefined();
  });
});
