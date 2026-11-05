import { formatEth } from './format';

export interface PriceView {
  text: string;
  none: boolean;
  label: string;
  note: 'live' | 'offer';
}

/** What the wall label should show once the live answer is in. null = leave the page as rendered. */
export function livePrice({ snapshot, listing }: { snapshot: string; listing: { priceWei: string } | null }): PriceView | null {
  if (listing) return { text: formatEth(listing.priceWei) ?? 'not listed', none: false, label: 'listed', note: 'live' };
  if (snapshot) return { text: 'not listed', none: true, label: '', note: 'offer' };
  return null;
}
