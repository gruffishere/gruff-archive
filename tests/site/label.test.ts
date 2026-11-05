import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { editionText, fitInside, fitText, labelFilename, labelImage, labelLines, safeJson, sizedSvg, splitLine, svgIntrinsic } from '../../src/lib/label';

const c = { title: 'SILVER SURFER', standard: 'erc721', firstMint: '2023-03-27T10:00:00.000Z' } as CollectionOut;
const t = {
  id: '1', accession: 'GRF.23.SLV.001', name: "'Cosmic Power'", supply: 1,
  image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null },
  mint: { at: '2023-03-27T10:00:00.000Z', txHash: '0x', priceWei: '100000000000000000', primary: false },
  lastSale: { at: '2025-01-01T00:00:00.000Z', priceWei: '320000000000000000' },
  owners: [{ address: '0x00000000000000000000000000000000000000b2', ens: 'keeper.eth', quantity: 1 }],
} as unknown as TokenOut;

describe('print label', () => {
  it('lists the museum label lines', () => {
    expect(labelLines(t, c).map((l) => l.text)).toEqual([
      'GRF.23.SLV.001',
      "'Cosmic Power'",
      'gruff, 2023 · SILVER SURFER',
      '1/1 · erc-721',
      'keeper  keeper.eth',
      'mint  27.03.2023 · 0.1 Ξ',
      'last sale  01.01.2025 · 0.32 Ξ',
    ]);
  });
  it('uses a local image and a stable filename', () => {
    expect(labelImage(t)).toBe('/media/a-l.webp');
    expect(labelImage({ ...t, image: { kind: 'image', thumb: '/media/b-t.webp', large: '/media/b.gif', file: '/media/b.gif', animated: true } } as TokenOut)).toBe('/media/b-t.webp');
    expect(labelFilename(t)).toBe('gruff-GRF.23.SLV.001.png');
  });

  it('has no image for a token without media', () => {
    expect(labelImage({ ...t, image: null } as unknown as TokenOut)).toBeNull();
  });
  it('labels an erc1155 token with a primary free mint', () => {
    const lines = labelLines({ ...t, supply: 25, mint: { at: '2024-02-12T00:00:00.000Z', txHash: '0x', priceWei: '0', primary: true } } as unknown as TokenOut, { ...c, standard: 'erc1155' } as CollectionOut).map((l) => l.text);
    expect(lines).toContain('edition of 25 · erc-1155');
    expect(lines).toContain('primary  12.02.2024 · free');
  });
});

describe('collaborators', () => {
  const co = { ...t, collaborators: ['SuperVillian', 'DeltaSauce'] } as unknown as TokenOut;
  it('puts the names on the meta line, joined with a middle dot', () => {
    expect(labelLines(co, c)[2].text).toBe('gruff × SuperVillian · DeltaSauce, 2023 · SILVER SURFER');
    expect(labelLines({ ...t, collaborators: ['SuperVillian'] } as unknown as TokenOut, c)[2].text).toBe('gruff × SuperVillian, 2023 · SILVER SURFER');
  });
  it('is unchanged without collaborators', () => {
    expect(labelLines({ ...t, collaborators: [] } as unknown as TokenOut, c)[2].text).toBe('gruff, 2023 · SILVER SURFER');
  });
  it('keeps gruff lowercase and names as written when splitting', () => {
    expect(splitLine(labelLines(co, c)[2])).toEqual({ head: 'gruff × SuperVillian · DeltaSauce', value: ', 2023 · SILVER SURFER', keep: 'head' });
  });
});

describe('fitText', () => {
  const measure = (s: string) => s.length * 10;
  it('keeps text that fits and truncates with an ellipsis otherwise', () => {
    expect(fitText('abcdef', 60, measure)).toBe('abcdef');
    expect(fitText('abcdefgh', 60, measure)).toBe('abcde…');
    expect(fitText('abc', 5, measure)).toBe('…');
  });
});

describe('splitLine', () => {
  it('uppercases only the label of a row', () => {
    expect(splitLine({ text: 'keeper  0xfe9…97b', style: 'row' })).toEqual({ head: 'KEEPER  ', value: '0xfe9…97b', keep: 'value' });
  });
  it('keeps the artist name lowercase on the meta line', () => {
    expect(splitLine({ text: 'gruff, 2023 · SILVER SURFER', style: 'meta' })).toEqual({ head: 'gruff', value: ', 2023 · SILVER SURFER', keep: 'head' });
    expect(splitLine({ text: '1/1 · erc-721', style: 'meta' })).toEqual({ head: '1/1 · ERC-721', value: '', keep: 'head' });
  });
  it('uppercases the accession and leaves the title alone', () => {
    expect(splitLine({ text: 'grf.23.slv.001', style: 'accession' })).toEqual({ head: 'GRF.23.SLV.001', value: '', keep: 'head' });
    expect(splitLine({ text: "'Cosmic Power'", style: 'title' })).toEqual({ head: "'Cosmic Power'", value: '', keep: 'head' });
  });
});

describe('edition and keeper lines', () => {
  const e = { ...c, standard: 'erc1155' } as CollectionOut;
  const owners = [
    { address: '0x00000000000000000000000000000000000000b2', ens: 'big.eth', quantity: 9 },
    { address: '0x00000000000000000000000000000000000000b3', ens: null, quantity: 1 },
  ];
  it('states the keeper count, not one owner, for a held edition', () => {
    const lines = labelLines({ ...t, supply: 10, owners, holderCount: 2 } as unknown as TokenOut, e).map((l) => l.text);
    expect(lines).toContain('keepers  2');
    expect(lines.some((l) => l.startsWith('keeper  '))).toBe(false);
  });
  it('says keepers 0 for an edition with no keeper, wall label and print label alike', () => {
    expect(labelLines({ ...t, supply: 5, owners: [{ address: '0x00000000000000000000000000000000000000a1', ens: 'gruffdzn.eth', quantity: 5 }], holderCount: 0 } as unknown as TokenOut, e).map((l) => l.text)).toContain('keepers  0');
  });
  it('still names the owner of a single-holder edition and of a 721', () => {
    expect(labelLines({ ...t, supply: 3, owners: owners.slice(0, 1), holderCount: 1 } as unknown as TokenOut, e).map((l) => l.text)).toContain('keeper  big.eth');
    expect(labelLines(t, c).map((l) => l.text)).toContain('keeper  keeper.eth');
  });
  it('says none in circulation when an edition has no supply', () => {
    expect(editionText({ supply: 0 }, e)).toBe('none in circulation · erc-1155');
    expect(editionText({ supply: 25 }, e)).toBe('edition of 25 · erc-1155');
    expect(editionText({ supply: 1 }, c)).toBe('1/1 · erc-721');
    expect(editionText({ supply: 0 }, c)).toBe('none in circulation · erc-721');
    expect(labelLines({ ...t, supply: 0, owners: [], holderCount: 0 } as unknown as TokenOut, e).map((l) => l.text)).toContain('none in circulation · erc-1155');
  });
});

describe('safeJson', () => {
  it('cannot close an inline script tag', () => {
    const out = safeJson({ name: 'x</script><script>alert(1)</script>', ens: '<!--' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ name: 'x</script><script>alert(1)</script>', ens: '<!--' });
  });
  it('escapes a hostile token name in the label lines', () => {
    const out = safeJson({ lines: labelLines({ ...t, name: '</script><img src=x>' } as TokenOut, c) });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).lines[1].text).toBe('</script><img src=x>');
  });
});

describe('svg sizing for the print label', () => {
  const facet = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35"><rect width="35" height="35"/></svg>';
  it('reads the viewBox when there is no width or height', () => {
    expect(svgIntrinsic(facet)).toEqual({ w: 35, h: 35 });
    expect(svgIntrinsic('<svg width="200px" height="100" viewBox="0 0 1 1"></svg>')).toEqual({ w: 200, h: 100 });
    expect(svgIntrinsic('<svg width="100%" height="50%"></svg>')).toBeNull();
    expect(svgIntrinsic('not svg')).toBeNull();
  });
  it('rewrites the root tag to an explicit size and keeps inner attributes', () => {
    const out = sizedSvg(facet, 820, 820);
    expect(out).toContain('width="820" height="820"');
    expect(out).toContain('viewBox="0 0 35 35"');
    expect(out).toContain('<rect width="35" height="35"/>');
  });
  it('adds a viewBox when only width and height were given', () => {
    expect(sizedSvg('<svg width="10" height="20"></svg>', 50, 100)).toBe('<svg width="50" height="100" viewBox="0 0 10 20"></svg>');
  });
  it('fits into the box keeping the ratio', () => {
    expect(fitInside(35, 35, 936, 820)).toEqual({ w: 820, h: 820 });
    expect(fitInside(2, 1, 100, 100)).toEqual({ w: 100, h: 50 });
  });
});
