import { describe, expect, it } from 'vitest';
import { loadConfig, parseConfig } from '../../indexer/config';

const yaml = `
artist: "0x4730497622bDFd6EAFe1F09Fa22B3A0ACA94a646"
collections:
  - code: SLV
    slug: silver-surfer
    title: SILVER SURFER
    contract: "0x3BE88ADF4D68C32BAD5707588C7D25E1AF8644E0"
    standard: erc721
    platform: manifold
    section: index
    techniques: [illustration]
`;

describe('parseConfig', () => {
  it('lowercases addresses', () => {
    const c = parseConfig(yaml);
    expect(c.artist).toBe('0x4730497622bdfd6eafe1f09fa22b3a0aca94a646');
    expect(c.collections[0].contract).toBe('0x3be88adf4d68c32bad5707588c7d25e1af8644e0');
  });

  it('rejects duplicate codes', () => {
    const duplicated = yaml + yaml.split('collections:\n')[1];
    expect(() => parseConfig(duplicated)).toThrow(/duplicate code:SLV/);
  });

  it('coerces numeric token ids to strings', () => {
    const c = parseConfig(yaml.replace('techniques: [illustration]', 'techniques: [illustration]\n    tokenIds: [366]'));
    expect(c.collections[0].tokenIds).toEqual(['366']);
  });

  it('rejects a bad code', () => {
    expect(() => parseConfig(yaml.replace('code: SLV', 'code: slv'))).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() =>
      parseConfig(yaml.replace('techniques: [illustration]', 'techniques: [illustration]\n    tokenId: [366]')),
    ).toThrow();
    expect(() => parseConfig(yaml + '\nowner: x\n')).toThrow();
  });
});

describe('loadConfig (real file)', () => {
  it('has 16 index collections and OVVN in experiments', () => {
    const c = loadConfig();
    expect(c.collections.filter((x) => x.section === 'index')).toHaveLength(16);
    expect(c.collections.find((x) => x.code === 'OVN')?.section).toBe('experiments');
    expect(c.collections.find((x) => x.code === '366')?.tokenIds).toEqual(['366']);
  });

  it('defaults metadata to blockscout and accepts chain', () => {
    const withMeta = (v: string) => yaml.replace('section: index', `section: index
    metadata: ${v}`);
    expect(parseConfig(yaml).collections[0].metadata).toBe('blockscout');
    expect(parseConfig(withMeta('chain')).collections[0].metadata).toBe('chain');
    expect(() => parseConfig(withMeta('nope'))).toThrow();
  });
});

describe('parseConfig extras (M3, M7)', () => {
  it('defaults excludeHolders to [] and lowercases entries', () => {
    expect(parseConfig(yaml).excludeHolders).toEqual([]);
    const c = parseConfig(yaml.replace('collections:', 'excludeHolders: ["0x0CB8F1F4531E1685694A4A3F71A6CB7CA455E067"]\ncollections:'));
    expect(c.excludeHolders).toEqual(['0x0cb8f1f4531e1685694a4a3f71a6cb7ca455e067']);
    expect(() => parseConfig(yaml.replace('collections:', 'excludeHolders: ["nope"]\ncollections:'))).toThrow();
  });

  it('accepts a positive integer accessionWidth only', () => {
    const w = (v: string) => yaml.replace('section: index', `section: index\n    accessionWidth: ${v}`);
    expect(parseConfig(w('4')).collections[0].accessionWidth).toBe(4);
    expect(() => parseConfig(w('0'))).toThrow();
    expect(() => parseConfig(w('2.5'))).toThrow();
  });
});
