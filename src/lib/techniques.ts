import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';

/** Every collection, the experiments included: no work silently drops out of the page. */
const index = (cols: CollectionOut[]) => cols.filter((c) => c.section === 'index' || c.section === 'experiments');

export function techniqueYears(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>) {
  const order: string[] = [];
  const counts = new Map<string, Map<string, number>>();
  for (const c of index(cols)) {
    for (const tech of c.techniques) if (!order.includes(tech)) order.push(tech);
    for (const t of tokensBySlug[c.slug] ?? []) {
      if (t.supply <= 0 || !t.mint) continue;
      const y = t.mint.at.slice(0, 4);
      for (const tech of c.techniques) {
        const m = counts.get(tech) ?? new Map<string, number>();
        m.set(y, (m.get(y) ?? 0) + 1);
        counts.set(tech, m);
      }
    }
  }
  const years = [...new Set([...counts.values()].flatMap((m) => [...m.keys()]))].sort();
  return { years, rows: order.map((technique) => ({ technique, counts: years.map((y) => counts.get(technique)?.get(y) ?? 0) })) };
}

export function barPct(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(100, Math.max(2, Math.round((value / max) * 100)));
}

export function balance(cols: CollectionOut[]) {
  const idx = index(cols);
  return {
    oneOfOne: idx.filter((c) => c.standard === 'erc721' && !c.techniques.includes('generative')).reduce((s, c) => s + c.works, 0),
    editionPieces: idx.filter((c) => c.standard === 'erc1155').reduce((s, c) => s + c.pieces, 0),
  };
}

export function onChainShare(cols: CollectionOut[]): number {
  const idx = index(cols);
  const total = idx.reduce((s, c) => s + c.works, 0);
  return total ? idx.filter((c) => c.techniques.includes('on-chain')).reduce((s, c) => s + c.works, 0) / total : 0;
}
