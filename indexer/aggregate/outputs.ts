import type { CollectionState } from '../pipeline/collection';
import type { CollectionConfig } from '../types';
import { buildCollection, type CollectionOut } from './collections';
import { buildTokens, carryOverMedia, type TokenOut } from './tokens';

/** The per-collection outputs of one run: tokens (with media carried over) and the collection record. Config `excludeHolders` is applied to both. */
export function buildCollectionOutputs(i: {
  cfg: CollectionConfig;
  artist: string;
  year: number;
  st: Pick<CollectionState, 'metas' | 'balances' | 'mints' | 'events' | 'listings' | 'media' | 'ens' | 'floorWei' | 'osDescription' | 'placeholderIds' | 'placeholderFiles'> & { houseSales?: CollectionState['houseSales'] };
  prevTokens: TokenOut[] | undefined;
  staleSince: string | null;
  excludeHolders?: ReadonlySet<string>;
}): { tokens: TokenOut[]; collection: CollectionOut } {
  const { cfg, artist, year, st } = i;
  const tokens = carryOverMedia(
    buildTokens({ cfg, artist, year, metas: st.metas, balances: st.balances, mints: st.mints, events: st.events, listings: st.listings, media: st.media, ens: st.ens, houseSales: st.houseSales ?? [], excludeHolders: i.excludeHolders }),
    i.prevTokens ?? [],
    st.placeholderIds,
    st.placeholderFiles,
  );
  const collection = buildCollection({ cfg, artist, year, tokens, balances: st.balances, floorWei: st.floorWei, osDescription: st.osDescription, staleSince: i.staleSince, excludeHolders: i.excludeHolders });
  return { tokens, collection };
}
