import { describe, expect, it } from 'vitest';
import { collectionPath, etherscanAddress, etherscanToken, openseaItem, platformLink, workPath } from '../../src/lib/links';

const C = '0x3be88adf4d68c32bad5707588c7d25e1af8644e0';

describe('links', () => {
  it('builds site paths', () => {
    expect(workPath('silver-surfer', '2')).toBe('/w/silver-surfer/2/');
    expect(collectionPath('facets')).toBe('/c/facets/');
  });
  it('builds explorer and market links', () => {
    expect(etherscanToken(C, '2')).toBe(`https://etherscan.io/nft/${C}/2`);
    expect(etherscanAddress(C)).toBe(`https://etherscan.io/address/${C}`);
    expect(openseaItem(C, '2')).toBe(`https://opensea.io/item/ethereum/${C}/2`);
  });
  it('builds platform links', () => {
    expect(platformLink({ platform: 'foundation', platformUrl: null, contract: C }, '3')).toEqual({ label: 'foundation', url: `https://foundation.app/mint/eth/${C}/3` });
    expect(platformLink({ platform: 'transient', platformUrl: null, contract: C }, '1')).toEqual({ label: 'transient', url: `https://www.transient.xyz/nfts/ethereum/${C}/1` });
    expect(platformLink({ platform: '6529', platformUrl: null, contract: C }, '366')).toEqual({ label: '6529', url: 'https://6529.io/the-memes/366' });
    expect(platformLink({ platform: 'manifold', platformUrl: null, contract: C }, '1')).toBeNull();
    expect(platformLink({ platform: 'manifold', platformUrl: 'https://example.com/x', contract: C }, '1')).toEqual({ label: 'example.com', url: 'https://example.com/x' });
    expect(platformLink({ platform: 'onchain', platformUrl: 'https://www.thefacets.art', contract: C }, '1')?.label).toBe('thefacets.art');
  });
});
