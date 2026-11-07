export type Address = string; // always lowercase, 0x-prefixed

export type Standard = 'erc721' | 'erc1155';
export type Platform = 'manifold' | 'foundation' | 'transient' | '6529' | 'opensea' | 'onchain' | 'custom';
export type Section = 'index' | 'experiments';

export interface CollectionConfig {
  code: string;
  slug: string;
  title: string;
  contract: Address;
  standard: Standard;
  platform: Platform;
  platformUrl?: string;
  section: Section;
  tokenIds?: string[];
  techniques: string[];
  tools?: string[];
  /** Overrides the standard's default: erc1155 = editions, erc721 = one-of-one. */
  format?: 'one-of-one' | 'editions';
  tokenTechniques?: Record<string, string[]>;
  wallText?: string;
  /** Token metadata source: Blockscout's cache (default) or the contract's own tokenURI. */
  metadata?: 'blockscout' | 'chain';
  /** Zero-padding width of token accession numbers; default max(3, digits of the highest id). */
  accessionWidth?: number;
  /** Per-token collaborator names that replace what is parsed from the description. */
  collaborators?: Record<string, string[]>;
  /** Planned total of a collection that is still being minted (e.g. 69); editions read 1/1/<supplyCap>. */
  supplyCap?: number;
  /** Set when a capped collection's mint closed before it sold out. */
  mintClosed?: boolean;
  /** Quiet links shown under the collection meta line and on each work label. */
  links?: { label: string; url: string }[];
}

export interface RawTransfer {
  contract: Address;
  tokenId: string;
  from: Address;
  to: Address;
  fromEns: string | null;
  toEns: string | null;
  value: string; // integer string, '1' for ERC-721
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: string; // ISO 8601, normalised with Date#toISOString
}

export type EventKind = 'mint' | 'transfer' | 'burn' | 'sale' | 'listed';

export interface ArchiveEvent {
  id: string;
  kind: EventKind;
  contract: Address;
  tokenId: string;
  quantity: number;
  from: Address | null;
  to: Address | null;
  priceWei: string | null;
  txHash: string | null;
  timestamp: string;
}

export interface TokenMeta {
  tokenId: string;
  name: string | null;
  description: string | null;
  image: string | null;
  animation: string | null;
}

export interface MintInfo {
  at: string;
  txHash: string;
  priceWei: string | null; // per unit; null when nothing was paid
  primary: boolean; // true when priceWei was filled from the artist's first sale
}

export interface Listing {
  tokenId: string;
  priceWei: string; // per unit
  maker: Address;
  at: string;
}
