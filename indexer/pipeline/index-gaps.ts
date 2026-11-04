import { parseTokenUriJson, readTokenUri, type RpcCall } from '../tokenuri';
import type { Address, CollectionConfig, TokenMeta } from '../types';

const MAX_GAP = 25;

const word = (n: bigint) => n.toString(16).padStart(64, '0');
const ownerOfCall = (id: string) => '0x6352211e' + word(BigInt(id));

/**
 * Blockscout can miss tokens entirely (FACETS #655 has no transfers there). For on-chain ERC-721 collections whose indexed ids
 * all lie within 1..totalSupply() but number fewer than it, read the missing ids' owner and tokenURI straight from the chain.
 */
export async function fillIndexGaps(
  cfg: CollectionConfig,
  ids: Set<string>,
  rpc: RpcCall,
  log: (msg: string) => void,
): Promise<{ owners: Map<string, Address>; metas: Map<string, TokenMeta> }> {
  const owners = new Map<string, Address>();
  const metas = new Map<string, TokenMeta>();
  if (cfg.metadata !== 'chain' || cfg.standard !== 'erc721' || ids.size === 0) return { owners, metas };

  let total: bigint;
  try {
    const r = await rpc('eth_call', [{ to: cfg.contract, data: '0x18160ddd' }, 'latest']);
    total = BigInt(r as string);
  } catch (err) {
    log(`  totalSupply failed (${(err as Error).message}), skipping index-gap check`);
    return { owners, metas };
  }
  const numeric = [...ids].map((id) => BigInt(id));
  if (total <= 0n || BigInt(ids.size) >= total || numeric.some((n) => n < 1n || n > total)) return { owners, metas };
  const gap = Number(total) - ids.size;
  if (gap > MAX_GAP) {
    log(`  warning: ${gap} ids missing from the index (totalSupply ${total}); too many to fill from the chain, skipping`);
    return { owners, metas };
  }

  const added: string[] = [];
  for (let n = 1n; n <= total; n++) {
    const id = n.toString();
    if (ids.has(id)) continue;
    try {
      const raw = await rpc('eth_call', [{ to: cfg.contract, data: ownerOfCall(id) }, 'latest']);
      const hex = String(raw).replace(/^0x/, '');
      if (hex.length < 40) continue;
      owners.set(id, '0x' + hex.slice(-40).toLowerCase());
      const meta = await readTokenUri(rpc, cfg.contract, id).then(parseTokenUriJson).catch(() => null);
      metas.set(id, { tokenId: id, name: meta?.name ?? null, description: meta?.description ?? null, image: meta?.image ?? null, animation: meta?.animation ?? null });
      added.push(id);
    } catch (err) {
      log(`  index gap #${id}: ownerOf failed (${(err as Error).message}), skipped`);
    }
  }
  if (added.length) log(`  warning: Blockscout is missing token(s) ${added.map((i) => '#' + i).join(', ')}; read owner and metadata from the chain`);
  return { owners, metas };
}
