// One-off: the default link-preview card (public/social-card.png, 1200×630) shown when the site is shared on X,
// Telegram, iMessage… The wordmark is the header's own: Castoro "gruff" with the header's ink filter, scaled; the
// tagline and address in DM Mono, as on the site. Run: node scripts/social-card.mjs <path to opentype.js module dir>
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const opentype = require(process.argv[2] ?? 'opentype.js');
const castoro = opentype.loadSync('node_modules/@fontsource/castoro/files/castoro-latin-400-normal.woff');
const mono = opentype.loadSync('node_modules/@fontsource/dm-mono/files/dm-mono-latin-300-normal.woff');
const mono4 = opentype.loadSync('node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff');

const W = 1200;
const H = 630;
const X = 96;
// the header sets the wordmark at 72px; here at 250px, so the ink is scaled by the same factor
const SIZE = 250;
const k = SIZE / 72;
const word = castoro.getPath('gruff', X, 330, SIZE).toPathData(2);
const tag = mono.getPath('— archive emotions before they fade', X + 6, 420, 30).toPathData(2);
const site = mono4.getPath('GRUFFARCHIVE.ART', X + 6, 548, 20, { letterSpacing: 0.04 }).toPathData(2);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <filter id="ink" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${(0.85 / k).toFixed(4)}" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${(2.6 * k).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="${(0.45 * k).toFixed(2)}" result="b"/>
    <feComponentTransfer in="b"><feFuncA type="table" tableValues="0 0 0.6 1 1"/></feComponentTransfer>
  </filter>
  <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#cfcfcf"/><stop offset="0.55" stop-color="#8a8a8a"/><stop offset="1" stop-color="#2a2a2a"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#000"/>
<g filter="url(#ink)"><path fill="#fff" d="${word}"/></g>
<path fill="url(#fade)" d="${tag}"/>
<path fill="#8a8a8a" d="${site}"/>
</svg>`;
writeFileSync('public/social-card.png', await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());
console.log('public/social-card.png written');
