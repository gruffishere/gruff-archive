export const TECHNIQUES = ['vector illustration', 'glitch art', 'generative art', 'code art'] as const;
export type Technique = (typeof TECHNIQUES)[number];
export const TOOLS = ['photoshop', 'touchdesigner', 'mathematics', 'pixel grid', 'three.js', 'on-chain'] as const;
export type Tool = (typeof TOOLS)[number];
export const isGenerative = (c: { techniques: readonly string[] }) => c.techniques.includes('generative art');
export const isOnChain = (c: { tools?: readonly string[] }) => (c.tools ?? []).includes('on-chain');
/** one-of-one: every token its own work; editions: copies of one work. erc1155 defaults to editions, erc721 to one-of-one;
 *  config `format` overrides it, e.g. an erc721 edition minted as numbered tokens (Last Selfie or?). */
export const FORMATS = ['one-of-one', 'editions'] as const;
export type Format = (typeof FORMATS)[number];
export const formatOf = (c: { standard: string; format?: string | null }): Format => (c.format === 'editions' || c.format === 'one-of-one' ? c.format : c.standard === 'erc1155' ? 'editions' : 'one-of-one');
export const isEditions = (c: { standard: string; format?: string | null }) => formatOf(c) === 'editions';
