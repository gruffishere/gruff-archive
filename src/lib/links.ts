import type { CollectionOut } from '../../indexer/aggregate/collections';

export const workPath = (slug: string, id: string) => `/w/${slug}/${id}/`;
export const collectionPath = (slug: string) => `/c/${slug}/`;
export const etherscanToken = (contract: string, id: string) => `https://etherscan.io/nft/${contract}/${id}`;
export const etherscanAddress = (address: string) => `https://etherscan.io/address/${address}`;
export const openseaItem = (contract: string, id: string) => `https://opensea.io/item/ethereum/${contract}/${id}`;

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

export function platformLink(c: Pick<CollectionOut, 'platform' | 'platformUrl' | 'contract'>, id: string): { label: string; url: string } | null {
  switch (c.platform) {
    case 'foundation':
      return { label: 'foundation', url: `https://foundation.app/mint/eth/${c.contract}/${id}` };
    case 'transient':
      return { label: 'transient', url: `https://www.transient.xyz/nfts/ethereum/${c.contract}/${id}` };
    case '6529':
      return { label: '6529', url: `https://6529.io/the-memes/${id}` };
    default:
      return c.platformUrl ? { label: hostLabel(c.platformUrl) ?? c.platform, url: c.platformUrl } : null;
  }
}
