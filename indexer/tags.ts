export const TECHNIQUES = ['vector illustration', 'glitch art', 'generative art', 'code art'] as const;
export type Technique = (typeof TECHNIQUES)[number];
export const TOOLS = ['photoshop', 'touchdesigner', 'mathematics', 'pixel grid', 'three.js', 'on-chain'] as const;
export type Tool = (typeof TOOLS)[number];
export const isGenerative = (c: { techniques: readonly string[] }) => c.techniques.includes('generative art');
export const isOnChain = (c: { tools?: readonly string[] }) => (c.tools ?? []).includes('on-chain');
