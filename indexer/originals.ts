import { IPFS_GATEWAYS, extractIpfsPath } from './media';

/** Public https url of a source as minted, or null when it has none (empty, data: URIs, unknown schemes). */
export function toPublicUrl(src: string | null): string | null {
  const s = src?.trim().replace(/^([a-z][a-z0-9+.-]*):/i, (_, scheme: string) => `${scheme.toLowerCase()}:`);
  if (!s) return null;
  if (s.startsWith('https://') || s.startsWith('http://')) return s;
  if (s.startsWith('ipfs://')) {
    const path = extractIpfsPath(s);
    return path ? IPFS_GATEWAYS[0] + path : null;
  }
  if (s.startsWith('ar://')) return s.length > 5 ? `https://arweave.net/${s.slice(5)}` : null;
  return null;
}
