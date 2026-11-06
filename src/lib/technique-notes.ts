import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { Technique } from '../../indexer/tags';
import { collectionPath, workPath } from './links';
import { roomPath } from './rooms';

export interface NoteImage { src: string; alt: string; caption?: string }
export interface Note { key: string; label: string; text: string; images: NoteImage[]; excerpt?: 'facets-onchain'; links: { label: string; href: string }[] }

/** Four line styles that stay apart in ink alone: solid, dotted, dashed, dash-dot. */
export const LINE_DASH: Record<Technique, string> = {
  'vector illustration': '',
  'glitch art': '2 4',
  'generative art': '9 4',
  'code art': '14 4 2 4',
};

export function techniqueNotes(cols: CollectionOut[]): Note[] {
  const by = (slug: string) => cols.find((c) => c.slug === slug);
  const link = (slug: string) => {
    const c = by(slug);
    return c ? [{ label: c.title.toLowerCase(), href: collectionPath(c.slug) }] : [];
  };
  const links = (...slugs: string[]) => slugs.flatMap(link);
  const earliest = (pick: (c: CollectionOut) => boolean, skip: string[] = []) =>
    cols
      .filter((c) => pick(c) && c.firstMint && !skip.includes(c.slug))
      .sort((a, b) => a.firstMint!.localeCompare(b.firstMint!))
      .slice(0, 3)
      .map((c) => c.slug);
  const img = (src: string, alt: string, caption?: string): NoteImage => ({ src, alt, ...(caption ? { caption } : {}) });
  const t = (name: string) => `/techniques/${name}.webp`;

  return [
    {
      key: 'vector',
      label: 'vector illustration',
      text: 'where it started. the early pieces are drawn point by point in vector, and all 673 gruffters traits were drawn by hand before any code mixed them.',
      images: [img(t('vector-1'), 'gruffters traits being drawn in illustrator'), img(t('vector-2'), 'more gruffters traits drawn in illustrator')],
      links: links('gruffters', ...earliest((c) => c.techniques.includes('vector illustration'), ['gruffters'])),
    },
    {
      key: 'photoshop',
      label: 'photoshop',
      text: 'almost every drawing passed through photoshop at the end. sometimes for a whole effect, sometimes only to lay grain over it.',
      images: [img(t('photoshop-a'), 'a detail of an early work at one pixel to one pixel, with the grain showing')],
      links: links(...earliest((c) => (c.tools ?? []).includes('photoshop')), 'pulverulents'),
    },
    {
      key: 'touchdesigner',
      label: 'touchdesigner',
      text: 'pulverulents was built in real time: camera feeds and vector forms pushed through touchdesigner networks, then shot and finished by hand.',
      images: [
        img(t('td-network'), 'a touchdesigner network over a camera feed'),
        img(t('td-shoot'), 'the night shoot for pulverulents'),
        img(t('td-xcopy'), 'a message from xcopy about pulverulents', 'a message from xcopy'),
      ],
      links: links('pulverulents'),
    },
    {
      key: 'mathematics',
      label: 'mathematics',
      text: 'phigures are solved, not drawn: every wallet seeds a figure whose proportions follow the golden ratio and a jointed anatomy. facets does its trigonometry in solidity, in fixed point, inside the contract.',
      images: [img(t('math-phigures'), 'a phigures figure at large size')],
      links: links('phigures', 'facets'),
    },
    {
      key: 'pixel',
      label: 'pixel grid',
      text: 'facets lives on one 35 × 35 grid. same-colour cells merge row by row, which gives the tetris look and keeps the art small enough to live on-chain.',
      images: [img(t('pixel-grid'), 'facets #1 on its 35 by 35 grid')],
      links: links('facets'),
    },
    {
      key: 'three',
      label: 'three.js',
      text: "for moving 3d: a ps1 shader for ovvn's x, a 3d tool for facets holders, and the dive bar.",
      images: [img('/exp/dive-bar/stills/wide.webp', 'the dive bar room, seen wide')],
      links: [{ label: '6529 dive bar', href: roomPath('dive-bar') }],
    },
    {
      key: 'onchain',
      label: 'on-chain',
      text: 'phigures, facets and ovvn are drawn by their own contracts. no server, no ipfs: the code that makes the image lives on ethereum.',
      images: [],
      excerpt: 'facets-onchain',
      links: [...links('phigures', 'facets', 'ovvn'), { label: 'facets #1', href: workPath('facets', '1') }],
    },
    {
      key: 'ai',
      label: 'ai',
      text: 'and all the way through, ai: checking the maths, writing code, running the numbers. a tool in the studio, never the hand that makes the image.',
      images: [],
      links: [],
    },
  ];
}
