import { describe, expect, it } from 'vitest';
import { buildCollection } from '../../indexer/aggregate/collections';
import { loadConfig } from '../../indexer/config';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import type { CollectionConfig } from '../../indexer/types';

const cfg = (p: Partial<CollectionConfig> = {}): CollectionConfig => ({
  code: 'PUL', slug: 'pulverulents', title: 'Pulverulents', contract: '0x29457b2b50d3da1ca6c356f82212f65d283c09e6',
  standard: 'erc721', platform: 'transient', section: 'index', techniques: ['illustration'], metadata: 'blockscout', ...p,
} as CollectionConfig);
const token = (id: string, supply = 1) => ({ id, supply, mint: null, image: null } as unknown as TokenOut);
const build = (c: CollectionConfig, n: number) =>
  buildCollection({ cfg: c, artist: '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646', year: 2025, tokens: Array.from({ length: n }, (_, i) => token(String(i + 1))), balances: new Map(), floorWei: null, osDescription: null, staleSince: null });

describe('supply cap and minting', () => {
  it('is minting while fewer works than the cap exist', () => {
    const c = build(cfg({ supplyCap: 69 }), 17);
    expect(c.supplyCap).toBe(69);
    expect(c.minting).toBe(true);
  });
  it('stops minting at the cap', () => {
    expect(build(cfg({ supplyCap: 3 }), 3).minting).toBe(false);
  });
  it('stops minting when the mint closed early', () => {
    expect(build(cfg({ supplyCap: 69, mintClosed: true }), 17).minting).toBe(false);
  });
  it('has no cap and is not minting by default', () => {
    const c = build(cfg(), 17);
    expect(c.supplyCap).toBeNull();
    expect(c.minting).toBe(false);
  });
  it('the real config caps Pulverulents at 69', () => {
    const pul = loadConfig('config/collections.yaml').collections.find((x) => x.code === 'PUL');
    expect(pul?.supplyCap).toBe(69);
    expect(pul?.platform).toBe('transient');
  });
});
