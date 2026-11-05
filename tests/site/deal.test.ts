import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DEALT_DECKS, FIRST_HAND_SEED, cardCaption, cardSeed, dealHand, firstHand, mulberry32, settlePending } from '../../src/lib/deal';

describe('the deal', () => {
  it('names the 20 decks of the project', () => {
    expect(DEALT_DECKS).toHaveLength(20);
    expect(new Set(DEALT_DECKS.map((d) => d.key)).size).toBe(20);
    expect(DEALT_DECKS.find((d) => d.key === 'marked')?.name).toBe('Marked Cards');
  });
  it('deals 5 distinct cards from 5 distinct decks', () => {
    for (let s = 1; s <= 50; s++) {
      const hand = dealHand(mulberry32(s));
      expect(hand).toHaveLength(5);
      expect(new Set(hand.map((h) => h.deck)).size).toBe(5);
      expect(new Set(hand.map((h) => `${h.deck}|${h.suit}|${h.rank}`)).size).toBe(5);
      for (const h of hand) {
        expect(h.rank).toBeGreaterThanOrEqual(1);
        expect(h.rank).toBeLessThanOrEqual(10);
        expect(['hearts', 'spades', 'diamonds', 'clubs']).toContain(h.suit);
        expect(h.seed).toBe(cardSeed(h.deck, h.suit, h.rank));
      }
    }
  });
  it('is seeded: the first hand is the same on every load, other seeds differ', () => {
    expect(firstHand()).toEqual(firstHand());
    expect(firstHand()).toEqual(dealHand(mulberry32(FIRST_HAND_SEED)));
    const other = dealHand(mulberry32(FIRST_HAND_SEED + 1));
    expect(other.map((h) => h.deck)).not.toEqual(firstHand().map((h) => h.deck));
  });
  it('gives each card a stable seed', () => {
    expect(cardSeed('marked', 'hearts', 7)).toBe(cardSeed('marked', 'hearts', 7));
    expect(cardSeed('marked', 'hearts', 7)).not.toBe(cardSeed('marked', 'spades', 7));
    expect(cardSeed('marked', 'hearts', 7)).toBeGreaterThan(0);
  });
  it('writes the ledger caption', () => {
    expect(cardCaption({ deck: 'marked', name: 'Marked Cards', suit: 'hearts', rank: 7, seed: 1 })).toBe('7 ♥ · Marked Cards');
    expect(cardCaption({ deck: 'poker', name: 'Poker Face', suit: 'spades', rank: 1, seed: 1 })).toBe('A ♠ · Poker Face');
  });
});

describe('the ported generator', () => {
  // runs the site-owned worker file in a sandbox: every deck of the list must exist in it and draw a dance machine
  const src = readFileSync('public/exp/strung-deck/gen.js', 'utf8');
  const sent: { id: number; error?: string; machine?: { loop: number; objs: unknown[]; caustic: unknown } }[] = [];
  const self: { onmessage?: (e: { data: unknown }) => void; postMessage: (m: never) => void } = { postMessage: (m) => sent.push(m) };
  runInNewContext(src, { self, Math, Object, Array, Float64Array, Int32Array, Uint8Array, Map, Set, JSON, console });
 
  it('draws a caustic machine for each of the 20 decks', () => {
    let id = 0;
    for (const d of DEALT_DECKS) self.onmessage!({ data: { id: ++id, seed: cardSeed(d.key, 'hearts', 7), opts: { deck: d.key, rank: 7, suit: 'hearts', eyes: true, machine: true, motion: 'caustic' } } });
    expect(sent.filter((m) => m.error).map((m) => m.error)).toEqual([]);
    expect(sent).toHaveLength(20);
    for (const m of sent) {
      expect(m.machine!.objs.length).toBeGreaterThan(0);
      expect(m.machine!.caustic).toBeTruthy();
    }
  }, 60_000);
});

describe('a failed worker', () => {
  it('settles every pending render with the error and empties the map', () => {
    const pending = new Map<number, (r: { error: string }) => void>();
    const got: string[] = [];
    for (const id of [1, 2, 3]) pending.set(id, (r) => got.push(`${id}:${r.error}`));
    expect(settlePending(pending, 'worker')).toBe(3);
    expect(got).toEqual(['1:worker', '2:worker', '3:worker']);
    expect(pending.size).toBe(0);
    expect(settlePending(pending, 'again')).toBe(0);
  });
});
