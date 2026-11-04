import { DEAD, ZERO } from '../ledger';

export const EXCLUDED_HOLDERS = new Set<string>([
  ZERO,
  DEAD,
  '0xcda72070e455bb31c7690a170224ce43623d0b6f', // Foundation market escrow
]);

/** `extra` holds the config's `excludeHolders`; it only affects keeper/holder counts, not the owners shown on work pages. */
export const isKeeperAddress = (address: string, artist: string, extra?: ReadonlySet<string>) =>
  address !== artist && !EXCLUDED_HOLDERS.has(address) && !extra?.has(address);
