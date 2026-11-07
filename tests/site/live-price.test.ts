import { describe, expect, it } from 'vitest';
import { livePrice } from '../../src/lib/live-price';

const L = { priceWei: '450000000000000000' };
const S = { priceWei: '25000000000000000', date: '09.07.2025' };

describe('livePrice', () => {
  it('shows a found listing as the big price', () => {
    expect(livePrice({ snapshot: '', listing: L })).toEqual({ text: '0.45 Ξ', none: false, sold: false, label: 'listed', note: 'live' });
    expect(livePrice({ snapshot: '1000000000000000000', listing: L })?.none).toBe(false);
    expect(livePrice({ snapshot: '', listing: L, lastSale: S })).toMatchObject({ sold: false, label: 'listed' });
  });
  it('goes quiet when the snapshot listing is gone and the work never sold', () => {
    expect(livePrice({ snapshot: '1000000000000000000', listing: null })).toEqual({ text: 'not listed', none: true, sold: false, label: '', note: 'offer' });
  });
  // the artist (2026-11-07): an unlisted work that sold shows its last sale in the price spot, said to be a last sale
  it('falls back to the last sale, labelled as one, when the listing is gone', () => {
    expect(livePrice({ snapshot: '1000000000000000000', listing: null, lastSale: S })).toEqual({ text: '0.025 Ξ', none: false, sold: true, label: 'last sale · 09.07.2025', note: 'offer' });
  });
  it('changes nothing when there was and is no listing', () => {
    expect(livePrice({ snapshot: '', listing: null })).toBeNull();
    expect(livePrice({ snapshot: '', listing: null, lastSale: S })).toBeNull();
  });
});
