import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';

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
    case 'opensea':
      return null; // the work page already links its own OpenSea item
    default:
      return c.platformUrl ? { label: hostLabel(c.platformUrl) ?? c.platform, url: c.platformUrl } : null;
  }
}

/** Where to open the artwork as minted: the public source when there is one, else the file the site stores (on-chain works). */
export function originalLink(t: TokenOut): { url: string; where: string } | null {
  const kinds = [t.animation?.kind, t.image?.kind];
  const anim = kinds.includes('html') || kinds.includes('video');
  const remote = anim ? t.originals?.animation : t.originals?.image;
  if (remote) {
    const host = hostLabel(remote);
    const where = host === 'arweave.net' ? 'arweave' : host && (host === 'seadn.io' || host.endsWith('.seadn.io')) ? 'opensea' : host && (/(^|.)(pinata.cloud|ipfs.io|filebase.io|dweb.link)$/.test(host) || new URL(remote).pathname.startsWith('/ipfs/')) ? 'ipfs' : (host ?? 'original');
    return { url: remote, where };
  }
  const local = anim ? (t.animation?.file ?? t.animation?.large ?? t.image?.file) : (t.image?.file ?? t.image?.large);
  return local ? { url: local, where: 'on-chain' } : null;
}
