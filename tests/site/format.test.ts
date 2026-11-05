import { describe, expect, it } from 'vitest';
import { displayName, eventLabel, formatDate, formatEth, formatMonth, formatTime, formatUsd, heldFor, mintValue, shortAddress, timeAgo } from '../../src/lib/format';

describe('format', () => {
  it('formats eth with up to 4 decimals', () => {
    expect(formatEth('450000000000000000')).toBe('0.45 Ξ');
    expect(formatEth('65290000000000000')).toBe('0.0652 Ξ');
    expect(formatEth('1000000000000000000')).toBe('1 Ξ');
    expect(formatEth('10000000000000')).toBe('<0.0001 Ξ');
    expect(formatEth('0')).toBe('0 Ξ');
    expect(formatEth(null)).toBeNull();
  });
  it('describes a mint value', () => {
    expect(mintValue({ priceWei: '100000000000000000', primary: false })).toBe('0.1 Ξ');
    expect(mintValue({ priceWei: '100000000000000000', primary: true })).toBe('0.1 Ξ');
    expect(mintValue({ priceWei: '0', primary: true })).toBe('free');
    expect(mintValue({ priceWei: null, primary: true })).toBe('free');
    expect(mintValue({ priceWei: '0', primary: false })).toBe('—');
    expect(mintValue({ priceWei: null, primary: false })).toBe('—');
  });
  it('formats usd from eth price', () => {
    expect(formatUsd('450000000000000000', 2260.91)).toBe('$1,017');
    expect(formatUsd('450000000000000000', null)).toBeNull();
  });
  it('formats addresses and names', () => {
    expect(shortAddress('0x7a3b000000000000000000000000000000000e91')).toBe('0x7a3…e91');
    expect(displayName('0x7a3b000000000000000000000000000000000e91', 'keeper.eth')).toBe('keeper.eth');
    expect(displayName('0x7a3b000000000000000000000000000000000e91', null)).toBe('0x7a3…e91');
  });
  it('formats dates in UTC', () => {
    expect(formatDate('2025-05-26T09:21:11.000Z')).toBe('26.05.2025');
    expect(formatMonth('2023-02-12T00:00:00.000Z')).toBe('02.2023');
    expect(formatTime('2025-05-26T09:21:11.000Z')).toBe('09:21');
  });
  it('formats relative times and durations', () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    expect(timeAgo('2026-11-05T11:58:00.000Z', now)).toBe('2m ago');
    expect(timeAgo('2026-11-05T09:00:00.000Z', now)).toBe('3h ago');
    expect(timeAgo('2026-11-01T12:00:00.000Z', now)).toBe('4d ago');
    expect(heldFor('2023-03-01T00:00:00.000Z', now)).toBe('3y 8m');
    expect(heldFor('2026-10-20T00:00:00.000Z', now)).toBe('0m');
  });
  it('labels events', () => {
    expect(eventLabel('mint', 3)).toBe('mint ×3');
    expect(eventLabel('sale', 1)).toBe('sale');
  });
});
