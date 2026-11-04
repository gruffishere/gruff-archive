import { describe, expect, it, vi } from 'vitest';
import { fillIndexGaps } from '../../indexer/pipeline/index-gaps';
import type { CollectionConfig } from '../../indexer/types';

const cfg = { slug: 'facets', contract: '0xabc', standard: 'erc721', metadata: 'chain' } as CollectionConfig;
const OWNER = '0x3b8d9fcbd0631f0d8f8c8f99cb9faf2387598fe5';
const word = (n: bigint | string) => (typeof n === 'bigint' ? n.toString(16) : n).padStart(64, '0');
const abiString = (s: string) => {
  const d = Buffer.from(s);
  const pad = Buffer.alloc((32 - (d.length % 32)) % 32);
  return '0x' + word(32n) + word(BigInt(d.length)) + Buffer.concat([d, pad]).toString('hex');
};
const uri = (id: string) => 'data:application/json,' + encodeURIComponent(JSON.stringify({ name: `n${id}`, image: `data:image/svg+xml;utf8,<svg id="${id}"/>` }));

function fakeRpc(total: bigint, missing: Record<string, 'revert'> = {}) {
  return vi.fn(async (_m: string, params: unknown[]) => {
    const data = (params[0] as { data: string }).data;
    const sel = data.slice(0, 10);
    if (sel === '0x18160ddd') return '0x' + word(total);
    const id = BigInt('0x' + data.slice(10)).toString();
    if (sel === '0x6352211e') {
      if (missing[id] === 'revert') throw new Error('rpc eth_call: execution reverted');
      return '0x' + word(OWNER.slice(2));
    }
    if (sel === '0xc87b56dd') return abiString(uri(id));
    throw new Error('unexpected ' + sel);
  });
}

describe('fillIndexGaps (M2)', () => {
  it('adds the token Blockscout never indexed with its on-chain owner and metadata', async () => {
    const rpc = fakeRpc(5n);
    const log = vi.fn();
    const r = await fillIndexGaps(cfg, new Set(['1', '2', '4', '5']), rpc, log);
    expect([...r.owners]).toEqual([['3', OWNER]]);
    expect(r.metas.get('3')).toMatchObject({ tokenId: '3', name: 'n3' });
    expect(log.mock.calls.flat().join(' ')).toMatch(/warning.*3/);
  });

  it('does nothing when there is no gap, or the ids are not a 1..totalSupply range', async () => {
    for (const ids of [['1', '2', '3'], ['5', '6'], ['1', '2', '9']]) {
      const rpc = fakeRpc(3n);
      const r = await fillIndexGaps(cfg, new Set(ids), rpc, () => {});
      expect(r.owners.size).toBe(0);
    }
  });

  it('skips non-chain and non-ERC-721 collections without calling the rpc', async () => {
    const rpc = fakeRpc(5n);
    await fillIndexGaps({ ...cfg, metadata: 'blockscout' }, new Set(['1']), rpc, () => {});
    await fillIndexGaps({ ...cfg, standard: 'erc1155' }, new Set(['1']), rpc, () => {});
    expect(rpc).not.toHaveBeenCalled();
  });

  it('skips ids whose ownerOf reverts (burned) and tolerates rpc failure', async () => {
    const r = await fillIndexGaps(cfg, new Set(['1', '3']), fakeRpc(3n, { '2': 'revert' }), () => {});
    expect(r.owners.size).toBe(0);
    const broken = vi.fn(async () => {
      throw new Error('boom');
    });
    const out = await fillIndexGaps(cfg, new Set(['1']), broken, () => {});
    expect(out.owners.size).toBe(0);
  });

  it('refuses to fill an implausibly large gap', async () => {
    const r = await fillIndexGaps(cfg, new Set(['1']), fakeRpc(500n), () => {});
    expect(r.owners.size).toBe(0);
  });
});
