import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { isEditions, isGenerative, isOnChain } from '../../indexer/tags';
import type { Room } from './rooms';
import { formatDate } from './format';

export type IndexFilter = 'all' | 'one-of-one' | 'editions' | 'generative' | 'on-chain' | 'experiments';
export const INDEX_FILTERS: { key: IndexFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'one-of-one', label: '1/1' },
  { key: 'editions', label: 'editions' },
  { key: 'generative', label: 'generative' },
  { key: 'on-chain', label: 'on-chain' },
  { key: 'experiments', label: 'experiments' },
];

export function filterTags(c: CollectionOut): IndexFilter[] {
  const tags: IndexFilter[] = ['all'];
  const generative = isGenerative(c);
  if (isEditions(c)) tags.push('editions');
  else if (!generative) tags.push('one-of-one');
  if (generative) tags.push('generative');
  if (isOnChain(c)) tags.push('on-chain');
  if (c.section === 'experiments') tags.push('experiments');
  return tags;
}

const byFirstMintDesc = (a: CollectionOut, b: CollectionOut) => (b.firstMint ?? '').localeCompare(a.firstMint ?? '');
export const indexCollections = (all: CollectionOut[]) => all.filter((c) => c.section === 'index').sort(byFirstMintDesc);
/** The index ledger: the collections plus the experiments, newest first. */
export const indexLedger = (all: CollectionOut[]) => all.filter((c) => c.section === 'index' || c.section === 'experiments').sort(byFirstMintDesc);
export type LedgerEntry = { kind: 'collection'; c: CollectionOut } | { kind: 'room'; room: Room };
const entryMonth = (e: LedgerEntry) => (e.kind === 'room' ? e.room.since : (e.c.firstMint ?? '').slice(0, 7));
const entryStamp = (e: LedgerEntry) => (e.kind === 'room' ? `${e.room.since}-01` : (e.c.firstMint ?? ''));
/** The index ledger with the rooms: collections, experiments and rooms in one list, newest first (rooms by `since`). */
export function ledgerEntries(all: CollectionOut[], rooms: Room[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [...indexLedger(all).map((c): LedgerEntry => ({ kind: 'collection', c })), ...rooms.map((room): LedgerEntry => ({ kind: 'room', room }))];
  return entries.sort((a, b) => entryMonth(b).localeCompare(entryMonth(a)) || entryStamp(b).localeCompare(entryStamp(a)));
}
/** Rooms count as experiments next to the experiment collections. */
export function ledgerCounts(entries: LedgerEntry[]) {
  const experiments = entries.filter((e) => e.kind === 'room' || e.c.section === 'experiments').length;
  return { collections: entries.length - experiments, experiments };
}
export const countLabel = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
export const experimentCollections = (all: CollectionOut[]) => all.filter((c) => c.section === 'experiments').sort(byFirstMintDesc);
export const firstYear = (c: CollectionOut) => c.firstMint?.slice(0, 4) ?? '—';
export function archiveSpan(all: CollectionOut[]): string {
  const years = all.flatMap((c) => [c.firstMint, c.lastMint]).filter((x): x is string => !!x).map((x) => x.slice(0, 4)).sort();
  return years.length ? `${years[0]}—${years.at(-1)}` : '—';
}
export const layoutOf = (c: CollectionOut): 'column' | 'grid' => (c.works <= 12 ? 'column' : 'grid');

/** A token with no copies in circulation (burned or never claimed) keeps its page but is hidden from grids and counts. */
export const inCirculation = (t: Pick<TokenOut, 'supply'>) => t.supply > 0;

export interface WorkNav { prev: string | null; next: string | null; n: number | null; total: number }
/** Position and neighbours for every token. Tokens in circulation are numbered among themselves; a token with
 *  no copies has no number and links to the nearest circulating neighbours on either side. */
export function workNav(tokens: Pick<TokenOut, 'id' | 'supply'>[]): WorkNav[] {
  const live = tokens.map((t, i) => (inCirculation(t) ? i : -1)).filter((i) => i >= 0);
  const total = live.length;
  return tokens.map((t, i) => {
    const before = live.filter((j) => j < i).at(-1);
    const after = live.find((j) => j > i);
    return { prev: before === undefined ? null : tokens[before].id, next: after === undefined ? null : tokens[after].id, n: inCirculation(t) ? live.indexOf(i) + 1 : null, total };
  });
}

/**
 * The price line of a collection's preview on the index (the artist, 2026-11-07): the lowest live listing among its
 * works ("listed from" when it holds several), else its latest sale labelled with the date, else nothing.
 */
export function previewPrice(c: Pick<CollectionOut, 'works'>, tokens: Pick<TokenOut, 'supply' | 'listing' | 'lastSale'>[]): { kind: 'listed' | 'sold'; priceWei: string; label: string } | null {
  const live = tokens.filter(inCirculation);
  const listed = live.filter((t) => t.listing).sort((a, b) => (BigInt(a.listing!.priceWei) < BigInt(b.listing!.priceWei) ? -1 : 1))[0];
  if (listed) return { kind: 'listed', priceWei: listed.listing!.priceWei, label: c.works > 1 ? 'listed from' : 'listed' };
  const sold = live.filter((t) => t.lastSale).sort((a, b) => b.lastSale!.at.localeCompare(a.lastSale!.at))[0];
  if (sold) return { kind: 'sold', priceWei: sold.lastSale!.priceWei, label: `last sale · ${formatDate(sold.lastSale!.at)}` };
  return null;
}
