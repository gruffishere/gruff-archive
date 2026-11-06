// One-off: builds the technique-note images and the on-chain excerpt.
// Reads public/media + data (read only) and .superpowers/techniques-src (git-ignored).
// Writes only public/techniques/ and src/content/techniques/.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = '.superpowers/techniques-src';
const OUT = 'public/techniques';
const TXT = 'src/content/techniques';
mkdirSync(OUT, { recursive: true });
mkdirSync(TXT, { recursive: true });

const token = (col, id) => JSON.parse(readFileSync(`data/catalog/tokens/${col}.json`, 'utf8')).find((t) => String(t.id) === String(id));
const media = (p) => `public${p}`;
const Q = { quality: 86 };

async function save(name, pipeline, opts = Q) {
  const p = `${OUT}/${name}.webp`;
  const info = await pipeline.webp(opts).toFile(p);
  console.log(`${p}  ${info.width}x${info.height}  ${statSync(p).size} bytes`);
}
const fit1200 = (file) => sharp(file).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true });
const square = (file, top, size) => sharp(file).extract({ left: 0, top, width: size, height: size }).resize(900, 900);

// Gruffters Illustrator photos (offsets tuned by eye so the laptop screen is whole)
const CROPS = { 1: 260, 2: 80 };
await save('vector-1', square(`${SRC}/gruffters-illustrator-1.jpg`, CROPS[1], 611));
await save('vector-2', square(`${SRC}/gruffters-illustrator-2.jpg`, CROPS[2], 611));

await save('td-network', fit1200(`${SRC}/pulverulents-touchdesigner.jpg`));
await save('td-shoot', fit1200(`${SRC}/pulverulents-shoot.jpg`));
await save('td-xcopy', fit1200(`${SRC}/pulverulents-xcopy-dm.jpg`));

// FACETS #1: 35x35 pixel grid
const facets = token('facets', 1);
const svgText = readFileSync(media(facets.image.file), 'utf8');
const px = await sharp(Buffer.from(svgText), { density: 72 }).resize(35, 35, { kernel: 'nearest' }).png().toBuffer();
const lines = [];
for (let i = 1; i < 35; i++) {
  const v = i * 24 + 0.5;
  lines.push(`<line x1="${v}" y1="0" x2="${v}" y2="840"/><line x1="0" y1="${v}" x2="840" y2="${v}"/>`);
}
const grid = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="840" viewBox="0 0 840 840"><g stroke="#000" stroke-opacity=".35" stroke-width="1" fill="none">${lines.join('')}</g></svg>`;
await save(
  'pixel-grid',
  sharp(px).resize(840, 840, { kernel: 'nearest' }).composite([{ input: Buffer.from(grid), top: 0, left: 0 }]),
  { lossless: true },
);

// Photoshop grain: 640x640 native centre crops
async function centre(col, name) {
  const f = media(token(col, 1).image.large);
  const m = await sharp(f).metadata();
  const left = Math.max(0, Math.floor((m.width - 640) / 2));
  const top = Math.max(0, Math.floor((m.height - 640) / 2));
  await save(name, sharp(f).extract({ left, top, width: Math.min(640, m.width), height: Math.min(640, m.height) }));
}
await centre('essence', 'photoshop-a');
await centre('icons', 'photoshop-b');

// Phigures: no ready construction/skeleton image in wallet-portraits-demo, so the token image
await save('math-phigures', fit1200(media(token('phigures', 1).image.large)));

// On-chain excerpt: 8 lines
const open = svgText.match(/<svg[^>]*>/)[0];
const rect = svgText.match(/<rect[^>]*\/>/)[0];
const paths = [...svgText.matchAll(/<path fill="#[0-9a-f]{6}" d="([^"]*)"\/>/g)].slice(0, 6);
const cut = paths.map((m) => {
  const runs = m[1].match(/M[^z]*z/g).slice(0, 4).join('');
  return m[0].replace(/d="[^"]*"\/>$/, `d="${runs} …"/>`);
});
writeFileSync(`${TXT}/facets-onchain.txt`, [open, rect, ...cut].join('\n') + '\n');
console.log(`${TXT}/facets-onchain.txt`);
