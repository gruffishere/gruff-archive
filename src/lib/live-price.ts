import { formatEth } from './format';

export interface PriceView {
  text: string;
  /** No price at all: the quiet "not listed". */
  none: boolean;
  /** The price shown is the last sale, not an ask (the artist, 2026-11-07): drawn muted and labelled as such. */
  sold: boolean;
  label: string;
  note: 'live' | 'offer';
}

export const soldLabel = (date: string) => `last sale · ${date}`;

/** What the wall label should show once the live answer is in. null = leave the page as rendered. */
export function livePrice({ snapshot, listing, lastSale }: { snapshot: string; listing: { priceWei: string } | null; lastSale?: { priceWei: string; date: string } | null }): PriceView | null {
  if (listing) return { text: formatEth(listing.priceWei) ?? 'not listed', none: false, sold: false, label: 'listed', note: 'live' };
  // the page was rendered from a listing that is gone: show the last sale if there is one, else go quiet
  if (snapshot && lastSale) return { text: formatEth(lastSale.priceWei) ?? 'not listed', none: false, sold: true, label: soldLabel(lastSale.date), note: 'offer' };
  if (snapshot) return { text: 'not listed', none: true, sold: false, label: '', note: 'offer' };
  return null;
}
