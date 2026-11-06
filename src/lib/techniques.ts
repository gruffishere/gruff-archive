import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { TECHNIQUES, isGenerative, isOnChain, type Technique } from '../../indexer/tags';

/** Every collection, the experiments included: no work silently drops out of the page. */
const shown = (cols: CollectionOut[]) => cols.filter((c) => c.section === 'index' || c.section === 'experiments');
const dated = (tokens: TokenOut[] = []) => tokens.filter((t) => t.supply > 0 && !!t.mint?.at);

export const quarterOf = (iso: string) => `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

export function quarterSpan(from: string, to: string): string[] {
  const n = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(5)) - 1;
  const out: string[] = [];
  for (let i = n(from); i <= n(to); i++) out.push(`${Math.floor(i / 4)}Q${(i % 4) + 1}`);
  return out;
}

/** One collection on the techniques lanes: where it first appeared, and with which techniques. */
export interface LaneMark {
  code: string;
  slug: string;
  title: string;
  works: number;
  /** YYYY-MM of its first dated mint. */
  debut: string;
  techniques: Technique[];
}

/** Every shown collection with a dated mint, at its debut, oldest first (then by code). */
export function laneMarks(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>): LaneMark[] {
  return shown(cols)
    .flatMap((c) => {
      const first = dated(tokensBySlug[c.slug]).map((t) => t.mint!.at).sort()[0];
      if (!first) return [];
      const techniques = TECHNIQUES.filter((t) => c.techniques.includes(t));
      return [{ code: c.code, slug: c.slug, title: c.title, works: c.works, debut: first.slice(0, 7), techniques }];
    })
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.code.localeCompare(b.code));
}

/** The side of a mark's square in px: it grows with the works, slowly (1 work → 4, 10 → 7, 2,222 → 14). */
export const markSize = (works: number) => Math.round(4 + 3 * Math.log10(Math.max(1, works)));

export interface LaneLayout {
  /** 'YYYYQn' per quarter, or 'YYYY' per year, covering whole years from the first debut to the last. */
  columns: string[];
  lanes: { technique: Technique; rows: number; cells: Record<number, LaneMark[]> }[];
  /** Where each mark sits, keyed `${code}|${technique}`. */
  at: Record<string, { col: number; row: number }>;
  /** A collection with several techniques joins its marks lane to lane, in lane order. */
  links: { code: string; from: Technique; to: Technique }[];
}

export function laneLayout(marks: LaneMark[], unit: 'quarter' | 'year'): LaneLayout {
  if (!marks.length) return { columns: [], lanes: TECHNIQUES.map((technique) => ({ technique, rows: 0, cells: {} })), at: {}, links: [] };
  const y0 = Number(marks[0]!.debut.slice(0, 4));
  const y1 = Number(marks[marks.length - 1]!.debut.slice(0, 4));
  const columns =
    unit === 'quarter'
      ? quarterSpan(`${y0}Q1`, `${y1}Q4`)
      : Array.from({ length: y1 - y0 + 1 }, (_, i) => String(y0 + i));
  const colOf = (m: LaneMark) => (unit === 'quarter' ? columns.indexOf(quarterOf(m.debut)) : Number(m.debut.slice(0, 4)) - y0);
  const at: LaneLayout['at'] = {};
  const lanes = TECHNIQUES.map((technique) => {
    const cells: Record<number, LaneMark[]> = {};
    for (const m of marks) {
      if (!m.techniques.includes(technique)) continue;
      const col = colOf(m);
      const stack = (cells[col] ??= []);
      at[`${m.code}|${technique}`] = { col, row: stack.length };
      stack.push(m);
    }
    return { technique, rows: Math.max(0, ...Object.values(cells).map((s) => s.length)), cells };
  });
  const links = marks.flatMap((m) => m.techniques.slice(1).map((to, i) => ({ code: m.code, from: m.techniques[i]!, to })));
  return { columns, lanes, at, links };
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
