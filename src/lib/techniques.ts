import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { TECHNIQUES, TOOLS, isGenerative, isOnChain, type Technique, type Tool } from '../../indexer/tags';
import type { Room } from './rooms';

/** Every collection, the experiments included: no work silently drops out of the page. */
const shown = (cols: CollectionOut[]) => cols.filter((c) => c.section === 'index' || c.section === 'experiments');
const dated = (tokens: TokenOut[] = []) => tokens.filter((t) => t.supply > 0 && !!t.mint?.at);
const roomDay = (r: Pick<Room, 'date' | 'since'>) => r.date ?? `${r.since}-01`;

export const quarterOf = (iso: string) => `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

export function quarterSpan(from: string, to: string): string[] {
  const n = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(5)) - 1;
  const out: string[] = [];
  for (let i = n(from); i <= n(to); i++) out.push(`${Math.floor(i / 4)}Q${(i % 4) + 1}`);
  return out;
}

export function timelineQuarters(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, rooms: Pick<Room, 'date' | 'since'>[]): string[] {
  const qs = [...shown(cols).flatMap((c) => dated(tokensBySlug[c.slug]).map((t) => quarterOf(t.mint!.at))), ...rooms.map((r) => quarterOf(roomDay(r)))].sort();
  return qs.length ? quarterSpan(qs[0]!, qs[qs.length - 1]!) : [];
}

/** Each collection is one vote: its dated tokens share a weight of 1 across the quarters they were minted in. */
export function techniqueShares(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, quarters: string[]): Record<Technique, (number | null)[]> {
  const at = new Map(quarters.map((q, i) => [q, i]));
  const total = quarters.map(() => 0);
  const per = Object.fromEntries(TECHNIQUES.map((t) => [t, quarters.map(() => 0)])) as Record<Technique, number[]>;
  for (const c of shown(cols)) {
    const ts = dated(tokensBySlug[c.slug]);
    for (const t of ts) {
      const i = at.get(quarterOf(t.mint!.at));
      if (i === undefined) continue;
      total[i]! += 1 / ts.length;
      for (const tech of c.techniques) if (tech in per) per[tech as Technique][i]! += 1 / ts.length;
    }
  }
  return Object.fromEntries(TECHNIQUES.map((t) => [t, per[t].map((w, i) => (total[i]! > 0 ? Math.round((100 * w) / total[i]!) : null))])) as Record<Technique, (number | null)[]>;
}

export function toolCells(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, rooms: Pick<Room, 'date' | 'since' | 'tools'>[], quarters: string[]): Record<Tool, boolean[]> {
  const at = new Map(quarters.map((q, i) => [q, i]));
  const cells = Object.fromEntries(TOOLS.map((t) => [t, quarters.map(() => false)])) as Record<Tool, boolean[]>;
  const mark = (tools: readonly string[] | undefined, q: string) => {
    const i = at.get(q);
    if (i !== undefined) for (const tool of tools ?? []) if (tool in cells) cells[tool as Tool][i] = true;
  };
  for (const c of shown(cols)) for (const t of dated(tokensBySlug[c.slug])) mark(c.tools, quarterOf(t.mint!.at));
  for (const r of rooms) mark(r.tools, quarterOf(roomDay(r)));
  return cells;
}

export function summary(cols: CollectionOut[]) {
  const idx = shown(cols);
  const works = idx.reduce((s, c) => s + c.works, 0);
  return {
    onChainPct: works ? Math.round((100 * idx.filter(isOnChain).reduce((s, c) => s + c.works, 0)) / works) : 0,
    oneOfOne: idx.filter((c) => c.standard === 'erc721' && !isGenerative(c)).reduce((s, c) => s + c.works, 0),
    editionPieces: idx.filter((c) => c.standard === 'erc1155').reduce((s, c) => s + c.pieces, 0),
  };
}
