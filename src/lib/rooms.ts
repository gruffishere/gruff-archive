import type { IndexFilter } from './collections';

export const ROOM_STATUSES = ['in voting', 'work in progress', 'live'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
/** embed: a third-party page in a click-to-load iframe; app: a page hosted on this site, opened full page; deal: drawn live here. */
export type RoomKind = 'embed' | 'app' | 'deal';

export interface Room {
  slug: string;
  title: string;
  year: number;
  /** YYYY-MM, when the room first existed; the index scrubber hides it before this month. */
  since: string;
  status: RoomStatus;
  /** The index platform column. */
  medium: string;
  text: string;
  links: { label: string; url: string }[];
  /** An image under public/exp/<slug>/. */
  cover: string;
  kind: RoomKind;
  /** embed: the iframe URL; app: the site path of the hosted page. */
  src?: string;
}

export const ROOMS: Room[] = [
  {
    slug: 'dive-bar',
    title: "maybe's dive bar",
    year: 2026,
    since: '2026-10',
    status: 'in voting',
    medium: '6529 memes',
    text: "A living 3D bar for maybe's wave in 6529 Brain, made as a Meme card. The TV channels, the patrons and the drinks come from live 6529 data. Submitted to The Memes; in voting.",
    links: [{ label: 'arweave', url: 'https://arweave.net/74ONRA98QkYQHCq7OyDjoDvTRYP7exdASAMFWjhZd5U' }],
    cover: '/exp/dive-bar/cover.webp',
    kind: 'embed',
    src: 'https://arweave.net/74ONRA98QkYQHCq7OyDjoDvTRYP7exdASAMFWjhZd5U',
  },
  {
    slug: 'strung-deck',
    title: 'STRUNG DECK',
    year: 2026,
    since: '2026-10',
    status: 'work in progress',
    medium: 'verse',
    text: 'Playing cards in string art: nails around the pips, thread woven inside them, bands strung between. Every card moves in one slow dance.',
    links: [],
    cover: '/exp/strung-deck/cover.webp',
    kind: 'deal',
  },
  {
    slug: 'i-love-pure-chaos',
    title: 'I LOVE PURE CHAOS',
    year: 2026,
    since: '2026-05',
    status: 'live',
    medium: 'web',
    text: 'A glitch art machine. Feed it an image; it mills the bits through eighteen operators and returns an animated GIF. Same seed, same image, same GIF.',
    links: [],
    cover: '/exp/i-love-pure-chaos/cover.webp',
    kind: 'app',
    src: '/exp/i-love-pure-chaos/app/',
  },
  {
    slug: 'the-sigils',
    title: 'The Sigils',
    year: 2026,
    since: '2026-04',
    status: 'live',
    medium: 'web',
    text: 'Turns a 6529 identity into a living orbital sigil: TDH, boosts, memes and more each add their own ring, bead or moon.',
    links: [{ label: 'open', url: 'https://gruffishere.github.io/the-sigils/' }],
    cover: '/exp/the-sigils/cover.webp',
    kind: 'embed',
    src: 'https://gruffishere.github.io/the-sigils/',
  },
];

export const roomPath = (slug: string) => `/experiments/${slug}/`;
/** Rooms are experiments and nothing else: not editions, not one-of-one, not generative, not on-chain. */
export const roomFilterTags = (): IndexFilter[] => ['all', 'experiments'];

export const EMBED_ALLOW = 'autoplay; fullscreen';
/** allow-same-origin is safe on these iframes only because their origin (arweave.net, github.io) is not ours: the
 *  framed page gets its own origin and can never read this site. Never give it to a frame on our own origin. */
export const THIRD_PARTY_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-downloads';
export function embedSandbox(src: string, pageOrigin: string): string {
  const own = new URL(src, pageOrigin).origin === pageOrigin;
  return own ? THIRD_PARTY_SANDBOX.replace(' allow-same-origin', '') : THIRD_PARTY_SANDBOX;
}
