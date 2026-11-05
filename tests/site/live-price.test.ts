import { describe, expect, it } from 'vitest';
import { livePrice } from '../../src/lib/live-price';

const L = { priceWei: '450000000000000000' };

describe('livePrice', () => {
  it('shows a found listing as the big price', () => {
    expect(livePrice({ snapshot: '', listing: L })).toEqual({ text: '0.45 Ξ', none: false, label: 'listed', note: 'live' });
    expect(livePrice({ snapshot: '1000000000000000000', listing: L })?.none).toBe(false);
  });
  it('goes quiet when the snapshot listing is gone', () => {
    expect(livePrice({ snapshot: '1000000000000000000', listing: null })).toEqual({ text: 'not listed', none: true, label: '', note: 'offer' });
  });
  it('changes nothing when there was and is no listing', () => {
    expect(livePrice({ snapshot: '', listing: null })).toBeNull();
  });
});
