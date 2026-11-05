// One-off port of the STRUNG DECK renderer into site-owned files. Never modifies the source folder.
//   node scripts/port-strung-deck.cjs [path to the deck project]
// Writes public/exp/playing-cards/gen.js (core + deck + string26 packed as a worker, the way the project's own
// decks page packs them: page/decks/build.cjs), player.js (page/player.js, the canvas dance player) and cover.webp.
process.env.CARD_EXPORT = '1';
const fs = require('fs');
const path = require('path');
const DECK = process.argv[2] || 'C:/Users/gruff/OneDrive/Masaüstü/FULL BODY CLONEX/EVOLVED GRIFTERS/Ordinals/UPC/exp/deck';
const out = path.join(__dirname, '..', 'public', 'exp', 'playing-cards');
const lab = path.join(DECK, 'lab');
const S = require(path.join(lab, 'string26.cjs'));
fs.mkdirSync(out, { recursive: true });

let gen = '// STRUNG DECK generator (lab/core + lab/deck + lab/string26 from the deck project), packed as a worker.\n';
gen += 'var process = { env: { CARD_EXPORT: "1" } };\nvar __defs = {}, __mods = {};\n';
gen += 'function __req(name) { if (__mods[name]) return __mods[name].exports; var m = { exports: {} }; __mods[name] = m; __defs[name](m, m.exports, __req); return m.exports; }\n';
for (const m of ['core', 'deck', 'string26']) {
  gen += `__defs['./${m}.cjs'] = function (module, exports, require) {\n${fs.readFileSync(path.join(lab, m + '.cjs'), 'utf8')}\n};\n`;
}
gen += `self.onmessage = function (e) {
  var d = e.data;
  try { var o = __req('./string26.cjs').render(d.seed, d.opts || {}); self.postMessage({ id: d.id, machine: o.machine }); }
  catch (err) { self.postMessage({ id: d.id, error: String(err && err.message || err) }); }
};\n`;
fs.writeFileSync(path.join(out, 'gen.js'), gen);
fs.writeFileSync(path.join(out, 'player.js'), '// STRUNG DECK canvas player (page/player.js from the deck project): runMachine(canvas, machine, { width, play }).\n' + fs.readFileSync(path.join(DECK, 'page', 'player.js'), 'utf8'));
console.log('decks:', Object.keys(S.DECKS).join(' '));

// the cover: one real card from the generator, on the room's dark table
const sharp = require('sharp');
(async () => {
  const card = S.render(322440, { deck: 'marked', rank: 7, suit: 'hearts', eyes: true });
  const png = await sharp(Buffer.from(card.svg), { density: 96 }).resize({ height: 1000 }).png().toBuffer();
  const { width, height } = await sharp(png).metadata();
  await sharp({ create: { width: 1600, height: 1000, channels: 4, background: '#0a0a0a' } })
    .composite([{ input: png, left: Math.round((1600 - width) / 2), top: Math.round((1000 - height) / 2) }])
    .webp({ quality: 82 }).toFile(path.join(out, 'cover.webp'));
  console.log('cover.webp written');

  // the gallery: still sample cards from src/lib/sample-cards.json, drawn by the same generator
  const samples = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'sample-cards.json'), 'utf8'));
  fs.mkdirSync(path.join(out, 'cards'), { recursive: true });
  for (const c of samples) {
    const r = S.render(c.seed, { deck: c.deck, rank: c.rank, suit: c.suit, eyes: true });
    await sharp(Buffer.from(r.svg), { density: 96 }).resize({ height: 840 }).webp({ quality: 84 }).toFile(path.join(out, 'cards', c.deck + '-' + c.suit + '-' + c.rank + '.webp'));
  }
  console.log(samples.length + ' sample cards written');
})();
