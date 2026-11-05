import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';

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
  const generative = c.techniques.includes('generative');
  if (c.standard === 'erc1155') tags.push('editions');
  else if (!generative) tags.push('one-of-one');
  if (generative) tags.push('generative');
  if (c.techniques.includes('on-chain')) tags.push('on-chain');
  if (c.section === 'experiments') tags.push('experiments');
  return tags;
}

const byFirstMintDesc = (a: CollectionOut, b: CollectionOut) => (b.firstMint ?? '').localeCompare(a.firstMint ?? '');
export const indexCollections = (all: CollectionOut[]) => all.filter((c) => c.section === 'index').sort(byFirstMintDesc);
/** The index ledger: the collections plus the experiments, newest first. */
export const indexLedger = (all: CollectionOut[]) => all.filter((c) => c.section === 'index' || c.section === 'experiments').sort(byFirstMintDesc);
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
