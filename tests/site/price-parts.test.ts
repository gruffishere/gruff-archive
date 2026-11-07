import { describe, expect, it } from 'vitest';
import { ethParts } from '../../src/lib/price-parts';

describe('ethParts', () => {
  it('splits an eth price into the number and a small " Ξ", keeping the text whole', () => {
    expect(ethParts('0.035 Ξ')).toEqual({ num: '0.035', cur: ' Ξ' });
    expect(ethParts('<0.0001 Ξ')).toEqual({ num: '<0.0001', cur: ' Ξ' });
    const p = ethParts('12.5 Ξ')!;
    expect(p.num + p.cur).toBe('12.5 Ξ');
  });
  it('leaves anything else alone', () => {
    expect(ethParts('not listed')).toBeNull();
  });
});
