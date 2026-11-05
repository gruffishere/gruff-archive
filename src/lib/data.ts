import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActivityRow } from '../../indexer/aggregate/activity';
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { KeeperOut } from '../../indexer/aggregate/keepers';
import type { TimelineMonth } from '../../indexer/aggregate/timeline';
import type { TokenOut } from '../../indexer/aggregate/tokens';

export type { ActivityRow, CollectionOut, KeeperOut, TimelineMonth, TokenOut };
export interface Meta {
  lastInventory: string;
  indexOrder: string[];
  ethUsd: number | null;
  sources: { blockscout: string; opensea: string };
  missingMedia: string[];
  partial: boolean;
}

export const catalogDir = () => process.env.CATALOG_DIR ?? 'data/catalog';
const cache = new Map<string, unknown>();
function cached<T>(key: string, load: () => T): T {
  const k = `${catalogDir()}::${key}`;
  if (!cache.has(k)) cache.set(k, load());
  return cache.get(k) as T;
}
const read = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(catalogDir(), ...parts), 'utf8')) as T;

export const collections = () => cached('collections', () => read<CollectionOut[]>('collections.json'));
export const collection = (slug: string) => collections().find((c) => c.slug === slug);
export const tokensOf = (slug: string) => cached(`tokens:${slug}`, () => read<TokenOut[]>('tokens', `${slug}.json`));
export const keepers = () => cached('keepers', () => read<KeeperOut[]>('keepers.json'));
export const timeline = () => cached('timeline', () => read<TimelineMonth[]>('timeline.json'));
export const meta = () => cached('meta', () => read<Meta>('meta.json'));
export const latestActivity = () => cached('activity:latest', () => read<ActivityRow[]>('activity', 'latest.json'));
export const activityMonths = () =>
  cached('activity:months', () =>
    readdirSync(join(catalogDir(), 'activity'))
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort()
      .reverse(),
  );
export const activityMonth = (month: string) => read<ActivityRow[]>('activity', `${month}.json`);

export const tokenIndex = () =>
  cached('tokenIndex', () => {
    const m = new Map<string, { name: string; thumb: string | null; accession: string }>();
    for (const c of collections())
      for (const t of tokensOf(c.slug)) m.set(`${c.slug}/${t.id}`, { name: t.name, thumb: t.image?.thumb ?? null, accession: t.accession });
    return m;
  });
