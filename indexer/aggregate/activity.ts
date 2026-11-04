import { newestFirst } from '../merge-events';
import type { ArchiveEvent } from '../types';
import type { TokenOut } from './tokens';

export interface ActivityRow extends ArchiveEvent {
  slug: string;
  code: string;
  tokenName: string;
  accession: string;
  thumb: string | null;
  fromEns: string | null;
  toEns: string | null;
}

export function buildActivity(
  input: { slug: string; code: string; events: ArchiveEvent[]; tokens: TokenOut[]; ens: Map<string, string> }[],
  latestCount = 200,
): { latest: ActivityRow[]; months: Record<string, ActivityRow[]> } {
  const rows: ActivityRow[] = [];
  for (const c of input) {
    const byId = new Map(c.tokens.map((t) => [t.id, t]));
    for (const e of c.events) {
      const t = byId.get(e.tokenId);
      if (!t) continue;
      rows.push({
        ...e,
        slug: c.slug,
        code: c.code,
        tokenName: t.name,
        accession: t.accession,
        thumb: t.image?.thumb ?? null,
        fromEns: e.from ? (c.ens.get(e.from) ?? null) : null,
        toEns: e.to ? (c.ens.get(e.to) ?? null) : null,
      });
    }
  }
  rows.sort(newestFirst);
  const months: Record<string, ActivityRow[]> = {};
  for (const r of rows) (months[r.timestamp.slice(0, 7)] ??= []).push(r);
  return { latest: rows.slice(0, latestCount), months };
}
