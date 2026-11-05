import { accession } from '../accession';
import { parseCollaborators } from '../collaborators';
import { DEAD, type Balances, ZERO } from '../ledger';
import type { StoredMedia } from '../media';
import { toPublicUrl } from '../originals';
import type { ArchiveEvent, CollectionConfig, Listing, MintInfo, TokenMeta } from '../types';
import { EXCLUDED_HOLDERS, isKeeperAddress } from './exclusions';

export interface TokenOut {
  id: string;
  accession: string;
  name: string;
  description: string | null;
  image: StoredMedia | null;
  animation: StoredMedia | null;
  /** Public urls of the sources as minted, independent of whether the download succeeded. */
  originals: { image: string | null; animation: string | null };
  collaborators: string[];
  mint: MintInfo | null;
  lastSale: { at: string; priceWei: string } | null;
  listing: Listing | null;
  supply: number;
  holderCount: number;
  owners: { address: string; ens: string | null; quantity: number; escrow?: true }[];
  recent: ArchiveEvent[];
}

export interface TokenInputs {
  cfg: CollectionConfig;
  artist: string;
  year: number;
  metas: Map<string, TokenMeta>;
  balances: Balances;
  mints: Map<string, MintInfo>;
  events: ArchiveEvent[]; // newest first
  listings: Map<string, Listing>;
  media: Map<string, { image: StoredMedia | null; animation: StoredMedia | null }>;
  ens: Map<string, string>;
  /** Config `excludeHolders`: never counted as holders (they still show as owners). */
  excludeHolders?: ReadonlySet<string>;
}

type Owner = TokenOut['owners'][number];

// Escrowed quantity belongs to whoever deposited it: the `from` of the newest transfer into the escrow.
const depositorOf = (evs: ArchiveEvent[], escrow: string) => evs.find((e) => e.to === escrow && e.from !== null)?.from ?? null;

// Holders with escrow holders replaced by their depositors. Sorted by quantity desc, then address asc.
function ownersOf(holders: [string, bigint][], evs: ArchiveEvent[], i: TokenInputs): Owner[] {
  const owners = new Map<string, Owner>();
  const credit = (address: string, quantity: number, escrow: boolean) => {
    let owner = owners.get(address);
    if (!owner) {
      owner = { address, ens: i.ens.get(address) ?? null, quantity: 0 };
      owners.set(address, owner);
    }
    owner.quantity += quantity;
    if (escrow) owner.escrow = true;
  };
  for (const [address, q] of holders) {
    if (!EXCLUDED_HOLDERS.has(address)) credit(address, Number(q), false);
    else if (address !== ZERO && address !== DEAD) {
      const depositor = depositorOf(evs, address);
      if (depositor) credit(depositor, Number(q), true);
    }
  }
  return [...owners.values()].sort((a, b) => b.quantity - a.quantity || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
}

const byNumericId = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

export function buildTokens(i: TokenInputs): TokenOut[] {
  const allowed = i.cfg.tokenIds ? new Set(i.cfg.tokenIds) : null;
  const ids = [...new Set([...i.metas.keys(), ...i.balances.keys(), ...i.mints.keys()])]
    .filter((id) => !allowed || allowed.has(id))
    .sort(byNumericId);
  const maxId = ids.at(-1) ?? '0';
  const single = i.cfg.tokenIds?.length === 1;

  const eventsByToken = new Map<string, ArchiveEvent[]>();
  for (const e of i.events) {
    const list = eventsByToken.get(e.tokenId) ?? [];
    list.push(e);
    eventsByToken.set(e.tokenId, list);
  }

  return ids.map((id) => {
    const meta = i.metas.get(id);
    const evs = eventsByToken.get(id) ?? [];
    const holders = [...(i.balances.get(id) ?? new Map<string, bigint>()).entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));

    const owners = ownersOf(holders, evs, i);

    let mint = i.mints.get(id) ?? null;
    if (mint && mint.priceWei === null) {
      const firstArtistSale = [...evs].reverse().find((e) => e.kind === 'sale' && e.from === i.artist && e.priceWei);
      if (firstArtistSale) mint = { ...mint, priceWei: firstArtistSale.priceWei, primary: true };
    }
    const lastSale = evs.find((e) => e.kind === 'sale' && e.priceWei);
    const media = i.media.get(id);

    return {
      id,
      accession: single ? accession(i.cfg.code, i.year) : accession(i.cfg.code, i.year, id, maxId, i.cfg.accessionWidth),
      name: meta?.name ?? `${i.cfg.title} #${id}`,
      description: meta?.description ?? null,
      image: media?.image ?? null,
      animation: media?.animation ?? null,
      originals: { image: toPublicUrl(meta?.image ?? null), animation: toPublicUrl(meta?.animation ?? null) },
      collaborators: i.cfg.collaborators?.[id] ?? parseCollaborators(meta?.description ?? null),
      mint,
      lastSale: lastSale ? { at: lastSale.timestamp, priceWei: lastSale.priceWei! } : null,
      listing: i.listings.get(id) ?? null,
      supply: holders.reduce((sum, [, q]) => sum + Number(q), 0),
      holderCount: owners.filter((o) => isKeeperAddress(o.address, i.artist, i.excludeHolders)).length,
      owners: owners.slice(0, 5),
      recent: evs.slice(0, 10),
    };
  });
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** True when any of the media's files is one of the placeholder's stored files. */
export const isPlaceholderMedia = (m: StoredMedia | null, files: ReadonlySet<string>): boolean =>
  !!m && [m.thumb, m.large, m.file].some((p) => !!p && files.has(baseName(p)));

/**
 * Restores media lost this run from the previous snapshot. For `skip` ids (placeholder-stripped tokens) only a
 * previous medium that is NOT the placeholder's stored file is restored; without `placeholderFiles` nothing is.
 */
export function carryOverMedia(next: TokenOut[], prev: TokenOut[], skip?: Set<string>, placeholderFiles?: ReadonlySet<string>): TokenOut[] {
  const old = new Map(prev.map((t) => [t.id, t]));
  return next.map((t) => {
    const p = old.get(t.id);
    if (!p) return t;
    if (skip?.has(t.id)) {
      if (!placeholderFiles) return t;
      const keep = (m: StoredMedia | null) => (isPlaceholderMedia(m, placeholderFiles) ? null : m);
      return { ...t, image: t.image ?? keep(p.image), animation: t.animation ?? keep(p.animation) };
    }
    return { ...t, image: t.image ?? p.image, animation: t.animation ?? p.animation };
  });
}
