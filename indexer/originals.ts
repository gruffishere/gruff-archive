import { IPFS_GATEWAYS, extractIpfsPath } from './media';

/** Public https url of a source as minted, or null when it has none (empty, data: URIs, unknown schemes). */
export function toPublicUrl(src: string | null): string | null {
  if (!src) return null;
  if (src.startsWith('https://') || src.startsWith('http://')) return src;
  if (src.startsWith('ipfs://')) {
    const path = extractIpfsPath(src);
    return path ? IPFS_GATEWAYS[0] + path : null;
  }
  if (src.startsWith('ar://')) return src.length > 5 ? `https://arweave.net/${src.slice(5)}` : null;
  return null;
}
