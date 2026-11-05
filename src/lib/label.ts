import type { CollectionOut, TokenOut } from './data';
import { displayName, formatDate, formatEth, mintValue } from './format';

/** JSON for an inline `<script type="application/json">`: `<` is escaped so no string can close the tag. */
export const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** The edition line shared by the wall label and the print label. */
export function editionText(t: Pick<TokenOut, 'supply'>, c: Pick<CollectionOut, 'standard'> & { works?: number }): string {
  const std = c.standard === 'erc1155' ? 'erc-1155' : 'erc-721';
  if (t.supply <= 0) return `none in circulation · ${std}`;
  return c.standard === 'erc1155' ? `edition of ${t.supply} · ${std}` : `1/1${(c.works ?? 0) > 1 ? `/${c.works}` : ''} · ${std}`;
}

export interface LabelLine { text: string; style: 'accession' | 'title' | 'meta' | 'price' | 'row'; /** collaborator names on the meta line, drawn as written */ names?: string }

/** `gruff × A · B, 2023 · TITLE`: the artist, any collaborators, the year and the collection. */
function metaLine(t: TokenOut, year: string, title: string): LabelLine {
  const names = (t.collaborators ?? []).join(' · ');
  return names ? { text: `gruff × ${names}, ${year} · ${title}`, style: 'meta', names } : { text: `gruff, ${year} · ${title}`, style: 'meta' };
}

export function labelLines(t: TokenOut, c: CollectionOut): LabelLine[] {
  const year = (t.mint?.at ?? c.firstMint ?? '').slice(0, 4);
  const lines: LabelLine[] = [
    { text: t.accession, style: 'accession' },
    { text: t.name, style: 'title' },
    metaLine(t, year, c.title),
    { text: editionText(t, c), style: 'meta' },
  ];
  const owner = t.owners[0];
  // an edition has no single keeper: the first owner is only the largest holder
  if (c.standard === 'erc1155' && t.holderCount !== 1) lines.push({ text: `keepers  ${t.holderCount}`, style: 'row' });
  else if (owner) lines.push({ text: `keeper  ${displayName(owner.address, owner.ens)}`, style: 'row' });
  if (t.mint) lines.push({ text: `${t.mint.primary ? 'primary' : 'mint'}  ${formatDate(t.mint.at)} · ${mintValue(t.mint)}`, style: 'row' });
  if (t.lastSale) lines.push({ text: `last sale  ${formatDate(t.lastSale.at)} · ${formatEth(t.lastSale.priceWei)}`, style: 'row' });
  return lines;
}

export function labelImage(t: TokenOut): string | null {
  const img = t.image;
  if (!img) return null;
  if (img.animated) return img.thumb;
  if (img.kind === 'image' || img.kind === 'svg') return img.large ?? img.thumb;
  return img.thumb;
}

export const labelFilename = (t: TokenOut) => `gruff-${t.accession}.png`;

/** Truncate with an ellipsis so the text fits `maxWidth`, using the given measuring function. */
export function fitText(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const s = `${text.slice(0, n).trimEnd()}…`;
    if (measure(s) <= maxWidth) return s;
  }
  return '…';
}

export interface LineParts {
  head: string;
  value: string;
  /** which part must survive truncation: row values and the artist name are never cut first */
  keep: 'head' | 'value';
}

/** Splits a label line into its display parts with casing applied: labels are uppercased, values drawn as given, the artist's name stays lowercase. */
export function splitLine(line: LabelLine): LineParts {
  if (line.style === 'title') return { head: line.text, value: '', keep: 'head' };
  if (line.style === 'row') {
    const i = line.text.indexOf('  ');
    if (i >= 0) return { head: line.text.slice(0, i + 2).toUpperCase(), value: line.text.slice(i + 2), keep: 'value' };
  }
  if (line.style === 'meta' && line.names && line.text.startsWith('gruff × ')) {
    const head = `gruff × ${line.names}`;
    return { head, value: line.text.slice(head.length).toUpperCase(), keep: 'head' };
  }
  if (line.style === 'meta' && line.text.startsWith('gruff')) {
    return { head: 'gruff', value: line.text.slice(5).toUpperCase(), keep: 'head' };
  }
  return { head: line.text.toUpperCase(), value: '', keep: 'head' };
}

const rootTag = (svg: string) => /<svg\b[^>]*>/i.exec(svg)?.[0] ?? null;
const attr = (tag: string, name: string) => new RegExp(String.raw`\s${name}\s*=\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? null;
const px = (v: string | null) => (v && /^\s*[\d.]+(px)?\s*$/.test(v) ? parseFloat(v) : null);

/** Intrinsic size of an SVG document: width and height attributes, else its viewBox, else null. */
export function svgIntrinsic(svg: string): { w: number; h: number } | null {
  const tag = rootTag(svg);
  if (!tag) return null;
  const w = px(attr(tag, 'width'));
  const h = px(attr(tag, 'height'));
  if (w && h) return { w, h };
  const vb = attr(tag, 'viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0 && vb.every(Number.isFinite)) return { w: vb[2], h: vb[3] };
  return null;
}

/** Rewrites the root tag so the SVG renders at exactly w×h, keeping its own coordinate system as the viewBox. */
export function sizedSvg(svg: string, w: number, h: number): string {
  const tag = rootTag(svg);
  if (!tag) return svg;
  const own = svgIntrinsic(svg);
  let next = tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '');
  if (!attr(tag, 'viewBox') && own) next = next.replace(/<svg\b/i, `<svg viewBox="0 0 ${own.w} ${own.h}"`);
  next = next.replace(/<svg\b/i, `<svg width="${Math.round(w)}" height="${Math.round(h)}"`);
  return svg.replace(tag, () => next);
}

/** Largest w×h with the given ratio that fits inside maxW×maxH. */
export function fitInside(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(maxW / w, maxH / h);
  return { w: w * s, h: h * s };
}
