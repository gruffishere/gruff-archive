import { describe, expect, it } from 'vitest';
import type { TokenOut } from '../../src/lib/data';
import { collectionPath, etherscanAddress, etherscanToken, openseaItem, originalLink, platformLink, workPath } from '../../src/lib/links';

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
  it('has no platform link for opensea (the work page has its own)', () => {
    expect(platformLink({ platform: 'opensea', platformUrl: null, contract: C }, '1')).toBeNull();
    expect(platformLink({ platform: 'opensea', platformUrl: 'https://opensea.io/collection/x', contract: C }, '1')).toBeNull();
  });
});

const tok = (o: Partial<TokenOut>) => ({ image: null, animation: null, originals: { image: null, animation: null }, ...o }) as unknown as TokenOut;
const img = { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null };

describe('originalLink', () => {
  it('links an arweave original', () => {
    expect(originalLink(tok({ image: img as never, originals: { image: 'https://arweave.net/abc', animation: null } }))).toEqual({ url: 'https://arweave.net/abc', where: 'arweave' });
  });
  it('links an ipfs gateway original', () => {
    expect(originalLink(tok({ image: img as never, originals: { image: 'https://gateway.pinata.cloud/ipfs/bafy/1.png', animation: null } }))?.where).toBe('ipfs');
  });
  it('labels any other https original by hostname', () => {
    expect(originalLink(tok({ image: img as never, originals: { image: 'https://www.example.com/a.png', animation: null } }))).toEqual({ url: 'https://www.example.com/a.png', where: 'example.com' });
  });
  it('uses the animation original for html and video works', () => {
    const t = tok({ image: img as never, animation: { kind: 'html', thumb: null, large: null, file: '/media/x.html' } as never, originals: { image: 'https://arweave.net/i', animation: 'https://arweave.net/a' } });
    expect(originalLink(t)?.url).toBe('https://arweave.net/a');
  });
  it('falls back to the stored file, on-chain, when the source was a data: uri', () => {
    expect(originalLink(tok({ image: { ...img, file: '/media/a.png' } as never }))).toEqual({ url: '/media/a.png', where: 'on-chain' });
    expect(originalLink(tok({ image: img as never }))).toEqual({ url: '/media/a-l.webp', where: 'on-chain' });
    expect(originalLink(tok({ image: { kind: 'svg', thumb: null, large: null, file: '/media/s.svg' } as never }))?.url).toBe('/media/s.svg');
    const html = tok({ image: img as never, animation: { kind: 'html', thumb: null, large: null, file: '/media/x.html' } as never });
    expect(originalLink(html)).toEqual({ url: '/media/x.html', where: 'on-chain' });
  });
  it('calls an OpenSea cdn original opensea', () => {
    expect(originalLink(tok({ image: img as never, originals: { image: 'https://i2c.seadn.io/ethereum/0x1/a.png?format=png&w=4000', animation: null } }))).toEqual({ url: 'https://i2c.seadn.io/ethereum/0x1/a.png?format=png&w=4000', where: 'opensea' });
    expect(originalLink(tok({ image: img as never, originals: { image: 'https://seadn.io/a.png', animation: null } }))?.where).toBe('opensea');
    expect(originalLink(tok({ image: img as never, originals: { image: 'https://notseadn.io/a.png', animation: null } }))?.where).toBe('notseadn.io');
  });
  it('is null without any media', () => {
    expect(originalLink(tok({}))).toBeNull();
  });
});
