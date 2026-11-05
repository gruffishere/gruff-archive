// The STRUNG DECK deal: which five cards a hand holds. Pure; the renderer lives in public/exp/strung-deck/.
export const DEALT_DECKS = [
  { key: 'deadmans', name: "Dead Man's Hand" },
  { key: 'faro', name: 'Faro' },
  { key: 'nuts', name: 'The Nuts' },
  { key: 'jacks', name: 'One-Eyed Jacks' },
  { key: 'marked', name: 'Marked Cards' },
  { key: 'cold', name: 'Cold Deck' },
  { key: 'poker', name: 'Poker Face' },
  { key: 'royal', name: 'Royal Flush' },
  { key: 'solitaire', name: 'Solitaire' },
  { key: 'crazy', name: 'Crazy Eights' },
  { key: 'house', name: 'Full House' },
  { key: 'allin', name: 'All In' },
  { key: 'river', name: 'River' },
  { key: 'bridge', name: 'Bridge' },
  { key: 'double', name: 'Double Down' },
  { key: 'king', name: 'Suicide King' },
  { key: 'tell', name: 'The Tell' },
  { key: 'hole', name: 'Ace in the Hole' },
  { key: 'bust', name: 'Bust' },
  { key: 'wild', name: 'Wild Card' },
] as const;

export const SUITS = [
  { key: 'hearts', glyph: '♥' },
  { key: 'spades', glyph: '♠' },
  { key: 'diamonds', glyph: '♦' },
  { key: 'clubs', glyph: '♣' },
] as const;
export type Suit = (typeof SUITS)[number]['key'];

export interface Card { deck: string; name: string; suit: Suit; rank: number; seed: number }

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The generator's own seed for a card: the project's decks page hashes deck, suit, rank and shuffle the same way. */
export function cardSeed(deck: string, suit: string, rank: number, shuffle = 0): number {
  let h = 2166136261;
  for (const ch of `${deck}|${suit}|${rank}|${shuffle}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

/** Five cards from five distinct decks, each with a random suit and a rank from A to 10 (the court cards are not drawn). */
export function dealHand(rand: () => number, n = 5): Card[] {
  const pool = [...DEALT_DECKS];
  const hand: Card[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const d = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    const suit = SUITS[Math.floor(rand() * SUITS.length)].key;
    const rank = 1 + Math.floor(rand() * 10);
    hand.push({ deck: d.key, name: d.name, suit, rank, seed: cardSeed(d.key, suit, rank) });
  }
  return hand;
}

/** The hand every visitor sees first, so the page is the same on every load. */
export const FIRST_HAND_SEED = 20261105;
export const firstHand = () => dealHand(mulberry32(FIRST_HAND_SEED));

export const rankLabel = (rank: number) => (rank === 1 ? 'A' : String(rank));
export const suitGlyph = (suit: Suit) => SUITS.find((s) => s.key === suit)!.glyph;
/** Ledger caption; the page uppercases it. */
export const cardCaption = (c: Card) => `${rankLabel(c.rank)} ${suitGlyph(c.suit)} · ${c.name}`;
