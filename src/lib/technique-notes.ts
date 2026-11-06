import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { Technique } from '../../indexer/tags';

/** `contain` keeps a picture of words (a screenshot) whole inside its square; everything else fills the square. */
export interface NoteImage { src: string; alt: string; caption?: string; fit?: 'contain' }
/**
 * `lane`: the technique lane this method fed, shown behind it on the page; null stands apart (ai). The notes carry no
 * links and no years: the lanes above already name and date every collection (the artist, 2026-11-06).
 */
export interface Note { key: string; lane: Technique | null; label: string; text: string; images: NoteImage[]; excerpt?: 'facets-onchain' }

// `cols` stays in the signature so the notes can follow the catalog again without touching the page.
export function techniqueNotes(_cols: CollectionOut[]): Note[] {
  const img = (src: string, alt: string, caption?: string, fit?: 'contain'): NoteImage => ({ src, alt, ...(caption ? { caption } : {}), ...(fit ? { fit } : {}) });
  const t = (name: string) => `/techniques/${name}.webp`;

  return [
    {
      key: 'vector',
      lane: 'vector illustration',
      label: 'vector illustration',
      text: 'where it started. the early pieces are drawn point by point in vector, and all 673 gruffters traits were drawn by hand before any code mixed them.',
      images: [img(t('vector-1'), 'gruffters traits being drawn in illustrator'), img(t('vector-2'), 'more gruffters traits drawn in illustrator')],
    },
    {
      key: 'photoshop',
      lane: 'vector illustration',
      label: 'photoshop',
      text: 'almost every drawing passed through photoshop at the end. sometimes for a whole effect, sometimes only to lay grain over it.',
      images: [img(t('photoshop-a'), 'a detail of an early work at one pixel to one pixel, with the grain showing')],
    },
    {
      key: 'touchdesigner',
      lane: 'glitch art',
      label: 'touchdesigner',
      text: 'pulverulents was built in real time: camera feeds and vector forms pushed through touchdesigner networks, then shot and finished by hand.',
      images: [
        img(t('td-network'), 'a touchdesigner network over a camera feed'),
        img(t('td-shoot'), 'the night shoot for pulverulents'),
        img(t('td-xcopy'), 'a message from xcopy about pulverulents', 'a message from xcopy', 'contain'),
      ],
    },
    {
      key: 'mathematics',
      lane: 'generative art',
      label: 'mathematics',
      text: 'phigures are solved, not drawn: every wallet seeds a figure whose proportions follow the golden ratio and a jointed anatomy. facets does its trigonometry in solidity, in fixed point, inside the contract.',
      images: [img(t('math-phigures'), 'a phigures figure at large size')],
    },
    {
      key: 'pixel',
      lane: 'code art',
      label: 'pixel grid',
      text: 'facets lives on one 35 × 35 grid. same-colour cells merge row by row, which gives the tetris look and keeps the art small enough to live on-chain.',
      images: [img(t('pixel-grid'), 'facets #1 on its 35 by 35 grid')],
    },
    {
      key: 'three',
      lane: 'code art',
      label: 'three.js',
      text: "for moving 3d: a ps1 shader for ovvn's x, a 3d tool for facets holders, and the dive bar.",
      images: [img('/exp/dive-bar/stills/wide.webp', 'the dive bar room, seen wide')],
    },
    {
      key: 'onchain',
      lane: 'code art',
      label: 'on-chain',
      text: 'phigures, facets and ovvn are drawn by their own contracts. no server, no ipfs: the code that makes the image lives on ethereum.',
      images: [],
      excerpt: 'facets-onchain',
    },
    {
      key: 'ai',
      lane: null,
      label: 'ai',
      text: 'and all the way through, ai: checking the maths, writing code, running the numbers. a tool in the studio, never the hand that makes the image.',
      images: [],
    },
  ];
}
