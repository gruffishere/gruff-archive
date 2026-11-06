import { accession } from '../accession';
import type { Balances } from '../ledger';
import type { CollectionConfig, MintInfo } from '../types';
import { isKeeperAddress } from './exclusions';
import type { TokenOut } from './tokens';

export interface CollectionOut {
  code: string;
  slug: string;
  title: string;
  contract: string;
  standard: CollectionConfig['standard'];
  platform: CollectionConfig['platform'];
  platformUrl: string | null;
  links: { label: string; url: string }[];
  section: CollectionConfig['section'];
  techniques: string[];
  tools: string[];
  wallText: string | null;
  accession: string;
  firstMint: string | null;
  lastMint: string | null;
  works: number;
  /** Planned total for a collection still minting, else null. */
  supplyCap: number | null;
  /** True while a capped collection has minted fewer works than its cap and its mint is not closed. */
  minting: boolean;
  pieces: number;
  holders: number;
  floorWei: string | null;
  coverTokenId: string | null;
  staleSince: string | null;
}

export function collectionYear(mints: Map<string, MintInfo>): number {
  const first = [...mints.values()].map((m) => m.at).sort()[0];
  return first ? Number(first.slice(0, 4)) : new Date().getUTCFullYear();
}

export function buildCollection(i: {
  cfg: CollectionConfig;
  artist: string;
  year: number;
  tokens: TokenOut[];
  balances: Balances;
  floorWei: string | null;
  osDescription: string | null;
  staleSince: string | null;
  excludeHolders?: ReadonlySet<string>;
}): CollectionOut {
  const ids = new Set(i.tokens.map((t) => t.id));
  const holders = new Set<string>();
  for (const [tokenId, h] of i.balances) if (ids.has(tokenId)) for (const a of h.keys()) if (isKeeperAddress(a, i.artist, i.excludeHolders)) holders.add(a);
  const mintDates = i.tokens.map((t) => t.mint?.at).filter((x): x is string => !!x).sort();
  return {
    code: i.cfg.code,
    slug: i.cfg.slug,
    title: i.cfg.title,
    contract: i.cfg.contract,
    standard: i.cfg.standard,
    platform: i.cfg.platform,
    platformUrl: i.cfg.platformUrl ?? null,
    links: i.cfg.links ?? [],
    section: i.cfg.section,
    techniques: i.cfg.techniques,
    tools: i.cfg.tools ?? [],
    wallText: i.cfg.wallText ?? i.osDescription ?? null,
    accession: accession(i.cfg.code, i.year),
    firstMint: mintDates[0] ?? null,
    lastMint: mintDates.at(-1) ?? null,
    works: i.tokens.filter((t) => t.supply > 0).length,
    supplyCap: i.cfg.supplyCap ?? null,
    minting: !!i.cfg.supplyCap && !i.cfg.mintClosed && i.tokens.filter((t) => t.supply > 0).length < i.cfg.supplyCap,
    pieces: i.tokens.reduce((sum, t) => sum + t.supply, 0),
    holders: holders.size,
    floorWei: i.floorWei,
    coverTokenId: i.tokens.find((t) => t.image?.thumb)?.id ?? null,
    staleSince: i.staleSince,
  };
}
