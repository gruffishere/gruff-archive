// STRUNG DECK generator (lab/core + lab/deck + lab/string26 from the deck project), packed as a worker.
var process = { env: { CARD_EXPORT: "1" } };
var __defs = {}, __mods = {};
function __req(name) { if (__mods[name]) return __mods[name].exports; var m = { exports: {} }; __mods[name] = m; __defs[name](m, m.exports, __req); return m.exports; }
__defs['./core.cjs'] = function (module, exports, require) {
// Shared pieces for the three material tests (flow, string, engraving).
// Card space: 1000 x 1400 (5:7), y down.

const W = 1000, H = 1400, CORNER = 48;

// ---------- seeded random ----------
function rng(seed) {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const r = () => next();
  r.range = (lo, hi) => lo + (hi - lo) * next();
  r.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(next() * arr.length)];
  r.weighted = (pairs) => {
    let s = 0; for (const p of pairs) s += p[1];
    let x = next() * s;
    for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  return r;
}

// ---------- Perlin noise ----------
function perlin(r) {
  const p = new Uint8Array(512);
  const base = r.shuffle([...Array(256).keys()]);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const l1 = grad(aa, x, y) + u * (grad(ba, x - 1, y) - grad(aa, x, y));
    const l2 = grad(ab, x, y - 1) + u * (grad(bb, x - 1, y - 1) - grad(ab, x, y - 1));
    return l1 + v * (l2 - l1); // about -1..1
  };
}

// ---------- the heart pip ----------
// Card-style heart drawn in a 100 x 92 box, sampled into a polygon, centred on its bbox,
// scaled to unit width.
function cubic(p0, p1, p2, p3, n, out) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}
const HEART_UNIT = (() => {
  const pts = [[50, 92]];
  const segs = [
    [[50, 92], [38, 78], [0, 58], [0, 30]],
    [[0, 30], [0, 10], [14, 0], [27, 0]],
    [[27, 0], [39, 0], [47, 8], [50, 17]],
    [[50, 17], [53, 8], [61, 0], [73, 0]],
    [[73, 0], [86, 0], [100, 10], [100, 30]],
    [[100, 30], [100, 58], [62, 78], [50, 92]],
  ];
  for (const s of segs) cubic(s[0], s[1], s[2], s[3], 40, pts);
  pts.pop(); // last equals first
  return pts.map(([x, y]) => [(x - 50) / 100, (y - 46) / 100]); // width 1, height 0.92
})();

function placeShape(unit, cx, cy, size, flip) {
  return unit.map(([x, y]) => flip ? [cx - x * size, cy - y * size] : [cx + x * size, cy + y * size]);
}

// Standard pip positions (card space). Bottom-half pips are turned 180, as on a real card.
function pipLayout(rank) {
  const L = 320, C = 500, R = 680, T = 300, M = 700, B = 1100;
  const map = {
    7: [[L, T], [R, T], [C, 500], [L, M], [R, M], [L, B], [R, B]],
  };
  return map[rank].map(([x, y]) => ({ x, y, flip: y > M, size: 150 }));
}

// Free layout: `rank` hearts of mixed sizes (one large), placed by seeded rejection sampling inside
// the field, clear of the index corners and of each other. All upright.
function freeLayout(r, rank) {
  for (;;) { // retry until all `rank` hearts fit: a missing heart would change the card
    const placed = tryFreeLayout(r, rank);
    if (placed.length === rank) return placed;
  }
}
function tryFreeLayout(r, rank) {
  const sizes = [r.range(250, 300)];
  for (let i = 1; i < rank; i++) sizes.push(r.range(95, 165));
  const placed = [];
  const clearIndex = (x, y, s) => !(x - s * 0.6 < 190 && y - s * 0.6 < 310) && !(x + s * 0.6 > W - 190 && y + s * 0.6 > H - 310);
  for (const s of sizes) {
    for (let t = 0; t < 4000; t++) {
      const x = r.range(110 + s / 2, W - 110 - s / 2), y = r.range(130 + s / 2, H - 130 - s / 2);
      if (!clearIndex(x, y, s)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.size + s) * 0.5 + 46)) continue;
      placed.push({ x, y, size: s, flip: false }); // upright: a turned heart reads as a spade when the layout is free
      break;
    }
  }
  return placed;
}

// ---------- geometry ----------
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    let t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + t * dx - x, ey = ay + t * dy - y;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Signed distance field on a grid (negative inside a shape). Shapes are polygons.
// Cells farther than `reach` from every shape hold `reach`.
function sdfGrid(polys, res, reach) {
  const gw = Math.ceil(W / res) + 1, gh = Math.ceil(H / res) + 1;
  const g = new Float32Array(gw * gh).fill(reach);
  for (const poly of polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const i0 = Math.max(0, Math.floor((x0 - reach) / res)), i1 = Math.min(gw - 1, Math.ceil((x1 + reach) / res));
    const j0 = Math.max(0, Math.floor((y0 - reach) / res)), j1 = Math.min(gh - 1, Math.ceil((y1 + reach) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * res, y = j * res;
      let d = distToPoly(x, y, poly);
      if (pointInPoly(x, y, poly)) d = -d;
      const k = j * gw + i;
      if (d < g[k]) g[k] = d;
    }
  }
  const at = (x, y) => {
    const fx = Math.max(0, Math.min(gw - 1.001, x / res)), fy = Math.max(0, Math.min(gh - 1.001, y / res));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const k = j * gw + i;
    return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + gw] * (1 - u) + g[k + gw + 1] * u) * v;
  };
  const grad = (x, y) => {
    const e = res;
    const gx = at(x + e, y) - at(x - e, y), gy = at(x, y + e) - at(x, y - e);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  };
  return { at, grad };
}

function rectPoly(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }

// ---------- card furniture ----------
const f1 = (n) => Math.round(n * 10) / 10;
function polyPath(poly) {
  return 'M' + poly.map(([x, y]) => f1(x) + ' ' + f1(y)).join('L') + 'Z';
}

// Index boxes (rank + small suit) in the two corners; returned as obstacle polygons too.
const INDEX = { x0: 34, y0: 40, x1: 150, y1: 270 };
function indexBoxes() {
  return [
    rectPoly(INDEX.x0, INDEX.y0, INDEX.x1, INDEX.y1),
    rectPoly(W - INDEX.x1, H - INDEX.y1, W - INDEX.x0, H - INDEX.y0),
  ];
}
function indexSvg(rank, color) {
  const cx = (INDEX.x0 + INDEX.x1) / 2;
  const heart = polyPath(placeShape(HEART_UNIT, cx, 215, 58, false));
  const one = `<text x="${cx}" y="160" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="128" fill="${color}">${rank}</text><path d="${heart}" fill="${color}"/>`;
  return `<g>${one}</g><g transform="rotate(180 ${W / 2} ${H / 2})">${one}</g>`;
}

// CARD_EXPORT=1 drops the dark backdrop (cards for the gallery page, transparent corners)
function cardSvg(inner, { paper, rank, indexColor, backdrop = '#202020', pad = 60 }) {
  if (process.env.CARD_EXPORT) { backdrop = null; pad = 0; }
  const vw = W + pad * 2, vh = H + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${-pad} ${-pad} ${vw} ${vh}">
<defs><clipPath id="card"><rect width="${W}" height="${H}" rx="${CORNER}"/></clipPath></defs>
${backdrop ? `<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="${backdrop}"/>` : ''}
<rect width="${W}" height="${H}" rx="${CORNER}" fill="${paper}"/>
<g clip-path="url(#card)">${inner}</g>
${indexSvg(rank, indexColor)}
</svg>`;
}

module.exports = { W, H, rng, perlin, HEART_UNIT, placeShape, pipLayout, freeLayout, pointInPoly, distToPoly, sdfGrid, rectPoly, indexBoxes, polyPath, cardSvg, f1 };

};
__defs['./deck.cjs'] = function (module, exports, require) {
// The deck: four suit shapes, pip layouts for A..10, the corner index and the card frame with an
// optional board gradient. Suit shapes are polygons centred on their bounding box, scaled so the
// larger side is about 1 (a pip of `size` 130 is about 130 card units across).
const C = require('./core.cjs');

const SUITS = ['hearts', 'diamonds', 'spades', 'clubs'];
const RED = { hearts: true, diamonds: true, spades: false, clubs: false };
const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function cubic(p0, p1, p2, p3, n, out) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}
function normalise(pts, target = 1) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = target / Math.max(x1 - x0, y1 - y0);
  return pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
}
function fromCubics(segs, n = 30) {
  const pts = [segs[0][0]];
  for (const s of segs) cubic(s[0], s[1], s[2], s[3], n, pts);
  pts.pop();
  return pts;
}

// heart: the same drawing as core.HEART_UNIT (box 100 x 92)
const HEART = normalise(fromCubics([
  [[50, 92], [38, 78], [0, 58], [0, 30]], [[0, 30], [0, 10], [14, 0], [27, 0]], [[27, 0], [39, 0], [47, 8], [50, 17]],
  [[50, 17], [53, 8], [61, 0], [73, 0]], [[73, 0], [86, 0], [100, 10], [100, 30]], [[100, 30], [100, 58], [62, 78], [50, 92]],
]), 1);

// spade: the heart turned over, with a flared stem out of the notch (box 100 x 108)
const SPADE = normalise(fromCubics([
  [[50, 0], [62, 14], [100, 34], [100, 62]], [[100, 62], [100, 82], [86, 92], [73, 92]],
  [[73, 92], [63, 92], [56, 88], [53, 82]], [[53, 82], [54, 94], [60, 102], [67, 108]],
  [[67, 108], [56, 108], [44, 108], [33, 108]], [[33, 108], [40, 102], [46, 94], [47, 82]],
  [[47, 82], [44, 88], [37, 92], [27, 92]], [[27, 92], [14, 92], [0, 82], [0, 62]],
  [[0, 62], [0, 34], [38, 14], [50, 0]],
]), 1.04);

// diamond: a rhombus with sides bowed slightly inward (box 76 x 100)
const DIAMOND = (() => {
  const P = [[38, 0], [76, 50], [38, 100], [0, 50]], c = [38, 50], pts = [];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const q = [m[0] + (c[0] - m[0]) * 0.14, m[1] + (c[1] - m[1]) * 0.14];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * q[0] + t * t * b[0], u * u * a[1] + 2 * u * t * q[1] + t * t * b[1]]);
    }
  }
  return normalise(pts, 1.06);
})();

// The zero contour of an implicit shape (negative inside), traced with marching squares on a
// STEP grid over [X0, X0 + NX*STEP] x [Y0, Y0 + NY*STEP]; returns the first closed loop found.
function traceField(field, X0, Y0, NX, NY, STEP) {
  const v = [];
  for (let j = 0; j <= NY; j++) { const row = []; for (let i = 0; i <= NX; i++) row.push(field(X0 + i * STEP, Y0 + j * STEP)); v.push(row); }
  // edge points keyed by edge id so neighbouring cells share them; segments chained into one loop
  const pt = (i, j, horizontal) => {
    const a = v[j][i], b = horizontal ? v[j][i + 1] : v[j + 1][i], t = a / (a - b);
    return horizontal ? [X0 + (i + t) * STEP, Y0 + j * STEP] : [X0 + i * STEP, Y0 + (j + t) * STEP];
  };
  const key = (i, j, h) => i + ',' + j + (h ? 'h' : 'v');
  const next = new Map(), pos = new Map();
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = (v[j][i] < 0 ? 8 : 0) | (v[j][i + 1] < 0 ? 4 : 0) | (v[j + 1][i + 1] < 0 ? 2 : 0) | (v[j + 1][i] < 0 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = key(i, j, true), R = key(i + 1, j, false), Bm = key(i, j + 1, true), L = key(i, j, false);
    const P = { [T]: () => pt(i, j, true), [R]: () => pt(i + 1, j, false), [Bm]: () => pt(i, j + 1, true), [L]: () => pt(i, j, false) };
    // directed so the inside stays on one side; saddles keep their two inside corners apart
    const segs = { 1: [[L, Bm]], 2: [[Bm, R]], 3: [[L, R]], 4: [[R, T]], 5: [[R, T], [L, Bm]], 6: [[Bm, T]], 7: [[L, T]], 8: [[T, L]], 9: [[T, Bm]], 10: [[T, L], [Bm, R]], 11: [[T, R]], 12: [[R, L]], 13: [[R, Bm]], 14: [[Bm, L]] }[c] || [];
    for (const [a, b] of segs) { next.set(a, b); if (!pos.has(a)) pos.set(a, P[a]()); if (!pos.has(b)) pos.set(b, P[b]()); }
  }
  const start = next.keys().next().value;
  const loop = [];
  let k = start;
  do { loop.push(pos.get(k)); k = next.get(k); } while (k !== undefined && k !== start && loop.length < 100000);
  return loop;
}
const sdPoly = (poly) => (x, y) => { const s = C.distToPoly(x, y, poly); return C.pointInPoly(x, y, poly) ? -s : s; };
const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const union = (...fs) => (x, y) => Math.min(...fs.map((f) => f(x, y)));

// club: three circles, a filler and a flared stem
const CLUB = (() => {
  const stem = [[44, 64], [56, 64], [56, 80], [66, 100], [34, 100], [44, 80]];
  const field = union(sdCircle(50, 27, 23), sdCircle(24, 61, 23), sdCircle(76, 61, 23), sdCircle(50, 56, 15), sdPoly(stem));
  return normalise(traceField(field, -2, 0, 210, 210, 0.5).filter((_, i) => i % 2 === 0), 1.04);
})();

// ---------- court emblems (box about 100 wide; normalised to width 1) ----------
// K: a five-point crown on a band
const CROWN = normalise([[4, 88], [96, 88], [96, 12], [84.5, 44], [73, 6], [61.5, 40], [50, 0], [38.5, 40], [27, 6], [15.5, 44], [4, 12]], 1);
// Q: a tiara, three posts tipped with pearls
const TIARA = (() => {
  const body = [[8, 86], [92, 86], [92, 62], [80, 32], [66, 54], [50, 20], [34, 54], [20, 32], [8, 62]];
  const field = union(sdPoly(body), sdCircle(80, 26, 8), sdCircle(50, 12, 9), sdCircle(20, 26, 8));
  return normalise(traceField(field, -4, -4, 216, 200, 0.5).filter((_, i) => i % 2 === 0), 1);
})();
// J: a soft cap on a band with one plume leaning back
const CAP = (() => {
  const band = sdPoly([[4, 64], [96, 64], [96, 84], [4, 84]]);
  const dome = (x, y) => Math.max(Math.hypot((x - 50) / 40, (y - 64) / 36) - 1, y - 66);
  const plume = (x, y) => { // a leaf from (60, 50) to (104, 2), about 16 wide
    const ux = 44, uy = -48, L = Math.hypot(ux, uy), t = ((x - 60) * ux + (y - 50) * uy) / (L * L);
    // rounded at both ends (a pinched tip makes the traced contour fork)
    const tc = Math.max(0, Math.min(1, t)), px = 60 + ux * tc, py = 50 + uy * tc;
    return Math.hypot(x - px, y - py) - (2 + 6 * Math.sin(Math.PI * tc));
  };
  return normalise(traceField(union(band, dome, plume), 0, -6, 230, 200, 0.5).filter((_, i) => i % 2 === 0), 1);
})();
const EMBLEMS = { 11: CAP, 12: TIARA, 13: CROWN };

const UNITS = { hearts: HEART, diamonds: DIAMOND, spades: SPADE, clubs: CLUB };

// Standard pip positions for A..10 (card units). Bottom-half pips are turned 180, as on a real card.
function pipLayout(rank) {
  const L = 320, Cx = 500, R = 680, T = 300, M = 700, B = 1100, q1 = 567, q2 = 833;
  const map = {
    1: [[Cx, M]],
    2: [[Cx, T], [Cx, B]],
    3: [[Cx, T], [Cx, M], [Cx, B]],
    4: [[L, T], [R, T], [L, B], [R, B]],
    5: [[L, T], [R, T], [Cx, M], [L, B], [R, B]],
    6: [[L, T], [R, T], [L, M], [R, M], [L, B], [R, B]],
    7: [[L, T], [R, T], [Cx, 500], [L, M], [R, M], [L, B], [R, B]],
    8: [[L, T], [R, T], [Cx, 500], [L, M], [R, M], [Cx, 900], [L, B], [R, B]],
    9: [[L, T], [R, T], [L, q1], [R, q1], [Cx, M], [L, q2], [R, q2], [L, B], [R, B]],
    10: [[L, T], [R, T], [Cx, 433], [L, q1], [R, q1], [L, q2], [R, q2], [Cx, 967], [L, B], [R, B]],
  };
  const size = rank === 1 ? 320 : rank <= 3 ? 150 : rank <= 8 ? 132 : 118;
  return map[rank].map(([x, y]) => ({ x, y, size, flip: y > M }));
}

// ---------- card furniture ----------
const INDEX = { x0: 34, y0: 40, x1: 150, y1: 270 };
// color: one colour, or [top-left, bottom-right] when the two corners sit on different grounds
function indexSvg(rank, suit, color) {
  const cx = (INDEX.x0 + INDEX.x1) / 2;
  const label = RANK_LABEL[rank] || String(rank);
  const fs = label.length > 1 ? 104 : 128;
  const pip = C.polyPath(C.placeShape(UNITS[suit], cx, 215, 60, false));
  const [c0, c1] = Array.isArray(color) ? color : [color, color];
  const one = (c) => `<text x="${cx}" y="160" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs}" letter-spacing="${label.length > 1 ? -6 : 0}" fill="${c}">${label}</text><path d="${pip}" fill="${c}"/>`;
  return `<g>${one(c0)}</g><g transform="rotate(180 ${C.W / 2} ${C.H / 2})">${one(c1)}</g>`;
}

// board: a colour, or [top, bottom] for a vertical gradient. `defs` is extra <defs> content.
function cardSvg(inner, { board, rank, suit, indexColor, defs = '' }) {
  const exp = process.env.CARD_EXPORT, pad = exp ? 0 : 60;
  const vw = C.W + pad * 2, vh = C.H + pad * 2;
  let boardDef = '', boardFill = board;
  if (Array.isArray(board)) {
    boardDef = `<linearGradient id="board" x1="0" y1="0" x2="0" y2="1">${board.map((c, i) => `<stop offset="${i / (board.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    boardFill = 'url(#board)';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${-pad} ${-pad} ${vw} ${vh}">
<defs><clipPath id="card"><rect width="${C.W}" height="${C.H}" rx="48"/></clipPath>${boardDef}${defs}</defs>
${exp ? '' : `<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="#202020"/>`}
<rect width="${C.W}" height="${C.H}" rx="48" fill="${boardFill}"/>
<g clip-path="url(#card)">${inner}</g>
${indexSvg(rank, suit, indexColor)}
</svg>`;
}

module.exports = { SUITS, RED, UNITS, EMBLEMS, RANK_LABEL, pipLayout, indexSvg, cardSvg };

};
__defs['./string26.cjs'] = function (module, exports, require) {
// Material 2, system v25: STRING, round 26 (the 1/1 work, step 4: rare switches). On top of v24, each free or
// classic card may carry rare mutations of its own rule, drawn from its own stream, each on its own odds:
// - Bleed (3%): the largest pip grows 2 to 2.6 times and sits on an edge away from the index corners, cut by
//   the card; the other pips relax around it.
// - Phantom (2%, from 3 pips): the pips are not drawn at all, only the threads between them, which still trace their
//   rims (Ringers' Goose: the string wraps a peg that is no longer there).
// - Swarm (3%): the whole composition shrinks into a tight cluster of small pips in an empty card.
// - Argus (3%): every pip is an eye.
// - Crimson (2.5%): every thread between the pips is the red accent.
// - Monofilament (3%): every band is a single heavier thread.
// Swarm excludes Bleed, Phantom excludes Argus. Bloom and nest cards stay as they are. The rare trait is read
// off what was applied (none, or the names joined with +). A page filter can force one.
// v24 notes follow.
// Material 2, system v24: STRING, round 25 (the 1/1 work, step 2: rules instead of layout templates). On top of
// v23 the twelve named layouts are gone. Each card writes its own composition rule from its own stream: a family
// (free 6, bloom 1.6 from 3 pips, nest 1, classic 0.6; an ace is free or, 12%, classic) and, for the free family,
// a backbone curve from one continuous space (x = rho sin(2 pi fx t + px), y = rho cos(2 pi fy t + py), rho growing
// along t for a spiral; lines, arcs, rings, loops, waves and spirals are all points of it), how far the pips stray
// from it (0 on the curve .. 1 a free cloud), which stretch of it they take, its tilt, where the whole sits (it may
// lean off the middle), how big it is (a tight cluster .. the whole field) and how the sizes run (even, a taper
// along the curve, one giant, or wild); a mirror card writes the right half and reflects it. The pips are then
// relaxed apart and off the corners, shrinking only if they must. The layout traits are read off what came out:
// shape (solo, line, arc, ring, cloud), symmetry (mirror, rotational, concentric, none) and scale (even, taper,
// giant, wild by the measured size ratio). Ties, bands, weaves and everything after draw as in v23.
// v23 notes follow.
// Material 2, system v23: STRING, round 24 (gruff: "like Ringers, every piece nearly independent, a 1/1; the traits
// not decided by us but by the machine, the system writing its own rules"). On top of v22, ONE weave rule in
// place of the named weaves woven, star, lace and mandala: a thread from nail q to nail round(m * q + k). m = 1 is
// the old weaves (k sets which), m = 2 a heart in the heart (cardioid), 3 two lobes (nephroid), 4 and 5 three and
// four cusps; a fractional m bends into a swirl that never repeats. Each card writes its own rule from its own
// stream: a base m (20% classic m = 1, else 1.3..5.2), a reach k, and how m spreads over its pips (all alike, by
// size, or by distance from the middle); an ace strings 2 or 3 reaches. The weave trait is then read off the
// result (Woven, Star, Lace, Cardioid, Nephroid, Trefoil, Quatrefoil, Drift), not picked. Contour stays as it was.
// Every pip's threads are kept as pairs so the caustic dance starts from them. Other traits draw exactly as in v22.
// v22 notes follow.
// Material 2, system v22: STRING, round 23 (gruff: "in the caustic dance the diamonds, hearts, spades, clubs stand
// still; what if they turned too, in the same style? the 9 nested diamonds turning together, the same way, the
// other way, or one each way"). On top of v21, in motion 'caustic' every pip (and every nest ring) also turns
// 1 to 3 whole turns a loop about its centre (the largest 1, smaller ones more), its threads, band ends and pupil dot turning with its rim. Which way
// is the card's own (spin, from its own stream): 'same' (all one way), 'counter' (alternating, ring by ring in a
// nest), 'mixed' (each its own); mirror twins turn as mirror images. Frame 0 is still the still card.
// v21 notes follow.
// Material 2, system v21: STRING, round 22 (gruff: "I really like it; remove the styles it does not work on, and
// can the other threads, everything, join the same times table? everything in the picture under the same
// animation"). Nothing removed: the parts that did not dance now do. On top of v20, in motion 'caustic':
// - an eye pip dances too: each of its threads (nail i to its tangent point p) goes to m * i + (p - i)(1 - e),
//   so the pupil melts into the times table and forms again; its dot fades out and back. (v20 let it look
//   around instead.)
// - a contour pip (rings, no threads) fills: threads i -> m * i start at zero length and grow into the table.
// - every band joins: each end of a thread sits on its pip's rim; per band side the ends spread round the rim
//   from the middle of their arc by that pip's m (capped at 3), so the bands fan open round the pips with
//   the pips' own rhythm and gather again.
// - the nest dances: its rings become objects (outline and nails), the ring-to-ring threads are bands that
//   follow the rings' tables, the inner pip dances like any pip.
// v20 notes follow.
// Material 2, system v20: STRING, round 21 (gruff: "something crazier, more of an illusion, more artistic and
// smooth; the idea is yours, go"). On top of v19, motion 'caustic': the times tables of string art. Inside every
// woven pip each thread runs from nail i to the point m * i + k round the rim (k = the weave's own reach); at
// m = 1 that is exactly the still weave. As m eases up to 2..5 the reach k melts to 0, so at the peak the pip
// holds the pure times table: m = 2 a heart inside the heart, 3 two lobes, 4 and 5 three and four rings (the
// cardioid and nephroid family bent to the suit's rim); then it dissolves back into the weave. A first try that
// kept k scribbled (measured on an ace); the envelopes only come clean at k = 0. None of those curves
// is drawn: they are where the straight threads crowd. Thread ends glide along the rim between nails while m
// is not whole. Eye pips keep their pupil but look around: the gaze turns twice a loop at its own strength,
// the threads re-tangent to it every frame. The pips themselves stay still, the bands and beads run as in the
// machine. Mirror twins dance the same dance; the still card is unchanged.
// v19 notes follow.
// Material 2, system v19: STRING, round 20 (gruff: "an animation that is a pleasure to watch, a soft chaos,
// things passing through each other, smooth; maybe an illusion, like the figure you see turning left or right
// depending on your brain"; he asked for all three proposals). On top of v18, three more ways to play the same
// machine, each a plan in machine.<name> drawn from its own stream (render(seed, { machine: true, motion })):
// - coins: every pip turns about an axis lying in the card (near vertical, up to 34 degrees off) like a
//   spinning coin, seen with no depth cue (no shading, no perspective): only cos(angle) reaches the eye, so
//   the turn reads either way round and can flip while you watch (the spinning dancer). The bands, tied to
//   nails that swing through depth, twist into hourglass ribbons. 1, 2 or 3 turns a loop (the largest pip 1),
//   so they drift out of step and all face you again at the end of the loop.
// - unravel: every pip wanders a Lissajous path (whole frequencies 1..3, its own phases) and turns, scaled by
//   sin^2 so the card is whole at the start, a soft tangle of crossing bands halfway, whole again; 2 per loop.
// - breath: every pip turns a few degrees and swells a few percent on slow sines; the bands shear against the
//   dense weaves and against each other, and the overlaps ripple into moire. Almost nothing moves.
// Mirror twins move as mirror images; a pip on the mirror axis keeps to it. The still card is unchanged.
// v18 notes follow.
// Material 2, system v18: STRING, round 19 (gruff: "everything smooth, soft, relaxed; the threads move like a yoyo
// on a mathematical plane, still a loop"; he chose the real yoyo: out along the string while unwinding, back
// while winding up). On top of v17: render(seed, { machine: true, motion: 'yoyo' }) adds machine.yoyo, the
// same machine played another way. The largest pip is the hand and only sways. Every other pip hangs from
// the pip it is reached from over the ties (a tree from the hand) and slides out along that tie and back,
// carrying the pips that hang from it. Its turn follows its travel like a yoyo on its string: out = unwind,
// back = wind up, so the spin reverses at the far end; small pips turn more. Every motion is (1 - cos) / 2:
// at rest at the start of each cycle, slowest at both ends, fastest midway. Deeper pips lag mid-cycle and
// all meet at rest again, so the still card is frame 0. 4 cycles per 60 s loop. The still card is unchanged.
// v17 notes follow.
// Material 2, system v17: STRING, round 18 (gruff: "too many palettes, some are copies of each other; one
// theme per 52-card deck, few and focused: pearls on black, a whole fire-and-hell deck with sparks"). On top
// of v16: themes. render(seed, { theme }) picks the card's palette from the theme's family (its own rng
// stream) and gives the card the theme's ground. The composition never moves: the seed's own ground is
// still drawn into nothing so every later draw of the card stream stays where it was.
// - fire: ember, afterglow or blaze (a new rising fade, hot at the bottom, the board at the top), on a
//   ground of sparks rising from the pips: most stay near their pip, a few climb high, cooling from white
//   gold to deep red as they rise; some are short streaks with the tail below.
// - pearl: noir, phantom, echo, frost or nacre (a new iridescent white); every nail and the pupil's dot is a
//   pearl; the board stays bare black.
// - paper: paper, ghost, mist, whisper or inkbleed, on the draftsman's ground (construction lines and angle
//   arcs in faint graphite) wherever the card has ties to measure.
// - bone: bone, smoke, cream, kraft, rosewood or two-tone, on linen: the board is a woven cloth, fine warp
//   and weft at uneven pitch with a few slub threads.
// - silver: chrome or silver fade, on brushed steel (short horizontal hairlines). gold: gilded or gold fade,
//   with flakes of gold leaf scattered on the board.
// - eclipse: the board split light and dark along the diagonal, across or down (eclipse, eclipse2, eclipse3).
// - aurora: aurora or polar (a new green, blue, violet) under a sky of faint stars.
// In motion the beads are the theme's material where it has one (embers, pearls, gold, steel).
// render(seed, { theme: 'seed' }) draws the theme from the seed; with an explicit palette, the palette's own.
// v16 notes follow.
// Material 2, system v16: STRING, round 17 (gruff: study Ringers, take its logic not its look; "maybe
// circles and dots, so eyes and a gaze can appear"). On top of v15:
// - the eye weave: inside a pip every thread runs tangent to an invisible circle, the pupil, so that
//   circle stays empty (Ringers' string wraps circles; The Goose's string still wraps a peg that has
//   shrunk out of sight). One gaze per card, from its own rng stream: every pupil sits off its pip's
//   centre in the same direction, so pips side by side can read as a pair of eyes looking one way.
//   A nail in the pupil's centre is the dot. The eye goes only to the card's largest pip and its mirror
//   twin (one focal point, as Ringers has one yellow peg); eye.all puts it in every pip. Thread ends land
//   on a 4x finer pitch than the nails, so the pupil comes out round. Only reachable through
//   render(seed, { eyes: true }) for now: without it every seed renders exactly as in v15.
// v15 notes follow.
// Material 2, system v15: STRING, round 16 (gruff: "the moment it starts, the lines come off the parts;
// lines and parts move on their own, they must move together"). A thread cannot follow two turning
// nails in SVG animation, so the machine is now played by a script: render(seed, { machine: true })
// returns the static card plus a machine description (back layer, one sprite per turning object, every
// thread with the object each of its ends is tied to, the plan of turns). The player in the page
// redraws every thread between its two nails on every frame, so threads stay tied while the wheels
// turn, and the whole card still loops seamlessly every LOOP seconds.
// v14 notes follow (its SMIL machine is kept for reference: render(seed, { animate: true })).
// Material 2, system v14: STRING, round 15 (gruff: no ticking, "an endless loop, a motion that keeps
// going"). As v13, but the machine runs smoothly: every pip turns at a steady speed and the whole card
// is one seamless loop of LOOP seconds. Within one loop the motor makes 2 turns and every other pip a
// whole number of turns (its pulley ratio rounded to a half turn of the motor), so every part is back
// where it started at the same moment; bead travel per loop is rounded to whole bead spacings too.
// v13 notes follow (its tick is replaced by this).
// Material 2, system v13: STRING, round 14 (gruff: not separate effects; "everything moving like one
// machine running in one order, like a wheel; like Manuel Larino's Gift of Time"). On top of v11 (the
// round-13 motions of v12 are dropped):
// - the card is a belt drive. The largest pip is the motor; every band is a belt. A crossed band
//   (crossed, twist, lattice) is a crossed belt and turns the next pip the other way; an open band
//   (straight, fan, single) keeps the direction. Speeds follow the pulleys: w_child = w_parent *
//   r_parent / r_child, so small pips spin fast and every belt runs at one speed.
// - one clock: the machine ticks once a second, everything moves together on the tick and rests.
// - what moves: every pip turns as a rigid wheel (outline, weave and nails together; a weave turning
//   alone inside a still outline was tried and opened gaps), and beads run along every thread in the
//   direction its belt travels. Nest rings turn like the dials of a clock.
// render(seed, { animate: true }) adds the machine; without it the card is the static v11 card.
// v11 notes follow.
// Material 2, system v11: STRING, round 12 (gruff: drop night, navy, oxblood, gold, dawn, sorbet and
// gold leaf, "they look like filters"; ember and aurora on black; colour transitions are the best, try
// one end of the transition being the board colour so part of the piece fades away). On top of v10:
// - fade palettes: one end of the piece's colour (thread, pips, nails) is the board itself, so part
//   of the piece dissolves. Linear fades run in a seeded direction and start at a seeded point; radial
//   fades dissolve the centre (mist) or the edges (afterglow); band fades vanish along each band.
// - flat palettes draw nails without the white glint (a glint would stay visible where the piece fades).
// - the index on a fade palette is one solid colour, so the card always reads.
// v10 notes follow.
// Material 2, system v10: STRING, round 11 (gruff: "more things like the veil, more detail; dots,
// angles"). On top of v9:
// - the veil is a family: tone (faint fill), hatch (parallel lines at an angle), cross (two angles),
//   stipple (a dot screen), string (no fill: the loop itself, wound round small pins).
// - a ground layer under everything: pegs (a pegboard of the nails the piece did not use, as Ringers
//   leaves its unused pegs) or geometry (construction lines through the tied pips, with an arc
//   marking the angle between the lines at each pip).
// v9 notes follow.
// Material 2, system v9: STRING, round 10. On top of v8, two themes with their own symmetry:
// - bloom: the pips round a centre with true rotational symmetry (pips, nails, weaves and bands are
//   all turned copies of one), facing in, out or round like a pinwheel, tied as a ring, a star
//   polygon or both, and to a hub pip when there is one. Flowers, wheels, snowflakes, stars.
// - nest: the pips inside one another, a tunnel; each gap strung ring to ring with every nail, the
//   inner rings drifting and twisting. Eyes, vortices, shells.
// v8 notes follow.
// Material 2, system v8: STRING, round 9: variety (gruff: "like Ringers: circles and lines, yet some
// seeds turn into a figure, an animal, an object"). On top of v7:
// - new layouts: mirror (left-right symmetric, with symmetric strings and weaves: the strongest
//   trigger for faces, masks and creatures), giant (one huge pip, small ones around), spiral (golden
//   angle), grid (a lattice with holes), arc.
// - turn: pips rotated (mirrored pairs rotate as mirror images).
// - ties: loop (round the composition) and, on mirror cards, mirror (each pip to its twin).
// - band style single: a few threads only, like a constellation.
// - veil: a Ringers loop of tangent lines round the pips, filled with a faint tone, a silhouette.
// - court cards parked (gruff will redesign them): ranks come from the seed as 1..10 again.
// v7 notes follow.
// Material 2, system v7: STRING for the whole deck, A..K (round 8). On top of v6:
// - court cards (J, Q, K). A court card is the one card that reads the same either way up, so the
//   system strings one half, the rank's emblem (J cap, Q tiara, K crown) over the suit pip, and turns
//   that half 180 degrees for the other. Ties across the middle are strung so each is its own turned
//   copy. Court traits: pose (upright, offset, lean) and ties (spine, braid).
// - ranks come from the seed as 1..13.
// v6 notes follow.
// Material 2, system v6: STRING for the number deck, the craft pass (round 7). On top of v5:
// - a string never runs through a pip: a tie that would cross a third pip is routed to it instead.
// - thread reads as thread: each band is split into interleaved strands so crossings build density, and
//   a card strings its bands fine, regular or heavy (mixed cards vary per band).
// - red thread: a rare accent on the monochrome palettes, the card's longest band strung in red.
// - nails are small pins with a highlight.
// - paper, noir, bone and chrome (gruff's favourites) weighted up.
// v5 notes follow.
// Material 2, system v5: STRING for the number deck. Changes from v4 (gruff, round 6):
// - pips only: every string joins two pips. No corner ties, no edge ties.
// - few pips, more string per tie: a 2 ties its pips with 3 bands, a 3 with 2 bands per tie, each band
//   leaving at its own angle, so every rank carries a similar amount of thread.
// - the ace has nothing to tie to: its single pip is the whole piece, woven as a three-layer mandala.
// - stylised palettes, where the whole piece reads as one material or one light (gilded, gold leaf,
//   chrome, eclipse, bone, noir, paper); the colour palettes stay, at lower weights.
// Paint specs: a colour, or { type: 'linear', angle, stops } / { type: 'radial', r, stops } in card
// space; stops are colours (evenly spaced) or [offset, colour] pairs.
const C = require('./core.cjs');
const D = require('./deck.cjs');

const GOLD = ['#7a5418', '#e9c46a', '#a97a26', '#fbe7a6', '#b8892e', '#f2d58a', '#8a611d'];
const GOLD_LEAF = ['#b98a2e', '#f1d283', '#c99a3c', '#fff0b8', '#b07f28', '#e9c56e'];
const SILVER = ['#5b6169', '#eef2f6', '#868e98', '#ffffff', '#6d747e', '#cfd5dc'];
const DIAG = (Math.atan2(C.H, C.W) * 180) / Math.PI; // top-left to bottom-right corner

const PALETTES = {
  // stylised: the whole piece is one material or one light
  gilded: { w: 1.2, board: { type: 'radial', r: 1000, stops: ['#1a150c', '#070604'] }, thread: { type: 'linear', angle: 35, stops: GOLD }, ink: { type: 'linear', angle: 35, stops: GOLD }, nail: '#d9b25a', index: '#e2bd66', op: 0.85 },
  chrome: { w: 2.2, accent: '#e0303a', board: { type: 'radial', r: 1000, stops: ['#1b1d22', '#08090b'] }, thread: { type: 'linear', angle: 60, stops: SILVER }, ink: { type: 'linear', angle: 60, stops: SILVER }, nail: '#cfd5dc', index: '#e6eaef', op: 0.85 },
  eclipse: { w: 1.2, board: { type: 'linear', angle: DIAG, stops: ['#070707', '#f2eee6'] },
    thread: { type: 'linear', angle: DIAG, stops: [[0, '#f2eee6'], [0.47, '#f2eee6'], [0.53, '#0d0d0d'], [1, '#0d0d0d']] },
    ink: { type: 'linear', angle: DIAG, stops: [[0, '#f2eee6'], [0.47, '#f2eee6'], [0.53, '#0d0d0d'], [1, '#0d0d0d']] }, nail: 'thread', index: 'sample', op: 0.85 },
  bone: { w: 2.2, accent: '#a3141f', board: '#ebe5d6', thread: '#9d927b', ink: '#5f5545', nail: '#7d725f', index: '#5f5545', op: 0.75 },
  noir: { w: 2.4, accent: '#e0303a', board: '#050505', thread: '#f4f4f4', ink: '#f4f4f4', nail: '#9a9a9a', index: '#f4f4f4', op: 0.6 },
  paper: { w: 2.4, accent: '#c8102e', board: '#fbfaf6', thread: '#0b0b0b', ink: '#0b0b0b', nail: '#0b0b0b', index: '#0b0b0b', op: 0.72 },
  // fade: one end of the colour is the board, so part of the piece dissolves into it
  ghost: { w: 2.2, accent: '#c8102e', flat: true, board: '#fbfaf6', thread: { type: 'linear', angle: 'seed', fade: ['#0b0b0b', '#fbfaf6'] }, ink: 'thread', nail: 'thread', index: '#0b0b0b', op: 0.8 },
  phantom: { w: 2.2, accent: '#e0303a', flat: true, board: '#050505', thread: { type: 'linear', angle: 'seed', fade: ['#f4f4f4', '#050505'] }, ink: 'thread', nail: 'thread', index: '#f4f4f4', op: 0.72 },
  smoke: { w: 1.3, flat: true, board: '#ebe5d6', thread: { type: 'linear', angle: 'seed', fade: ['#3a3128', '#ebe5d6'] }, ink: 'thread', nail: 'thread', index: '#3a3128', op: 0.8 },
  inkbleed: { w: 1.4, flat: true, board: '#fbfaf6', thread: { type: 'linear', angle: 'seed', fade: ['#0b0b0b', '#0b0b0b', '#c8102e', '#fbfaf6'] }, ink: 'thread', nail: 'thread', index: '#0b0b0b', op: 0.8 },
  frost: { w: 1.2, flat: true, board: '#050505', thread: { type: 'linear', angle: 'seed', fade: ['#ffffff', '#9fdcff', '#050505'] }, ink: 'thread', nail: 'thread', index: '#dff4ff', op: 0.78 },
  silverfade: { w: 1.2, flat: true, board: { type: 'radial', r: 1000, stops: ['#1b1d22', '#08090b'] }, thread: { type: 'linear', angle: 'seed', fade: ['#eef2f6', '#868e98', '#ffffff', '#08090b'] }, ink: 'thread', nail: 'thread', index: '#e6eaef', op: 0.85 },
  goldfade: { w: 1.2, flat: true, board: '#070604', thread: { type: 'linear', angle: 'seed', fade: ['#fbe7a6', '#e9c46a', '#a97a26', '#070604'] }, ink: 'thread', nail: 'thread', index: '#e2bd66', op: 0.85 },
  mist: { w: 1.2, flat: true, board: '#fbfaf6', thread: { type: 'radial', at: 'hero', r: 760, stops: [[0, '#fbfaf6'], [0.38, '#0b0b0b'], [1, '#0b0b0b']] }, ink: 'thread', nail: 'thread', index: '#0b0b0b', op: 0.8 },
  afterglow: { w: 1.3, flat: true, board: '#050505', thread: { type: 'radial', at: 'hero', r: 820, stops: ['#ffe2a8', '#ff7a3d', '#7a1a10', '#050505'] }, ink: 'thread', nail: 'thread', index: '#ffb27a', op: 0.85 },
  whisper: { w: 1.3, flat: true, board: '#fbfaf6', thread: { type: 'band', stops: ['#0b0b0b', '#fbfaf6'] }, ink: '#0b0b0b', nail: '#0b0b0b', index: '#0b0b0b', op: 0.85 },
  echo: { w: 1.3, flat: true, board: '#050505', thread: { type: 'band', stops: ['#f4f4f4', '#050505'] }, ink: '#f4f4f4', nail: '#9a9a9a', index: '#f4f4f4', op: 0.8 },
  // colour: red and black suits keep their own ink
  cream: { w: 0.8, board: '#efe7d6', thread: '#1d1a18', op: 0.72, red: '#b3202b', black: '#1d1a18', nail: '#1d1a18' },
  kraft: { w: 0.6, board: '#d6bf98', thread: '#2a2119', op: 0.7, red: '#a51c26', black: '#231c16', nail: '#2a2119' },
  twotone: { w: 0.5, board: '#efe7d6', thread: { type: 'alt', stops: ['#1d1a18', '#b3202b'] }, op: 0.72, red: '#b3202b', black: '#1d1a18', nail: '#1d1a18' },
  rosewood: { w: 0.5, board: '#f4efe6', thread: { type: 'band', stops: ['#1b1b1d', '#d0465a'] }, op: 0.78, red: '#c0283a', black: '#1b1b1d', nail: '#1b1b1d' },
  ember: { w: 1, board: '#050505', thread: { type: 'radial', r: 900, at: 'hero', stops: ['#ffd27a', '#e4572e', '#6b1414'] }, op: 0.8, red: '#ff5a3c', black: '#f3e6cf', nail: '#c9a24a' },
  // themes only (weight 0: never drawn by the seed alone, so no existing card changes)
  blaze: { w: 0, flat: true, board: '#050505', thread: { type: 'linear', angle: 270, stops: [[0, '#fff1c1'], [0.18, '#ffc15e'], [0.42, '#f0642e'], [0.7, '#8a1c12'], [0.97, '#050505']] }, ink: 'thread', nail: 'thread', index: '#ffb27a', op: 0.85 },
  nacre: { w: 0, accent: '#e0303a', board: '#050505', thread: { type: 'linear', angle: 35, stops: ['#fdfbf7', '#f5e3ea', '#e2e9f7', '#f6eedd', '#fdfbf7'] }, ink: 'thread', nail: '#ece6dd', index: '#f4f1ec', op: 0.7 },
  eclipse2: { w: 0, board: { type: 'linear', angle: 90, stops: ['#070707', '#f2eee6'] }, thread: { type: 'linear', angle: 90, stops: [[0, '#f2eee6'], [0.47, '#f2eee6'], [0.53, '#0d0d0d'], [1, '#0d0d0d']] }, ink: { type: 'linear', angle: 90, stops: [[0, '#f2eee6'], [0.47, '#f2eee6'], [0.53, '#0d0d0d'], [1, '#0d0d0d']] }, nail: 'thread', index: 'sample', op: 0.85 },
  eclipse3: { w: 0, board: { type: 'linear', angle: 0, stops: ['#070707', '#f2eee6'] }, thread: { type: 'linear', angle: 0, stops: [[0, '#f2eee6'], [0.47, '#f2eee6'], [0.53, '#0d0d0d'], [1, '#0d0d0d']] }, ink: { type: 'linear', angle: 0, stops: [[0, '#f2eee6'], [0.47, '#f2eee6'], [0.53, '#0d0d0d'], [1, '#0d0d0d']] }, nail: 'thread', index: 'sample', op: 0.85 },
  polar: { w: 0, board: '#040608', thread: { type: 'linear', angle: 60, stops: ['#7ef9c6', '#3fb5ff', '#b07cff'] }, op: 0.75, red: '#ff7a8a', black: '#e8f4f1', nail: '#8fb8c9' },
  aurora: { w: 0.8, board: '#050506', thread: { type: 'linear', angle: 100, stops: ['#3ee0a1', '#8a6cff'] }, op: 0.72, red: '#ff6b7a', black: '#e8f1ee', nail: '#7fa69a' },
  // ---- v26: one palette per named deck, from the deck's own world ----
  // Dead Man's Hand: an 1876 saloon card. Bone paper, soot-black thread, the red suits in dried blood
  d_deadmans: { w: 0, board: '#e8dfcb', thread: '#1b1712', op: 0.72, red: '#7c1d16', black: '#1b1712', nail: '#3a322a' },
  // Faro: "bucking the tiger". Warm black, every band an amber stripe burning down to black
  d_faro: { w: 0, board: { type: 'radial', r: 1000, stops: ['#15100a', '#070503'] }, thread: { type: 'band', stops: ['#f0a33a', '#1a0f05'] }, ink: '#e9a447', nail: '#b9853a', index: '#e9a447', op: 0.85 },
  // The Nuts: the wagon-wheel nuts. Graphite, iron thread rusting along every band
  d_nuts: { w: 0, board: '#121211', thread: { type: 'band', stops: ['#b8b5ae', '#c25a26'] }, ink: '#cdc9c2', nail: '#6e6a64', index: '#cdc9c2', op: 0.8 },
  // One-Eyed Jacks: the court cards' printing. White card, bands in the jacks' blue, red and ochre, suits in red and black
  d_jacks: { w: 0, board: '#f6f3ec', thread: { type: 'alt', stops: ['#1f3f93', '#c8102e', '#d29a12'] }, op: 0.8, red: '#c8102e', black: '#151515', nail: '#151515' },
  // Marked Cards: a darkroom. Everything barely there, except the one mark, bright red
  d_marked: { w: 0, accent: '#ff2b2b', board: '#050505', thread: '#f4f4f4', ink: '#f4f4f4', nail: '#9a9a9a', index: '#f4f4f4', op: 0.6 },
  // Cold Deck: the honest-looking printed deck, cold. Blue-white card, blue-black thread, classic red and black
  d_cold: { w: 0, board: '#f4f6f8', thread: { type: 'linear', angle: 90, stops: ['#0f1720', '#2c4a66'] }, op: 0.75, red: '#c0182f', black: '#121a22', nail: '#121a22' },
  // Poker Face: stone. Pale grey on pale grey, nothing given away
  d_poker: { w: 0, board: '#e9e7e2', thread: '#8f8b84', ink: '#57534d', nail: '#7d7972', index: '#3f3c38', op: 0.85 },
  // Royal Flush: gold thread on black, the crown's own
  d_royal: { w: 0, board: { type: 'radial', r: 1000, stops: ['#16120a', '#060503'] }, thread: { type: 'linear', angle: 35, stops: GOLD }, ink: { type: 'linear', angle: 35, stops: GOLD }, nail: '#d9b25a', index: '#e2bd66', op: 0.85 },
  // Solitaire: the card table's felt. Ivory card, felt-green thread, the cards' own red and black
  d_solitaire: { w: 0, board: '#f1ead9', thread: '#1f5e3a', op: 0.8, red: '#b3202b', black: '#1b1b1b', nail: '#1f5e3a' },
  // Crazy Eights: the loud one. Black, neon running pink to violet to blue across the card
  d_crazy: { w: 0, board: '#07060a', thread: { type: 'linear', angle: 60, stops: ['#ff2e88', '#7a3cff', '#18c9ff'] }, ink: 'thread', nail: '#7a3cff', index: '#ff5fa2', op: 0.85 },
  // Full House: a house of kraft and brick. Brown and brick bands in turn, red and black suits
  d_house: { w: 0, board: '#d4bc93', thread: { type: 'alt', stops: ['#2b2119', '#9c3b22'] }, op: 0.75, red: '#9c2a1c', black: '#231a13', nail: '#2b2119' },
  // All In: the chips go in. Black, the bands in chip red, green, blue and ivory
  d_allin: { w: 0, board: '#070707', thread: { type: 'alt', stops: ['#d7263d', '#0f8a4a', '#2f6fd6', '#ece6d8'] }, ink: '#ece6d8', nail: '#bdb6a8', index: '#ece6d8', op: 0.85 },
  // River: indigo running over sand
  d_river: { w: 0, board: '#ece3cf', thread: { type: 'linear', angle: 30, stops: ['#1c2f66', '#2b6f8a', '#1c2f66'] }, ink: '#1c2f66', nail: '#1c2f66', index: '#1c2f66', op: 0.8 },
  // Bridge: bridge paint. International orange against fog
  d_bridge: { w: 0, board: { type: 'linear', angle: 90, stops: ['#1d2125', '#0c0e10'] }, thread: '#c8432b', ink: '#e2583e', nail: '#8a3424', index: '#e2583e', op: 0.85 },
  // Double Down: a two-colour print. White card, blue and red bands in turn (each doubled tie gets one of each)
  d_double: { w: 0, board: '#f7f5f0', thread: { type: 'alt', stops: ['#1f4fa3', '#d6343c'] }, op: 0.8, red: '#d6343c', black: '#1f4fa3', nail: '#2b2b2b' },
  // Suicide King: the king of hearts. Black, steel thread, every pip in blood red, the sword bright steel
  d_king: { w: 0, board: '#060606', thread: { type: 'linear', angle: 90, stops: ['#9a9fa6', '#41454b'] }, ink: '#c0101e', nail: '#6b7077', index: '#c0101e', op: 0.8, sword: '#f2f4f6' },
  // The Tell: a back room full of smoke. Dark tobacco, every band fading into it
  d_tell: { w: 0, board: '#1a1612', thread: { type: 'band', stops: ['#cdb894', '#1a1612'] }, ink: '#dccdb0', nail: '#7d6c55', index: '#dccdb0', op: 0.8 },
  // Ace in the Hole: the card face down at night. Midnight blue bands, pips in moonlight
  d_hole: { w: 0, board: '#05070c', thread: { type: 'band', stops: ['#3a62b0', '#0a1328'] }, ink: '#cdd9f2', nail: '#33507f', index: '#cdd9f2', op: 0.85 },
  // Bust: over 21. Hazard yellow on black
  d_bust: { w: 0, board: '#0a0a08', thread: '#f2c230', ink: '#f2c230', nail: '#8a6d12', index: '#f2c230', op: 0.75 },
  // Wild Card: every ink at once. White card, bands in cyan, magenta, yellow and black in turn
  d_wild: { w: 0, board: '#070707', thread: { type: 'alt', stops: ['#00b4f0', '#ff1493', '#ffd400', '#f4f4f4'] }, ink: '#f4f4f4', nail: '#9a9a9a', index: '#f4f4f4', op: 0.85 },
};
const STYLISED = ['gilded', 'chrome', 'eclipse', 'bone', 'noir', 'paper'];
const FADES = ['ghost', 'phantom', 'smoke', 'inkbleed', 'frost', 'silverfade', 'goldfade', 'mist', 'afterglow', 'whisper', 'echo'];
// a seeded direction and starting point for linear fades; ink: 'thread' paints the pips with the thread
function resolvePalette(P, r) {
  const fix = (spec) => {
    if (!spec || typeof spec !== 'object' || !spec.fade) return spec;
    const f = r.range(0.15, 0.55), cols = spec.fade, lead = cols.slice(0, -1);
    const stops = lead.map((c, i) => [lead.length === 1 ? 0 : (f * i) / (lead.length - 1), c]);
    if (lead.length === 1) stops.push([f, lead[0]]);
    stops.push([1, cols[cols.length - 1]]);
    return { type: 'linear', angle: r.range(0, 360), stops };
  };
  const Q = { ...P, thread: fix(P.thread) };
  if (P.ink === 'thread') Q.ink = Q.thread;
  return Q;
}

// ---------- v26: named decks ----------
// A deck's name becomes a rule in how the thread behaves (never a picture, never a colour). Each card keeps its own
// composition; the rule is what its 52 cards share. fam: the composition family the deck allows; mirror: false
// keeps a deck off the mirror; ties: how pips are tied; perPair: bands per tie (null = as the system draws it);
// weave: the times table every pip of the deck strings (m0, kf, and for two families fams + k2), so even an ace
// carries the deck; bands/weight: one band style and weight for every band; eye: only a deck that has it (the eye
// belongs to One-Eyed Jacks).
const DECKS = {
  // Faro: the perfect shuffle, two halves interleaved card for card. Every band strings the out-shuffle (nail i of
  // one arc to nail 2i, then the second half to the odd places), every pip two chord families woven through each other
  faro: { name: 'Faro', weave: { m0: 1, kf: 0.2, fams: 2, k2: 0.18 }, fam: 'free', bands: 'faro', weight: 'regular' },
  // The Nuts: the best hand there is, everything in: every pip ties to every pip it can see (no tie passes through
  // a third pip), the bands thin so the web stays a web; inside, the x4 table (trefoil)
  nuts: { name: 'The Nuts', weave: { m0: 4, kf: 0 }, fam: 'free', ties: 'all', perPair: () => 1, half: (n) => (n >= 7 ? 4 : n >= 5 ? 6 : 9), bands: 'crossed', weight: 'fine' },
  // One-Eyed Jacks: the jacks of spades and hearts are drawn in profile, one eye showing. Every card has exactly one
  // eye (in its largest pip; the only deck with eyes) and every pip leans the same way, like a head turned to one side
  jacks: { name: 'One-Eyed Jacks', weave: { m0: 3, kf: 0 }, fam: 'free', mirror: false, eye: true, lean: true },
  // Marked Cards: the cheat's mark. Every card carries exactly one red thread (the only deck with red): in one band,
  // or, on an ace, one chord across the pip
  // (2026-10-17) edge work: a cheat nicks the cards' edges; the pips stand along the card's edges like a frame, the
  // middle left empty, tied round the frame
  marked: { name: 'Marked Cards', weave: { m0: 5, kf: 0 }, fam: 'free', mark: true, mirror: false, ties: 'seqloop', layout: (rc, n) => edgeLayout(rc, n), aceLayout: true },
  // Cold Deck: the stacked deck slipped into the game looks like an honest one. Its pips sit exactly where a printed
  // deck puts them (the classic layout), upright, every band straight and alike
  cold: { name: 'Cold Deck', weave: { m0: 1, kf: 0.46 }, fam: 'classic', bands: 'straight', weight: 'regular' },
  // Poker Face: nothing shows. Every card is a calm mirror (an ace or a 2 sits as printed), pips upright and alike,
  // and inside the pips no threads at all: an outline and two quiet rings, a face without expression
  poker: { name: 'Poker Face', weave: 'contour', fam: 'free', mirror: true, upright: true, ties: 'mirror', bands: 'crossed', G: (G) => { G.sizing = 'even'; G.stray *= 0.2; } },
  // Royal Flush: a run. The pips stand in one straight line across the card, each a step larger than the last, tied
  // in order; inside, three chord families (the mandala), the richest weave
  royal: { name: 'Royal Flush', weave: 'mandala', fam: 'free', mirror: false, upright: true, ties: 'seq',
    path: (i, m) => { const t = m > 1 ? i / (m - 1) : 0.5; return [2 * t - 1, 0]; },
    G: (G, rc) => { G.stray = 0; G.grow = 0; G.tilt = rc.pick([0.95, -0.95, 1.2, -1.2, Math.PI / 2]) + rc.range(-0.08, 0.08); G.sizing = 'taper'; G.contrast = rc.range(0.5, 0.9); G.extent = 1; G.cx *= 0.3; G.cy *= 0.3; } },
  // Solitaire: the patience tableau. The pips stand in columns that grow one by one, a cascade of steps, tied in
  // the order the cards are dealt; inside, short chords along the rim leave every pip hollow
  solitaire: { name: 'Solitaire', weave: { m0: 1, kf: 0.12 }, fam: 'free', mirror: false, upright: true, ties: 'seq', layout: (rc, n) => solitaireLayout(rc, n) },
  // Crazy Eights: the composition walks a figure eight and closes the loop; inside, the x3.5 table drifts
  crazy: { name: 'Crazy Eights', weave: { m0: 3.5, kf: 0 }, fam: 'free', mirror: false, ties: 'seqloop', loop: true,
    path: (i, m, G) => { const t = i / m; return [Math.sin(2 * Math.PI * t + G.px), 0.5 * Math.sin(4 * Math.PI * t + 2 * G.px)]; },
    G: (G, rc) => { G.stray *= 0.15; G.grow = 0; G.tilt = Math.PI / 2 + rc.range(-0.35, 0.35); G.extent = Math.max(G.extent, 0.85); G.sizing = rc() < 0.5 ? 'even' : 'wild'; G.contrast = Math.min(G.contrast, 0.5); } },
  // Full House: three of a kind and a pair. The pips gather in two rings, a big one and a small one; every pip ties
  // to every pip of its own ring and one band joins the two; inside, the classic woven window
  house: { name: 'Full House', weave: { m0: 1, kf: 0.3 }, fam: 'free', mirror: false, ties: 'house', perPair: (n) => (n === 2 ? 3 : 1), layout: (rc, n) => houseLayout(rc, n) },
  // All In: everything to the middle. One giant pip, every band runs into it and fans out on its rim; inside, x2.5
  allin: { name: 'All In', weave: { m0: 2.5, kf: 0 }, fam: 'free', mirror: false, ties: 'star', bands: 'fan', perPair: (n) => (n === 2 ? 3 : n === 3 ? 2 : 1), G: (G, rc) => { G.sizing = 'giant'; G.contrast = rc.range(0.8, 1.2); } },
  // River: the last card, and a river. The pips follow one winding course, tied in order, and every band turns the
  // same way, one current; inside, the x1.5 swirl
  river: { name: 'River', weave: { m0: 1.5, kf: 0 }, fam: 'free', mirror: false, ties: 'seq', flow: 'swirl',
    path: (i, m, G) => { const t = m > 1 ? i / (m - 1) : 0.5; return [2 * t - 1, G.ramp * Math.sin(2 * Math.PI * G.rf * t + G.py)]; },
    G: (G, rc) => { G.ramp = rc.range(0.22, 0.42); G.rf = rc.range(0.7, 1.4); G.stray *= 0.2; G.grow = 0; G.tilt = rc.pick([0.95, -0.95, Math.PI / 2, 0.5, -0.5]) + rc.range(-0.1, 0.1); G.extent = Math.max(G.extent, 0.85); } },
  // Bridge: the shuffle's finish, the cards arched and let fall. The pips stand on an arch, tied along it, and one
  // band runs straight under it from end to end, the road; inside, a double star
  bridge: { name: 'Bridge', weave: { m0: 1, kf: 0.3, fams: 2, k2: 0.16 }, fam: 'free', mirror: false, ties: 'seqloop', perPair: (n) => (n === 2 ? 3 : 1),
    path: (i, m, G) => { const t = m > 1 ? i / (m - 1) : 0.5, th = Math.PI * (1 - t); return [Math.cos(th), -G.arch * Math.sin(th)]; },
    G: (G, rc) => { G.arch = rc.range(0.75, 1.15); G.stray *= 0.1; G.grow = 0; G.tilt = rc.range(-0.12, 0.12); G.extent = Math.max(G.extent, 0.8); G.sizing = 'even'; } },
  // Double Down: everything doubled. Every card is its own mirror image (an ace or a 2 as printed), and every tie
  // is strung twice, two thin bands side by side; inside, two chord families woven together (2026-10-17: was x2
  // twice, too close to Dead Man's Hand)
  double: { name: 'Double Down', weave: { m0: 1, kf: 0.2, fams: 2, k2: 0.18 }, fam: 'free', mirror: true, perPair: () => 2, half: (n) => (n >= 7 ? 4 : n >= 4 ? 6 : 9), bands: 'crossed', weight: 'fine' },
  // Suicide King: the king of hearts seems to drive a sword into his own head. One giant pip, and one heavy straight
  // thread runs right through it; inside, near-diameter chords
  // (2026-10-17) the lonely king: the giant stands in the middle, his court stands round him in a ring, tied to each
  // other and never to him; the sword is gone
  king: { name: 'Suicide King', weave: { m0: 1, kf: 0.38 }, fam: 'free', mirror: false, ties: 'court', layout: (rc, n) => kingLayout(rc, n), aceLayout: true },
  // The Tell: everything in order, pips alike and upright, bands alike, except one pip, turned. The collector looks
  // for it; inside, the x4.5 drift
  tell: { name: 'The Tell', weave: { m0: 4.5, kf: 0 }, fam: 'free', mirror: false, upright: true, tell: true, bands: 'crossed', flow: 'direct', G: (G) => { G.sizing = 'even'; G.stray *= 0.5; } },
  // Ace in the Hole: the card hidden face down. Inside the largest pip the threads leave a small pip of their own
  // untouched, a hidden pip in the weave; the other pips string a fine lace
  hole: { name: 'Ace in the Hole', weave: { m0: 1, kf: 0.1, fams: 2, k2: 0.14 }, fam: 'free', hole: true },
  // Bust: over 21. The largest pip is too big for the card and runs off its edge; inside, x6
  bust: { name: 'Bust', weave: { m0: 6, kf: 0 }, fam: 'free', bleed: true },
  // Wild Card: the card that can be anything. No weave of its own: every pip strings a different one, an ace two
  // at once
  // (2026-10-17) the throw: the pips are flung over the card, every one turned its own way, sizes wild, some over
  // the edge (the only deck that breaks the frame)
  wild: { name: 'Wild Card', weave: null, fam: 'free', wild: true, mirror: false, ties: 'nearest', spin: true, layout: (rc, n) => throwLayout(rc, n), aceLayout: true },
  deadmans: { name: "Dead Man's Hand", weave: { m0: 2, kf: 0 }, fam: 'free', mirror: false, ties: 'pairs', couple: true, perPair: (n) => (n === 2 ? 3 : 2) },
};
for (const k of Object.keys(DECKS)) DECKS[k].palette = 'd_' + k;
const STYLES = [['crossed', 4], ['straight', 1], ['lattice', 2], ['fan', 2], ['twist', 1.5], ['single', 1.2]];

function traitsFor(r, rs, opts) {
  const T = {
    rank: rs.int(1, 10),
    suit: rs.pick(D.SUITS),
    layout: r.weighted([['classic', 1], ['scatter', 1], ['ring', 1.2], ['column', 1], ['cascade', 1.2], ['mirror', 3.5], ['giant', 1.6], ['spiral', 1.4], ['grid', 1.3], ['arc', 1.4], ['bloom', 2.4], ['nest', 1.5]]),
    ties: r.weighted([['nearest', 3], ['chain', 2.5], ['star', 1.5], ['web', 1.5], ['loop', 1.8]]),
    bands: r.weighted([['uniform', 4], ['mixed', 6]]),
    style: r.weighted(STYLES),
    flow: r.weighted([['direct', 5], ['swirl', 2.5], ['loose', 2.5]]),
    weave: r.weighted([['woven', 4], ['star', 2.5], ['lace', 2], ['contour', 1]]),
    palette: r.weighted(Object.entries(PALETTES).map(([k, p]) => [k, p.w])),
    weight: r.weighted([['fine', 2], ['regular', 5], ['heavy', 2]]),
    accent: r() < 0.14 ? 'red thread' : 'none',
  };
  // drawn after the v7 traits
  T.turn = r() < 0.4 ? 'turned' : 'upright';
  T.veil = r() < 0.35 ? r.weighted([['tone', 3], ['hatch', 3], ['cross', 1.5], ['stipple', 2.5], ['string', 2]]) : 'none';
  T.ground = r.weighted([['none', 5.5], ['pegs', 2.5], ['geometry', 2]]);
  if (T.layout === 'mirror' && r() < 0.5) T.ties = 'mirror';
  NATIVE = T.palette; // the seed's own palette, before any override (see renderStatic)
  for (const k of ['rank', 'suit', 'palette', 'bands', 'layout', 'veil', 'ground', 'weave']) if (opts[k] !== undefined && opts[k] !== null) T[k] = opts[k];
  if (T.layout === 'classic') T.turn = 'upright';
  // spirals and arcs need pips to read as a line; with three or fewer they are just small pips
  if (T.rank <= 3 && (T.layout === 'spiral' || T.layout === 'arc')) T.layout = 'scatter';
  if (T.rank === 2 && T.layout === 'mirror') T.layout = 'giant'; // a lone mirrored pair reads as a small bar
  if (T.ties === 'mirror' && T.layout !== 'mirror') T.ties = 'nearest';
  if (T.rank <= 2 && T.layout === 'ring') T.layout = 'scatter';
  if (T.rank === 1) {
    if (T.layout !== 'classic') T.layout = 'scatter';
    T.veil = 'none'; T.turn = 'upright';
    if (T.ground === 'geometry') T.ground = 'pegs'; // one pip has no lines to measure
    T.ties = 'none'; T.bands = 'none'; T.style = 'none'; T.flow = 'none'; T.weave = 'mandala';
  }
  if (T.bands === 'mixed') { T.style = 'mixed'; T.weight = 'mixed'; }
  if (!PALETTES[T.palette].accent || T.rank === 1) T.accent = 'none';
  if (T.rank === 1) T.weight = 'none';
  if (T.rank >= 11) {
    // drawn last, so number cards keep every earlier draw
    T.layout = r.weighted([['upright', 2], ['offset', 3], ['lean', 5]]);
    T.ties = r.weighted([['spine', 5], ['braid', 5]]);
  }
  return T;
}

// ---------- layouts (as v3) ----------
const FIELD = { x0: 105, x1: C.W - 105, y0: 125, y1: C.H - 125 };
function clear(h) {
  if (h.bleed || h.over) return true; // a bleed (or a thrown pip) sits on the edge on purpose
  const e = h.size * 0.56;
  if (h.x - e < FIELD.x0 || h.x + e > FIELD.x1 || h.y - e < FIELD.y0 || h.y + e > FIELD.y1) return false;
  if (h.x - e < 190 && h.y - e < 310) return false;
  if (h.x + e > C.W - 190 && h.y + e > C.H - 310) return false;
  return true;
}
function apart(list, gap = 34) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
    if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < (list[i].size + list[j].size) / 2 + gap) return false;
  return true;
}
function settle(make, minSize, gap = 34) {
  for (let k = 0; k < 70; k++) {
    const list = make(Math.pow(0.97, k), k > 30 ? Math.pow(0.985, k - 30) : 1);
    if (list.some((h) => h.size < minSize)) return null;
    if (list.every(clear) && apart(list, gap)) return list;
  }
  return null;
}
// ---------- v24: the composer ----------
// the rule a card writes, then its pips: points along the backbone curve (with stray), fitted into the box the
// rule chose (keeping the curve's own proportions), sized by the rule, relaxed apart and off the index corners;
// a mirror card fits the right half and reflects it (an odd pip sits on the axis)
function compose(rc, n, forceMirror, R = {}, nFor = n) {
  const G = {
    // a mirrored pair is only a bar across the card (seen on 2s), so a mirror needs three pips or more
    mirror: !R.swarm && !R.bleed && (forceMirror !== undefined ? forceMirror : rc() < 0.35 && n >= 3),
    fx: rc.range(0.15, 1.4), fy: rc.range(0.15, 1.4), px: rc.range(0, 6.283), py: rc.range(0, 6.283),
    grow: rc() < 0.4 ? rc.range(-0.85, 0.85) : 0, stray: Math.pow(rc(), 1.7), span: rc.range(0.35, 1), t0: rc(),
    cx: rc.range(-0.2, 0.2), cy: rc.range(-0.18, 0.18), extent: rc.range(nFor >= 7 ? 0.68 : nFor !== n && nFor >= 4 ? 0.58 : 0.45, 1), tilt: rc.range(0, 6.283),
    sizing: rc.weighted([['even', 4], ['taper', 3], ['giant', 2], ['wild', 1.5]]), contrast: rc.range(0.25, 1),
  };
  if (DKC && DKC.G) DKC.G(G, rc, n);
  const Wf = FIELD.x1 - FIELD.x0, Hf = FIELD.y1 - FIELD.y0, mx = C.W / 2;
  if (R.swarm) { G.extent = R.rr.range(0.18, 0.28); G.sizing = 'even'; }
  if (n === 1) {
    if (R.bleed) return bleed([], { x: C.W / 2, y: C.H / 2, size: rc.range(300, 440) }, R, n);
    // an ace: one big pip wherever the rule leans it, pulled back toward the middle until it fits
    const size = R.swarm ? R.rr.range(90, 130) : rc.range(300, 440);
    for (let k = 1; k >= 0; k -= 0.1) { const h = { x: mx + G.cx * Wf * k, y: C.H / 2 + G.cy * Hf * k, size }; if (clear(h)) return [h]; }
    return [{ x: mx, y: C.H / 2, size: 380 }];
  }
  const half = G.mirror ? Math.floor(n / 2) : n, axis = G.mirror ? n % 2 : 0, m = half + axis;
  const ct = Math.cos(G.tilt), st = Math.sin(G.tilt);
  const pts = [];
  for (let i = 0; i < m; i++) {
    const t = G.t0 + G.span * (m > 1 ? i / (m - 1) : 0.5), rho = 1 + G.grow * (2 * (t - G.t0) / G.span - 1);
    let u, v;
    if (DKC && DKC.path) { [u, v] = DKC.path(i, m, G); u += (rc() - 0.5) * 2 * G.stray; v += (rc() - 0.5) * 2 * G.stray; }
    else {
      u = rho * Math.sin(2 * Math.PI * G.fx * t + G.px) + (rc() - 0.5) * 2 * G.stray;
      v = rho * Math.cos(2 * Math.PI * G.fy * t + G.py) + (rc() - 0.5) * 2 * G.stray;
    }
    [u, v] = [u * ct - v * st, u * st + v * ct];
    pts.push({ u, v, t: m > 1 ? i / (m - 1) : 0.5 });
  }
  // the box: the whole field, or the right half beside the axis for a mirror card
  const bw = (G.mirror ? Wf / 2 - 60 : Wf) * G.extent, bh = Hf * G.extent;
  const bx = G.mirror ? mx + 60 + (Wf / 2 - 60) * (1 - G.extent) * rc() : mx + G.cx * Wf - bw / 2, by = C.H / 2 + G.cy * Hf - bh / 2;
  const us = pts.map((p) => p.u), vs = pts.map((p) => p.v);
  const u0 = Math.min(...us), v0 = Math.min(...vs), du = Math.max(...us) - u0 || 1, dv = Math.max(...vs) - v0 || 1;
  const k = Math.min(bw / du, bh / dv);
  const ox = bx + (bw - du * k) / 2, oy = by + (bh - dv * k) / 2;
  let s0 = R.swarm ? Math.min(85, 0.62 * Math.sqrt((Wf * G.extent * Hf * G.extent) / n)) : Math.min(300, 0.62 * Math.sqrt((Wf * G.extent * Hf * G.extent) / n));
  if (DKC && DKC.path && m > 1) {
    let L = 0;
    for (let i = 1; i < m; i++) L += Math.hypot((pts[i].u - pts[i - 1].u) * k, (pts[i].v - pts[i - 1].v) * k);
    const sp = DKC.loop ? (L + Math.hypot((pts[0].u - pts[m - 1].u) * k, (pts[0].v - pts[m - 1].v) * k)) / m : L / (m - 1);
    s0 = Math.min(s0, Math.max(60, sp * 0.8 - 14));
  }
  const gi = rc.int(0, m - 1);
  const list = pts.map((p, i) => {
    const fct = G.sizing === 'even' ? 1 + (rc() - 0.5) * 0.2 : G.sizing === 'taper' ? 1 + G.contrast * (0.5 - p.t) * 1.2 : G.sizing === 'giant' ? (i === gi ? 1.5 + G.contrast : 0.72) : Math.exp(G.contrast * 0.7 * (rc() * 2 - 1));
    return { x: ox + (p.u - u0) * k, y: oy + (p.v - v0) * k, size: Math.max(70, Math.min(440, s0 * fct)) };
  });
  // the axis pips of a mirror card sit on the axis
  if (G.mirror) for (let i = 0; i < axis; i++) list[list.length - 1 - i].x = mx;
  if (R.bleed) {
    // the largest becomes the bleed; the rest relax around it
    const g = list.reduce((m, p, i) => (p.size > list[m].size ? i : m), 0);
    const giant = list.splice(g, 1)[0];
    return bleed(list, giant, R, n);
  }
  return relax(list, G.mirror, axis, n, [], R.swarm ? 14 : null, R.swarm ? 28 : 55);
}
// v26 couples (Dead Man's Hand): compose ceil(n/2) places, split each into two partners turned at the place's own
// angle; the partners know each other (mate), the ties read them
function couples(rc, n, R) {
  if (n < 2) return compose(rc, n, false, R);
  const k = Math.ceil(n / 2), slots = compose(rc, k, false, R, n);
  if (!slots) return null;
  const out = [];
  slots.forEach((s, i) => {
    const single = n % 2 === 1 && i === slots.length - 1;
    const size = Math.max(70, s.size * (single ? 0.7 : 0.62));
    if (single) { out.push({ x: s.x, y: s.y, size }); return; }
    const a = rc.range(0, Math.PI * 2), d = size * (n === 2 ? 1.25 : 0.8), j = out.length;
    out.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, size, mate: j + 1 }, { x: s.x - Math.cos(a) * d, y: s.y - Math.sin(a) * d, size, mate: j });
  });
  return relax(out, false, 0, n, [], 30);
}
// v26 Solitaire: a cascade of shelves. Each shelf holds one to three pips side by side, the next shelf starts under
// the last pip of the one above (sometimes a step further), so the pips fall down the card in steps; a wide cascade
// is turned on its side to fit the card, and it falls left or right
function solitaireLayout(rc, n) {
  const cells = [];
  let x = 0, y = 0;
  for (let left = n; left > 0; ) {
    const run = Math.min(left, rc.int(1, 3));
    for (let j = 0; j < run; j++) cells.push([x + j, y]);
    left -= run; x += run - 1 + (rc() < 0.35 ? 1 : 0); y += 1;
  }
  let cols = Math.max(...cells.map((c) => c[0])) + 1, rows = y;
  if (cols > rows) { cells.forEach((c) => c.reverse()); [cols, rows] = [rows, cols]; }
  const flip = rc() < 0.5, Wf = FIELD.x1 - FIELD.x0, Hf = FIELD.y1 - FIELD.y0;
  const colW = Math.min(260, (Wf * 0.92) / cols), rowH = Math.min(250, (Hf * 0.84) / rows);
  const size = Math.max(70, Math.min(colW, rowH) * 0.8);
  const x0 = C.W / 2 - (colW * (cols - 1)) / 2, y0 = C.H / 2 - (rowH * (rows - 1)) / 2;
  return relax(cells.map(([cx, cy]) => ({ x: x0 + (flip ? cols - 1 - cx : cx) * colW, y: y0 + cy * rowH, size })), false, 0, n);
}
// v26e court figures: the upper half as named parts { x, y, size, a (turn), bones (names) }; a part may tie to
// its own turned twin with "~name". Seeded play: the head leans, the parts breathe a little, the item moves.
// The grown half (figure = true): it grows out of its head pip. The crown's points (K three, Q two) stand where rays
// from the head's centre, fanned round straight up, leave its rim, each turned along its ray; the jack's cap is one
// such point thrown to a side. The shoulders hang where two rays down and out leave the rim; Q's flower and J's halberd
// rise from one shoulder; the brooch keeps the card's centre. Every share and angle comes from the card's own stream.
// Then the half is scaled and moved into its half of the card, clear of the index corner.
function courtGrow(rc, rank, suit, UP) {
  const unit = D.UNITS[suit], lean = rc.range(-0.08, 0.08), S = rc.range(225, 275), up = -Math.PI / 2 + lean;
  const head = turnPoly(C.placeShape(unit, 0, 0, S, false), lean, 0, 0);
  const ray = (th) => [Math.cos(th), Math.sin(th)];
  const rim = (th) => rayExit([0, 0], ray(th), head, 0) || [ray(th)[0] * S * 0.45, ray(th)[1] * S * 0.45];
  const parts = { head: { x: 0, y: 0, size: S, a: lean, bones: [] } };
  // a part on the head's rim: out along its ray by a share of its own size, turned along the ray
  const onRim = (name, th, size, out, bones) => { const R = rim(th), d = ray(th); parts[name] = { x: R[0] + d[0] * size * 0.46 * out, y: R[1] + d[1] * size * 0.46 * out, size, a: UP + th + Math.PI / 2, bones, d }; };
  const side = rc() < 0.5 ? -1 : 1;
  if (rank === 13) {
    const sp = rc.range(0.5, 0.7), c = S * rc.range(0.33, 0.4), out = rc.range(1.0, 1.35);
    onRim('crownL', up - sp, c, out, ['crownM']); onRim('crownM', up, c * rc.range(1.08, 1.2), out, ['crownR']); onRim('crownR', up + sp, c, out, []);
  } else if (rank === 12) {
    const sp = rc.range(0.32, 0.5), c = S * rc.range(0.38, 0.46), out = rc.range(0.95, 1.3);
    onRim('crownL', up - sp, c, out, ['crownR', 'shL']); onRim('crownR', up + sp, c, out, ['shR']);
  } else onRim('cap', up + side * rc.range(0.25, 0.55), S * rc.range(0.55, 0.66), rc.range(0.75, 1.0), []);
  const dn = Math.PI / 2 + lean, sw = rc.range(1.0, 1.25), sg = S * rc.range(0.62, 0.74), so = rc.range(1.7, 2.3);
  for (const [name, s2] of [['shL', 1], ['shR', -1]]) { const th = dn + s2 * (sw + rc.range(-0.06, 0.06)), R = rim(th), d = ray(th); parts[name] = { x: R[0] + d[0] * sg * 0.5 * so, y: R[1] + d[1] * sg * 0.5 * so, size: sg, a: -s2 * rc.range(0.05, 0.25), bones: [], d }; }
  const sh = side < 0 ? 'shL' : 'shR';
  if (rank === 12) { const th = -Math.PI / 2 + side * rc.range(0.25, 0.6), L = sg * rc.range(0.95, 1.3); parts.flower = { x: parts[sh].x + Math.cos(th) * L, y: parts[sh].y + Math.sin(th) * L, size: S * rc.range(0.3, 0.36), a: 0.45 * side, bones: [sh], d: [Math.cos(th), Math.sin(th)] }; }
  if (rank === 11) { const th = -Math.PI / 2 + side * rc.range(0.05, 0.25), L = sg * rc.range(1.7, 2.2); parts.halberd = { x: parts[sh].x + Math.cos(th) * L, y: parts[sh].y + Math.sin(th) * L, size: S * rc.range(0.32, 0.38), a: UP, bones: [sh], d: [Math.cos(th), Math.sin(th)] }; }
  // no part lies on another: in the order they grew, each moves out along its own ray until it clears the ones before
  const order = Object.keys(parts);
  order.forEach((n, i) => { const q = parts[n]; if (!q.d) return; for (let t = 0; t < 60; t++) { const hit = order.slice(0, i).some((m) => { const o = parts[m]; return Math.hypot(o.x - q.x, o.y - q.y) < (o.size + q.size) * 0.5; }); if (!hit) break; q.x += q.d[0] * q.size * 0.06; q.y += q.d[1] * q.size * 0.06; } });
  // the bones: what hangs from what
  parts.head.bones = rank === 13 ? ['crownL', 'crownR', 'shL', 'shR', 'brooch'] : rank === 12 ? ['crownL', 'crownR', 'shL', 'shR'] : ['cap', 'shL', 'shR'];
  if (rank === 12) { parts.shL.bones = ['~shR']; parts.shR.bones = ['~shL']; } else { parts.shL.bones = ['brooch']; parts.shR.bones = ['brooch']; }
  // into the upper half: as large as fits, as low as it may go (its shoulders clear of the other half's), clear of the index
  const names = Object.keys(parts), X0 = 132, X1 = C.W - 132, Y0 = 120, Y1 = 690;
  let k = 1, dx = 0;
  const box = () => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const n of names) { const q = parts[n], r = q.size * 0.5 * k; x0 = Math.min(x0, q.x * k - r); x1 = Math.max(x1, q.x * k + r); y0 = Math.min(y0, q.y * k - r); y1 = Math.max(y1, q.y * k + r); } return { x0, x1, y0, y1 }; };
  let b = box(); k = Math.min(1, (X1 - X0) / (b.x1 - b.x0), (Y1 - Y0) / (b.y1 - b.y0)); b = box();
  const hx = 500 + rc.range(-15, 15);
  for (let t = 0; t < 40; t++) {
    dx = Math.min(Math.max(hx, X0 - b.x0), X1 - b.x1); const dy = Y1 - b.y1;
    const hit = names.some((n) => { const q = parts[n], r = q.size * 0.5 * k, x = q.x * k + dx, y = q.y * k + dy; return x - r < 190 && y - r < 310; });
    if (!hit) { for (const n of names) { const q = parts[n]; q.x = q.x * k + dx; q.y = q.y * k + dy; q.size *= k; } break; }
    k *= 0.96; b = box();
  }
  if (rank !== 12) parts.brooch = { x: C.W / 2, y: C.H / 2, size: parts.head.size * rc.range(0.36, 0.42), a: 0, centre: true };
  return parts;
}
function courtFigure(rc, rank, suit, mode) {
  // UP turns a suit pip so its point stands up: a crown's spike, a cap's peak, a halberd's blade
  const UP = { hearts: Math.PI, clubs: Math.PI, spades: 0, diamonds: 0 }[suit] || 0;
  const lean = rc.range(-0.07, 0.07), j = () => rc.range(-12, 12), hx = 500 + rc.range(-18, 18);
  // gruff (round 38) chose the fixed skeleton: it is the default; opts.figure 'grow' keeps the grown one
  const parts = mode === 'grow' ? courtGrow(rc, rank, suit, UP) : {
    // the king: upright shoulders (round, like a bust), a crown of three points in a row on his head, a robe that
    // closes in a V at the brooch, his sword laid behind his head (one solid thread from his left shoulder past the crown)
    13: {
      // his beard: a fan band from the arc of his chin, narrowing to a point on the brooch at his chest
      head: { x: hx, y: 412, size: 262, a: lean, bones: ['crownL', 'crownR', 'shL', 'shR', { to: 'brooch', style: 'fan', point: 'to', share: 0.14, n: 1, weight: 'regular' }] },
      crownL: { x: hx - 112, y: 252 + j() * 0.2, size: 112, a: UP - 0.3 + lean, bones: ['crownM'] },
      crownM: { x: hx + lean * 140, y: 202 + j() * 0.2, size: 132, a: UP + lean, bones: ['crownR'] },
      crownR: { x: hx + 112, y: 252 + j() * 0.2, size: 112, a: UP + 0.3 + lean, bones: [] },
      // his robe: from each shoulder a wide ribbon to the brooch; with the other half's, an X across his chest
      shL: { x: 272 + j(), y: 592, size: 172, a: -0.16, bones: [{ to: 'brooch', style: 'straight', share: 0.13, n: 1, weight: 'regular' }] },
      // the sword: a narrow straight band from his right shoulder up past his face to the crown's right point
      shR: { x: 728 + j(), y: 592, size: 172, a: 0.16, bones: [{ to: 'brooch', style: 'straight', share: 0.13, n: 1, weight: 'regular' }, { to: 'crownR', style: 'straight', share: 0.04, n: 1, weight: 'heavy' }] },
      brooch: { x: 500, y: 700, size: 100, a: 0, centre: true },
    },
    // the queen: a crown of two leaning in like an arch, the veil falling from it to her shoulders, the robe's sides
    // running down to the other half, a flower held up on its stem
    12: {
      head: { x: hx, y: 418, size: 244, a: lean, bones: ['crownL', 'crownR', 'shL', 'shR'] },
      // her hair: a wide ribbon of straight threads falling from each crown point beside her face to her shoulder;
      // the rose on a stem (a band one nail wide)
      crownL: { x: hx - 58, y: 254, size: 104, a: UP + 0.36 + lean, bones: ['crownR', { to: 'shL', style: 'straight', share: 0.12, n: 1, weight: 'regular' }] },
      crownR: { x: hx + 58, y: 254, size: 104, a: UP - 0.36 + lean, bones: [{ to: 'shR', style: 'straight', share: 0.12, n: 1, weight: 'regular' }] },
      flower: { x: 760 + j(), y: 316 + j(), size: 82, a: 0.45, bones: [{ to: 'shR', style: 'straight', share: 0.015, n: 1, weight: 'heavy' }] },
      // her gown: from each shoulder a wide ribbon straight down to the other half's shoulder below it, an open oval
      shL: { x: 270 + j(), y: 598, size: 168, a: -0.16, bones: [{ to: '~shR', style: 'straight', share: 0.12, n: 1, weight: 'regular' }] },
      shR: { x: 730 + j(), y: 600, size: 168, a: 0.16, bones: [{ to: '~shL', style: 'straight', share: 0.12, n: 1, weight: 'regular' }] },
    },
    // the jack: a cap tilted on his head, a halberd held up (a small pip on a long solid staff down past his shoulder)
    11: {
      // his curls: a twisted band from the back of his head to the far shoulder; he looks the other way
      head: { x: hx, y: 424, size: 240, a: lean, bones: ['cap', { to: 'shL', style: 'twist', share: 0.11, n: 1, weight: 'regular' }, 'shR'] },
      cap: { x: hx - 22, y: 262, size: 168, a: UP - 0.62 + lean, bones: [] },
      halberd: { x: 236 + j() * 0.5, y: 196, size: 88, a: UP, bones: [{ to: 'shL', style: 'straight', share: 0.025, n: 1, weight: 'heavy' }] },
      // his tunic: one wide ribbon across the card, from the halberd's shoulder to its twin below, a single slash
      shL: { x: 272 + j(), y: 600, size: 166, a: -0.16, bones: [{ to: '~shL', style: 'straight', share: 0.12, n: 1, weight: 'regular' }] },
      shR: { x: 728 + j(), y: 600, size: 166, a: 0.16, bones: ['brooch'] },
      brooch: { x: 500, y: 700, size: 96, a: 0, centre: true },
    },
  }[rank];
  const names = Object.keys(parts).filter((k) => !parts[k].centre), out = [], at = {};
  names.forEach((k, i) => { at[k] = i; });
  names.forEach((k, i) => { at['~' + k] = names.length + i; });
  if (parts.brooch) at.brooch = names.length * 2;
  names.forEach((k) => { const q = parts[k], bn = q.bones || [], spec = {}; bn.forEach((b) => { if (typeof b !== 'string') spec[at[b.to]] = b; }); out.push({ x: q.x, y: q.y, size: q.size, a: q.a, loose: q.loose, part: k, twin: at['~' + k], spec, bones: bn.map((b) => at[typeof b === 'string' ? b : b.to]), rods: (q.rods || []).map((d) => ({ ...d, to: at[d.to] })) }); });
  names.forEach((k, i) => { const q = parts[k]; out.push({ x: C.W - q.x, y: C.H - q.y, size: q.size, a: q.a, loose: q.loose, part: '~' + k, left: true, twin: i }); });
  if (parts.brooch) { const q = parts.brooch; out.push({ x: q.x, y: q.y, size: q.size, a: q.a, part: 'brooch' }); }
  return out;
}
// v26 Suicide King: the king (a giant) near the middle, the court on an ellipse round him, in ring order
function kingLayout(rc, n) {
  const K = { x: C.W / 2 + rc.range(-30, 30), y: C.H / 2 + rc.range(-50, 50), king: true };
  if (n === 1) { K.size = rc.range(380, 460); return [K]; }
  K.size = rc.range(260, 330) * (n >= 8 ? 0.85 : 1);
  const m = n - 1, Rx = Math.min(330, K.size / 2 + rc.range(110, 170)), Ry = Rx * rc.range(1.2, 1.45);
  const per = Math.PI * (3 * (Rx + Ry) - Math.sqrt((3 * Rx + Ry) * (Rx + 3 * Ry)));
  const size = Math.max(70, Math.min(160, (per / Math.max(m, 3)) * 0.55)), off = rc.range(0, 2 * Math.PI);
  const ring = [];
  const step = m <= 2 ? (2 * Math.PI) / 3 : (2 * Math.PI) / m;
  for (let i = 0; i < m; i++) { const t = off + step * i; ring.push({ x: K.x + Math.cos(t) * Rx, y: K.y + Math.sin(t) * Ry, size }); }
  const rest = relax(ring, false, 0, n, [K], 26);
  return rest ? [...rest, K] : null;
}
// v26 Marked Cards: the pips spaced evenly round a frame inside the card's edge (from a random start), the middle
// empty; an ace sits against one edge
function edgeLayout(rc, n) {
  const x0 = FIELD.x0 + 40, x1 = FIELD.x1 - 40, y0 = FIELD.y0 + 40, y1 = FIELD.y1 - 40, w = x1 - x0, h = y1 - y0, P = 2 * (w + h);
  const at = (d) => { d = ((d % P) + P) % P; if (d < w) return [x0 + d, y0]; d -= w; if (d < h) return [x1, y0 + d]; d -= h; if (d < w) return [x1 - d, y1]; d -= w; return [x0, y1 - d]; };
  if (n === 1) {
    const size = rc.range(280, 340), ix0 = FIELD.x0 + size / 2, ix1 = FIELD.x1 - size / 2, iy0 = FIELD.y0 + size / 2, iy1 = FIELD.y1 - size / 2, iw = ix1 - ix0, ih = iy1 - iy0;
    let d = rc.range(0, 2 * (iw + ih)), x, y;
    if (d < iw) [x, y] = [ix0 + d, iy0]; else if ((d -= iw) < ih) [x, y] = [ix1, iy0 + d]; else if ((d -= ih) < iw) [x, y] = [ix1 - d, iy1]; else [x, y] = [ix0, iy1 - (d - iw)];
    return relax([{ x, y, size }], false, 0, n);
  }
  const size = Math.max(70, Math.min(190, (P / n) * 0.5)), off = rc.range(0, P), out = [];
  for (let i = 0; i < n; i++) { const [x, y] = at(off + (P * i) / n); out.push({ x, y, size }); }
  return relax(out, false, 0, n, [], 24);
}
// v26 Wild Card: thrown pips; about a third of them over the card's edge (marked over, so nothing pulls them in)
function throwLayout(rc, n) {
  const s0 = Math.min(300, 0.6 * Math.sqrt(((FIELD.x1 - FIELD.x0) * (FIELD.y1 - FIELD.y0)) / n));
  // a pip over the left edge stays below the top-left index, over the right edge above the bottom-right one
  const yFor = (side, size) => (side < 0 ? rc.range(Math.max(FIELD.y0, 330) + size / 2, FIELD.y1 - size / 2) : side > 0 ? rc.range(FIELD.y0 + size / 2, Math.min(FIELD.y1, C.H - 330) - size / 2) : rc.range(FIELD.y0 + size / 2, FIELD.y1 - size / 2));
  if (n === 1) {
    const size = rc.range(340, 440), side = rc() < 0.5 ? rc.pick([-1, 1]) : 0;
    return [{ x: side < 0 ? size * 0.28 : side > 0 ? C.W - size * 0.28 : C.W / 2 + rc.range(-100, 100), y: side ? yFor(side, size) : C.H / 2 + rc.range(-160, 160), size, over: side !== 0 }];
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const size = Math.max(70, Math.min(400, s0 * Math.exp(rc.range(-0.6, 0.6)))), side = rc() < 0.33 ? rc.pick([-1, 1]) : 0;
    const x = side < 0 ? size * rc.range(0.1, 0.35) : side > 0 ? C.W - size * rc.range(0.1, 0.35) : rc.range(FIELD.x0 + size / 2, FIELD.x1 - size / 2);
    out.push({ x, y: yFor(side, size), size, over: side !== 0 });
  }
  const done = relax(out, false, 0, n, [], 18);
  if (done) for (const q of done) if (q.over) q.x = Math.min(Math.max(q.x, q.size * 0.1), C.W - q.size * 0.1);
  return done;
}
// v26 Full House: a big ring and a small ring (three and two of five; a 2 is one and one), each pip knows its ring
function houseLayout(rc, n) {
  const a = n === 2 ? 1 : Math.ceil(n * 0.6), b = n - a;
  const Wf = FIELD.x1 - FIELD.x0, Hf = FIELD.y1 - FIELD.y0;
  const ang = rc.range(0, 2 * Math.PI), sep = rc.range(0.3, 0.38) * Hf;
  const cA = [C.W / 2 + Math.cos(ang) * sep * 0.55, C.H / 2 + Math.sin(ang) * sep], cB = [C.W / 2 - Math.cos(ang) * sep * 0.55, C.H / 2 - Math.sin(ang) * sep];
  const s0 = Math.min(230, 0.6 * Math.sqrt((Wf * Hf * 0.5) / n));
  const ring = (c, cnt, size, grp) => {
    const out = [], r0 = cnt === 1 ? 0 : size * (0.75 + 0.14 * cnt), off = rc.range(0, 6.283);
    for (let i = 0; i < cnt; i++) { const t = off + (2 * Math.PI * i) / cnt; out.push({ x: c[0] + Math.cos(t) * r0, y: c[1] + Math.sin(t) * r0, size, grp }); }
    return out;
  };
  return relax([...ring(cA, a, s0, 0), ...ring(cB, b, s0 * 0.8, 1)], false, 0, n, [], 30);
}
// Bleed: the giant grows and sits on an edge (left or right side, the top right or the bottom left, never
// over an index corner), part of it off the card; the other pips are relaxed around it
function bleed(others, giant, R, n) {
  let S = Math.min(820, Math.max(giant.size, 220) * R.rr.range(2, 2.6));
  if (DKC && DKC.bleed) S = Math.max(S, R.rr.range(600, 780));
  const spot = R.rr.pick([[-0.1, R.rr.range(0.38, 0.62)], [1.1, R.rr.range(0.38, 0.62)], [R.rr.range(0.58, 0.82), -0.07], [R.rr.range(0.18, 0.42), 1.07]]);
  const G = { x: spot[0] * C.W, y: spot[1] * C.H, size: S, bleed: true };
  if (DKC && DKC.bleed) {
    if (spot[0] < 0) G.x = S * 0.12; else if (spot[0] > 1) G.x = C.W - S * 0.12;
    if (spot[1] < 0) G.y = S * 0.12; else if (spot[1] > 1) G.y = C.H - S * 0.12;
  }
  if (!others.length) return [G];
  const rest = relax(others.map((p) => ({ ...p })), false, 0, n, [G]);
  return rest ? [...rest, G] : null;
}
// push the pips apart and into the field until they clear each other and the corners; shrink only when stuck.
// A mirror card works on its whole reflected list and re-symmetrises after every step.
function relax(half, mirror, axis, n, fixed = [], gapOver = null, floor = 55) {
  const gap = gapOver !== null ? gapOver : gapFor(n), mx = C.W / 2;
  const full = () => {
    if (!mirror) return half.map((p) => ({ ...p }));
    const out = [];
    half.forEach((p, i) => {
      if (i >= half.length - axis) { out.push({ x: mx, y: p.y, size: p.size }); return; }
      const j = out.length;
      out.push({ x: p.x, y: p.y, size: p.size, twin: j + 1 }, { x: C.W - p.x, y: p.y, size: p.size, twin: j, left: true });
    });
    return out;
  };
  for (let round = 0; round < 30; round++) {
    for (let it = 0; it < 150; it++) {
      const L = full();
      if (L.every(clear) && apart(L, gap) && L.every((h) => fixed.every((q) => Math.hypot(h.x - q.x, h.y - q.y) >= (h.size + q.size) / 2 + gap))) return L;
      // forces on the full list, then back onto the half (a twin's push is mirrored onto its right twin)
      const fx = new Float64Array(L.length), fy = new Float64Array(L.length);
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const dx = L[j].x - L[i].x, dy = L[j].y - L[i].y, d = Math.hypot(dx, dy) || 0.01, need = (L[i].size + L[j].size) / 2 + gap;
        if (d < need) { const p = (need - d) / 2 + 0.5, ux = dx / d, uy = dy / d; fx[i] -= ux * p; fy[i] -= uy * p; fx[j] += ux * p; fy[j] += uy * p; }
      }
      // the fixed ones (a bleed) only push
      L.forEach((h, i) => { for (const q of fixed) { const dx = h.x - q.x, dy = h.y - q.y, d = Math.hypot(dx, dy) || 0.01, need = (h.size + q.size) / 2 + gap; if (d < need) { fx[i] += (dx / d) * (need - d + 0.5); fy[i] += (dy / d) * (need - d + 0.5); } } });
      L.forEach((h, i) => {
        // into the field and away from the two index corners, toward the middle
        if (!clear(h)) { fx[i] += (mx - h.x) * 0.04; fy[i] += (C.H / 2 - h.y) * 0.04; }
      });
      if (!mirror) half.forEach((p, i) => { p.x += fx[i]; p.y += fy[i]; });
      else {
        let q = 0;
        half.forEach((p, i) => {
          if (i >= half.length - axis) { p.y += fy[q]; q += 1; return; }
          p.x += (fx[q] - fx[q + 1]) / 2; p.y += (fy[q] + fy[q + 1]) / 2;
          p.x = Math.max(p.x, mx + (p.size + gap) / 2);
          q += 2;
        });
      }
    }
    half.forEach((p) => { p.size *= 0.93; });
    if (half.some((p) => p.size < floor)) return null;
  }
  return null;
}
// the layout traits, read off the pips: shape from how the centres spread, symmetry, and scale from the sizes
function measureLayout(pips) {
  const n = pips.length;
  const symmetry = pips.some((p) => p.twin !== undefined) ? 'mirror' : 'none';
  const sz = pips.map((p) => p.size), ratio = Math.max(...sz) / Math.min(...sz);
  const scale = ratio < 1.25 ? 'even' : ratio > 2.3 ? 'giant' : 'varied';
  if (n === 1) return { layout: 'solo', symmetry: 'none', scale: 'even' };
  const cx = pips.reduce((a, p) => a + p.x, 0) / n, cy = pips.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pips) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy); }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = Math.max(1e-6, tr - l1);
  const elong = Math.sqrt(l1 / l2);
  const ds = pips.map((p) => Math.hypot(p.x - cx, p.y - cy)), md = ds.reduce((a, b) => a + b, 0) / n;
  const cv = Math.sqrt(ds.reduce((a, d) => a + (d - md) ** 2, 0) / n) / (md || 1);
  const layout = n >= 4 && cv < 0.2 && elong < 2 ? 'ring' : elong > 4 ? 'line' : elong > 1.9 ? 'arc' : 'cloud';
  return { layout, symmetry, scale };
}
// few pips need room between them, or their bands are too short to read
const gapFor = (n) => (n === 2 ? 260 : n === 3 ? 160 : 34);
function scatter(r, n) {
  let k = n === 1 ? 1 : Math.min(1.25, Math.max(0.72, Math.sqrt(7 / n)));
  for (let round = 0; round < 40; round++) {
    const sizes = n === 1 ? [r.range(300, 380)] : [r.range(250, 300) * k, ...Array.from({ length: n - 1 }, () => r.range(95, 165) * k)];
    const placed = [];
    for (const s of sizes) {
      for (let t = 0; t < 1500; t++) {
        const h = { x: r.range(FIELD.x0 + s / 2, FIELD.x1 - s / 2), y: r.range(FIELD.y0 + s / 2, FIELD.y1 - s / 2), size: s };
        if (!clear(h) || !apart([...placed, h], gapFor(n))) continue;
        placed.push(h);
        break;
      }
    }
    if (placed.length === n) return placed;
    if (round % 5 === 4) k *= 0.93;
  }
  return null;
}
function layoutFor(kind, r, n) {
  const cx = C.W / 2, cy = C.H / 2, k = Math.min(1.25, Math.max(0.7, Math.sqrt(7 / Math.max(n, 2))));
  const minSize = n >= 8 ? 62 : 80;
  if (kind === 'classic') return D.pipLayout(n);
  if (kind === 'scatter') return scatter(r, n);
  if (kind === 'ring') {
    const hero = r.range(190, 240) * k, small = r.range(110, 140) * k, rx = r.range(250, 320), ryk = r.range(1.2, 1.55);
    const a0 = r.range(0, Math.PI * 2), oy = r.range(-40, 40), jit = Array.from({ length: n - 1 }, () => r.range(-0.12, 0.12));
    return settle((s, p) => [{ x: cx, y: cy + oy, size: hero * s },
      ...jit.map((j, i) => {
        const a = a0 + (Math.PI * 2 * i) / (n - 1) + j;
        return { x: cx + rx * p * Math.cos(a), y: cy + oy + rx * ryk * p * Math.sin(a), size: small * s };
      })], minSize, gapFor(n));
  }
  if (kind === 'column') {
    const amp = r.range(40, 150), freq = r.range(0.5, 1.4), ph = r.range(0, Math.PI * 2), big = r.int(0, n - 1);
    const base = r.range(110, 135) * k, heroK = r.range(1.35, 1.7);
    return settle((s, p) => Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      return { x: cx + amp * p * Math.sin(Math.PI * 2 * freq * t + ph), y: cy + (t - 0.5) * 960 * p, size: (i === big ? base * heroK : base) * s };
    }), minSize, gapFor(n));
  }
  const x0 = r.range(600, 740), x1 = r.range(260, 400), bend = r.range(-220, 220);
  const grow = r() < 0.5, smin = r.range(95, 120) * k, smax = r.range(170, 225) * k;
  const sizes = Array.from({ length: n }, (_, i) => (n === 1 ? smax : smax + (smin - smax) * (grow ? 1 - i / (n - 1) : i / (n - 1))));
  const curve = [];
  for (let q = 0; q <= 240; q++) {
    const t = q / 240, u = 1 - t;
    curve.push([u * u * x0 + 2 * u * t * ((x0 + x1) / 2 + bend) + t * t * x1, u * u * 240 + 2 * u * t * 700 + t * t * 1160]);
  }
  const cum = [0];
  for (let q = 1; q < curve.length; q++) cum.push(cum[q - 1] + Math.hypot(curve[q][0] - curve[q - 1][0], curve[q][1] - curve[q - 1][1]));
  const at = (len) => {
    let q = 1;
    while (q < cum.length - 1 && cum[q] < len) q++;
    const u = (len - cum[q - 1]) / (cum[q] - cum[q - 1] || 1);
    return [curve[q - 1][0] + (curve[q][0] - curve[q - 1][0]) * u, curve[q - 1][1] + (curve[q][1] - curve[q - 1][1]) * u];
  };
  const total = cum[cum.length - 1];
  return settle((s, p) => {
    const sz = sizes.map((v) => v * s);
    let need = 0;
    for (let i = 0; i < n - 1; i++) need += (sz[i] + sz[i + 1]) / 2 + Math.max(40, gapFor(n));
    let len = Math.max(0, (total - need) / 2);
    return sz.map((size, i) => {
      if (i > 0) len += (sz[i - 1] + size) / 2 + Math.max(40, gapFor(n));
      const [px, py] = at(len);
      return { x: cx + (px - cx) * p, y: cy + (py - cy) * p, size };
    });
  }, minSize, gapFor(n));
}

// ---------- ties between pips ----------
// the first pip (nearest to i) that the straight tie i -> j would run through, or -1
function blocker(pips, i, j) {
  const ax = pips[i].x, ay = pips[i].y, dx = pips[j].x - ax, dy = pips[j].y - ay, L2 = dx * dx + dy * dy;
  let best = -1, bt = 2;
  for (let k = 0; k < pips.length; k++) {
    if (k === i || k === j) continue;
    const t = ((pips[k].x - ax) * dx + (pips[k].y - ay) * dy) / L2;
    if (t <= 0 || t >= 1) continue;
    if (Math.hypot(ax + t * dx - pips[k].x, ay + t * dy - pips[k].y) < pips[k].size * 0.5 + 14 && t < bt) { bt = t; best = k; }
  }
  return best;
}
function pairsFor(kind, pips, r) {
  const n = pips.length, d = (i, j) => Math.hypot(pips[i].x - pips[j].x, pips[i].y - pips[j].y);
  if (n === 1) return [];
  const edges = new Map();
  const add = (i, j) => { if (i !== j) edges.set(Math.min(i, j) + '-' + Math.max(i, j), [i, j]); };
  const byDist = (i, pool) => pool.filter((j) => j !== i).sort((a, b) => d(i, a) - d(i, b));
  const all = [...Array(n).keys()];
  if (kind === 'nearest' || kind === 'web') {
    // the k nearest pips that can be reached without crossing another; a pip left with none keeps its nearest
    const k = kind === 'web' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const open = byDist(i, all).filter((j) => blocker(pips, i, j) < 0);
      for (const j of (open.length ? open : byDist(i, all)).slice(0, k)) add(i, j);
    }
  } else if (kind === 'chain') {
    let cur = r.int(0, n - 1);
    const seen = new Set([cur]);
    while (seen.size < n) {
      const left = byDist(cur, all.filter((j) => !seen.has(j)));
      const next = left.find((j) => blocker(pips, cur, j) < 0) ?? left[0];
      add(cur, next); seen.add(next); cur = next;
    }
  } else {
    // star: every pip ties toward the largest; a spoke that would cross a pip stops at that pip
    const toMid = (i) => Math.hypot(pips[i].x - C.W / 2, pips[i].y - C.H / 2);
    const hero = [...all].sort((a, b) => pips[b].size - pips[a].size || toMid(a) - toMid(b))[0];
    for (let i = 0; i < n; i++) if (i !== hero) { const b = blocker(pips, i, hero); add(i, b >= 0 ? b : hero); }
  }
  return [...edges.values()];
}

// ---------- helpers ----------
function resample(poly, n) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push([a, b, l]); total += l;
  }
  const out = [];
  let k = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * total;
    while (k < seg.length - 1 && acc + seg[k][2] < t) { acc += seg[k][2]; k++; }
    const [a, b, l] = seg[k], u = Math.min(1, (t - acc) / (l || 1));
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
// arc of 2*half+1 nails centred on the nail facing T, with the facing direction turned by `turn` rad
function facingArc(nails, c, T, half, shift, turn = 0) {
  const ca = Math.cos(turn), sa = Math.sin(turn);
  const tx = T[0] - c[0], ty = T[1] - c[1];
  const dx = tx * ca - ty * sa, dy = tx * sa + ty * ca, dl = Math.hypot(dx, dy) || 1;
  let best = 0, bv = -Infinity;
  nails.forEach(([x, y], i) => {
    const vx = x - c[0], vy = y - c[1], v = (vx * dx + vy * dy) / ((Math.hypot(vx, vy) || 1) * dl);
    if (v > bv) { bv = v; best = i; }
  });
  const arc = [];
  for (let k = -half; k <= half; k++) arc.push(nails[(best + shift + k + nails.length * 4) % nails.length]);
  return arc;
}
const seg = (p, q) => `M${C.f1(p[0])} ${C.f1(p[1])}L${C.f1(q[0])} ${C.f1(q[1])}`;
const stopsSvg = (stops) => stops.map((c, i) => `<stop offset="${i / Math.max(1, stops.length - 1)}" stop-color="${c}"/>`).join('');

// one band of thread between two nail arcs, in a style
// the threads of one band, as [from, to] pairs
function bandThreads(style, a, b, r) {
  const m = a.length, out = [];
  if (style === 'crossed') for (let i = 0; i < m; i++) out.push([a[i], b[i]]);
  else if (style === 'straight') for (let i = 0; i < m; i++) out.push([a[i], b[m - 1 - i]]);
  else if (style === 'faro') { const h = Math.ceil(m / 2); for (let i = 0; i < m; i++) out.push([a[i], b[i < h ? 2 * i : 2 * (i - h) + 1]]); }
  else if (style === 'lattice') for (let i = 0; i < m; i += 2) { out.push([a[i], b[i]]); out.push([a[i], b[m - 1 - i]]); }
  else if (style === 'twist') { const k = Math.max(1, Math.round(m * r.range(0.25, 0.45))); for (let i = 0; i < m; i++) out.push([a[i], b[(m - 1 - i + k) % m]]); }
  else { // fan: every thread leaves from a few nails at one end and spreads over the other
    const [p, q] = r() < 0.5 ? [a, b] : [b, a];
    const mid = Math.floor(m / 2), w = Math.max(1, Math.round(m / 8));
    for (let i = 0; i < m; i++) out.push([p[mid - w + (i % (2 * w + 1))], q[i]]);
  }
  return out;
}
// three interleaved strands per band: one path would paint its own crossings once; separate strands
// overlap, so the waist of an hourglass builds up density the way real thread does
function strands(threads) {
  const d = ['', '', ''];
  threads.forEach(([p, q], i) => { d[i % 3] += seg(p, q); });
  return d.filter(Boolean);
}
const WEIGHTS = { fine: [0.8, 1.15], regular: [1.2, 1], heavy: [1.8, 0.82], mark: [2.9, 1], sword: [5.2, 1] }; // stroke width, opacity factor
// a nail is a pin: a dot with a small highlight up and to the left
let GLINT = true; // off on flat palettes, set per render
let THEME = null; // { name, r } while a themed card renders
let YOYO = false; // the machine description carries the yoyo plan
let MOTION = null; // the motion asked for (yoyo, coins, unravel, breath, caustic)
let LASTW = null; // the weave drawObject0 just drew, for the caustic dance
let NATIVE = null; // the seed's own palette, set by traitsFor
let PHANTOM = false;
let DKC = null; // the named deck while a card of it composes (v26) // the card's pips are not drawn (rare switch)
const THEMES = {
  pearl: { palettes: ['noir', 'phantom', 'echo', 'frost', 'nacre'], ground: 'none', nail: 'pearl', bead: { core: '#fffaf2' } },
  fire: { palettes: ['ember', 'afterglow', 'blaze'], ground: 'sparks', bead: { core: '#ffe2a0', glow: '#ff7a3d' } },
  paper: { palettes: ['paper', 'ghost', 'mist', 'whisper', 'inkbleed'], ground: 'geometry' },
  bone: { palettes: ['bone', 'smoke', 'cream', 'kraft', 'rosewood', 'twotone'], ground: 'linen' },
  silver: { palettes: ['chrome', 'silverfade'], ground: 'brushed', bead: { core: '#ffffff' } },
  gold: { palettes: ['gilded', 'goldfade'], ground: 'leaf', bead: { core: '#fbe7a6', glow: '#b8892e' } },
  eclipse: { palettes: ['eclipse', 'eclipse2', 'eclipse3'], ground: 'none' },
  aurora: { palettes: ['aurora', 'polar'], ground: 'stars', ink: 'thread' },
};
const themeOf = (palette) => Object.keys(THEMES).find((k) => THEMES[k].palettes.includes(palette)) || null;
let COLLECT = null; // { bands: [], objs: [], nail } while describing the machine
let MACH = null; // { turns: { id: turns per loop }, w, objs, belt: bead travel per loop } while animating

// ---------- the machine ----------
const LOOP = 60; // seconds; the whole machine repeats exactly every LOOP seconds
const BEAD = 24; // bead spacing (dash 2 + gap 22)
const flowing = (attr, to) => `<animate attributeName="${attr}" from="0" to="${to}" dur="${LOOP}s" repeatCount="indefinite"/>`;
// a group turning steadily about (cx, cy), a whole number of turns per loop
const turning = (cx, cy, turns, inner) => `<g><animateTransform attributeName="transform" type="rotate" from="0 ${C.f1(cx)} ${C.f1(cy)}" to="${turns * 360} ${C.f1(cx)} ${C.f1(cy)}" dur="${LOOP}s" repeatCount="indefinite"/>${inner}</g>`;
const CROSSED = { crossed: true, twist: true, lattice: true };
// objs: [{ c: [x, y], size, id }]; bands carry ends: [i, j] into objs. Returns degrees per tick by id.
function planMachine(objs, bands, r) {
  const n = objs.length, w = new Array(n).fill(null), adj = Array.from({ length: n }, () => []);
  const seen = new Set();
  for (const b of bands) {
    if (!b.ends) continue;
    const [i, j] = b.ends, k = Math.min(i, j) + '-' + Math.max(i, j);
    if (i === j || seen.has(k)) continue;
    seen.add(k);
    const flip = CROSSED[b.style] ? -1 : 1;
    adj[i].push([j, flip]); adj[j].push([i, flip]);
  }
  const motor = objs.reduce((m, o, i) => (o.size > objs[m].size ? i : m), 0);
  const base = 2 * (r() < 0.5 ? 1 : -1); // the motor makes 2 turns a loop
  const rm = objs[motor].size;
  w[motor] = base;
  const queue = [motor];
  while (queue.length) {
    const i = queue.shift();
    for (const [j, flip] of adj[i]) if (w[j] === null) { w[j] = w[i] * (objs[i].size / objs[j].size) * flip; queue.push(j); }
  }
  // a pip on no belt still turns with the motor's rim speed, against its nearest neighbour
  w.forEach((v, i) => { if (v === null) w[i] = -base * (rm / objs[i].size); });
  // whole turns per loop: the pulley ratio rounded to a half turn of the motor, at least 1, at most 14
  const turns = {};
  objs.forEach((o, i) => { turns[o.id] = Math.sign(w[i]) * Math.min(14, Math.max(1, Math.round(Math.abs(w[i])))); });
  // the belt runs at the motor's rim speed (2 turns of a pulley of radius size/2), in whole bead spacings
  const belt = Math.max(1, Math.round((Math.abs(base) * Math.PI * rm) / BEAD)) * BEAD;
  return { turns, w, objs, belt };
}
const YOYO_CYCLES = 4; // yoyo cycles per loop (15 s each)
// the yoyo plan: a tree from the hand (the largest pip) over the ties, breadth first; a pip on no tie hangs
// from the hand. Per pip: its parent p, the unit vector from parent to pip (ux, uy), how far it slides (amp:
// 22% of the tie, 12..120, shrunk until its box stays on the card at full reach even if every pip above it
// is at full reach too), the turn at full reach (spin, radians: half a turn for a pip the size of the hand,
// more for smaller ones, its sign from the machine so crossed belts still turn the other way), and its lag
// (0.09 of a cycle per level, at most 0.27, under 1/pi so the eased phase never runs backwards).
function planYoyo(objs, bands, plan) {
  const n = objs.length, adj = Array.from({ length: n }, () => []);
  for (const b of bands) { if (!b.ends) continue; const [i, j] = b.ends; if (i !== j) { adj[i].push(j); adj[j].push(i); } }
  const hand = objs.reduce((m, o, i) => (o.size > objs[m].size ? i : m), 0);
  const parent = new Array(n).fill(-1), depth = new Array(n).fill(0), order = [hand];
  parent[hand] = hand;
  for (let q = 0; q < order.length; q++) { const i = order[q]; for (const j of adj[i]) if (parent[j] < 0) { parent[j] = i; depth[j] = depth[i] + 1; order.push(j); } }
  for (let i = 0; i < n; i++) if (parent[i] < 0) { parent[i] = hand; depth[i] = 1; order.push(i); }
  const sgn = (i) => Math.sign(plan.turns[objs[i].id]) || 1;
  const out = new Array(n), reach = new Array(n);
  for (const i of order) {
    const o = objs[i];
    if (i === hand) { out[i] = { p: i, ux: 0, uy: 0, amp: 0, spin: sgn(i) * Math.PI * 0.12, lag: 0 }; reach[i] = [0, 0]; continue; }
    const P = objs[parent[i]], dx = o.centre[0] - P.centre[0], dy = o.centre[1] - P.centre[1], L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, half = o.size / 2;
    let amp = Math.max(12, Math.min(120, L * 0.22));
    const fits = (a) => { const x = o.centre[0] + reach[parent[i]][0] + ux * a, y = o.centre[1] + reach[parent[i]][1] + uy * a; return x - half > 24 && x + half < C.W - 24 && y - half > 24 && y + half < C.H - 24; };
    while (amp > 4 && !fits(amp)) amp *= 0.8;
    if (!fits(amp)) amp = 0;
    reach[i] = [reach[parent[i]][0] + ux * amp, reach[parent[i]][1] + uy * amp];
    const spin = sgn(i) * Math.PI * Math.max(0.5, Math.min(2, objs[hand].size / o.size));
    out[i] = { p: parent[i], ux: round2(ux), uy: round2(uy), amp: round2(amp), spin: round2(spin), lag: Math.min(0.27, 0.09 * depth[i]) };
  }
  return { cycles: YOYO_CYCLES, order, objs: out };
}
// the caustic plan: per woven pip its rim (the nails), the weave's reaches, width and opacity, how high its
// multiplier climbs (3..7) and how often a loop (1 or 2); per eye pip the eye; a twin copies its lead
function planCaustic(objs, seed, T) {
  const r = C.rng((seed * 362437 + 5) >>> 0), tw = twinsOf(objs), out = [];
  objs.forEach((o, i) => {
    const wv = o.weave;
    if (!wv) { out.push(null); return; }
    const lead = tw[i] >= 0 && tw[i] < i && out[tw[i]] ? out[tw[i]] : null;
    const top = lead ? lead.top : r.pick([2, 3, 4, 5]), cyc = lead ? lead.cyc : r.pick([1, 1, 2]);
    const p = { ring: o.ring.map(([x, y]) => [C.f1(x), C.f1(y)]), ks: wv.empty ? [0] : wv.ks, w: wv.w, op: wv.op, top, cyc };
    if (wv.rimOnly) { p.rimOnly = true; p.ks = []; }
    if (wv.eye && wv.pairs) {
      // the eye's own threads: [nail, rim point in nail units]
      p.pairs = wv.pairs.map(([a, j]) => [a, round2(j / wv.fine)]);
      p.ks = [];
      if (T.eye && T.eye.dot && wv.pupil) p.dot = { c: wv.pupil.c.map(round2), r: round2(Math.max(2.5, wv.pupil.R * 0.32)) };
      if (wv.face) { p.face = wv.face; p.pairs = null; }
    }
    out.push(p);
  });
  // which way each one turns (its own stream, so the dance's draws above stay where they were)
  const rs = C.rng((seed * 2246822519 + 3) >>> 0), s0 = rs() < 0.5 ? 1 : -1, spin = rs.pick(['same', 'counter', 'mixed']);
  const big = Math.max(...objs.map((o) => o.size || 0));
  out.forEach((p, i) => {
    if (!p) return;
    const lead = tw[i] >= 0 && tw[i] < i && out[tw[i]] ? out[tw[i]] : null;
    p.dir = ROT ? 0 : lead ? -lead.dir : spin === 'same' ? s0 : spin === 'counter' ? (i % 2 ? -s0 : s0) : rs() < 0.5 ? 1 : -1;
    // turns a loop: the largest one 1, smaller ones more (up to 3), so even one way round the web twists between them
    p.k = lead ? lead.k : Math.max(1, Math.min(3, Math.round(big / Math.max(1, objs[i].size))));
  });
  return { objs: out, ink: COLLECT.ink, spin };
}
// mirror twins: for each object the index of its mirror image across the card's middle, itself when it sits on
// that axis, -1 when it has none
function twinsOf(objs) {
  if (objs.length === 1) return [-1]; // a lone pip (an ace, a nest) has nothing to mirror: it moves freely
  return objs.map((o, i) => {
    if (Math.abs(o.centre[0] - C.W / 2) < 0.5 && (!ROT || Math.abs(o.centre[1] - C.H / 2) < 0.5)) return i;
    return objs.findIndex((q, j) => j !== i && Math.abs(q.centre[0] - (C.W - o.centre[0])) < 0.5 && Math.abs(q.centre[1] - (ROT ? C.H - o.centre[1] : o.centre[1])) < 0.5 && Math.abs(q.size - o.size) < 0.5);
  });
}
// the plan for the motion asked for; a twin copies its lead (the lower index) as a mirror image
function playPlans(objs, seed) {
  if (MOTION !== 'coins' && MOTION !== 'unravel' && MOTION !== 'breath') return {};
  const r = C.rng((seed * 69069 + 4241) >>> 0), tw = twinsOf(objs), out = new Array(objs.length);
  const hand = objs.reduce((m, o, i) => (o.size > objs[m].size ? i : m), 0);
  objs.forEach((o, i) => {
    const lead = tw[i] >= 0 && tw[i] < i ? tw[i] : -1, axis = tw[i] === i, half = o.size / 2;
    if (MOTION === 'coins') {
      // turns a loop and the axis angle (radians from vertical)
      if (lead >= 0) { out[i] = { k: out[lead].k, ax: -out[lead].ax }; return; }
      const k = i === hand ? 1 : r.pick([1, 2, 3]), ax = axis ? 0 : r.range(-0.6, 0.6);
      out[i] = { k, ax: round2(ax) };
    } else if (MOTION === 'unravel') {
      // a Lissajous wander scaled by sin^2 (2 tangles a loop) and a turn; mx = -1 mirrors the x travel
      if (lead >= 0) { const L = out[lead]; out[i] = { ...L, mx: -1, spin: -L.spin }; return; }
      let A = r.range(70, 170);
      const room = Math.min(o.centre[0] - half - 24, C.W - 24 - o.centre[0] - half, o.centre[1] - half - 24, C.H - 24 - o.centre[1] - half);
      A = Math.max(0, Math.min(A, room));
      out[i] = { ax: axis ? 0 : round2(A), ay: round2(A * r.range(0.6, 1)), nx: r.int(1, 3), ny: r.int(1, 3), px: round2(r.range(0, 6.283)), py: round2(r.range(0, 6.283)),
        spin: axis ? 0 : round2(r.range(0.4, 1.2) * Math.PI * (r() < 0.5 ? 1 : -1)), mx: 1 };
    } else {
      // breath: a turn of A radians on n slow waves a loop, a swell of B on m
      if (lead >= 0) { out[i] = { ...out[lead], a: -out[lead].a }; return; }
      out[i] = { a: axis ? 0 : round2(r.range(0.035, 0.1) * (r() < 0.5 ? 1 : -1)), n: r.int(1, 3), b: round2(r.range(0.01, 0.035)), m: r.int(1, 2) };
    }
  });
  return { [MOTION]: { cycles: MOTION === 'unravel' ? 2 : 1, objs: out } };
}
// the threads of a band as two paths, each segment oriented the way its belt travels
function beltPaths(band, threads) {
  const [i] = band.ends, o = MACH.objs[i], wr = (MACH.w[i] * Math.PI) / 180;
  let fwd = '';
  for (const [p, q] of threads) {
    const vx = -wr * (p[1] - o.c[1]), vy = wr * (p[0] - o.c[0]);
    const along = vx * (q[0] - p[0]) + vy * (q[1] - p[1]);
    fwd += along >= 0 ? seg(p, q) : seg(q, p);
  }
  return fwd;
}
const pin = (x, y, rad, fill) => (THEME && THEMES[THEME.name].nail === 'pearl' ? pearl(x, y, rad) : `<circle cx="${C.f1(x)}" cy="${C.f1(y)}" r="${rad}" fill="${fill}"/>` + (GLINT ? `<circle cx="${C.f1(x - rad * 0.32)}" cy="${C.f1(y - rad * 0.32)}" r="${C.f1(rad * 0.38)}" fill="#ffffff" fill-opacity="0.55"/>` : ''));
// a pearl: a warm white bead, a faint rose rim low on the right, a bright point high on the left
const pearl = (x, y, rad) => { const R = rad * 1.3; return `<circle cx="${C.f1(x)}" cy="${C.f1(y)}" r="${C.f1(R)}" fill="#e9e2d8"/>` +
  `<circle cx="${C.f1(x + R * 0.22)}" cy="${C.f1(y + R * 0.22)}" r="${C.f1(R * 0.72)}" fill="#d9c8cf" fill-opacity="0.55"/>` +
  `<circle cx="${C.f1(x - R * 0.12)}" cy="${C.f1(y - R * 0.12)}" r="${C.f1(R * 0.62)}" fill="#f6f2ec"/>` +
  `<circle cx="${C.f1(x - R * 0.36)}" cy="${C.f1(y - R * 0.36)}" r="${C.f1(R * 0.26)}" fill="#ffffff"/>`; };

// ---------- paint ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const stopList = (stops) => stops.map((s, i) => (Array.isArray(s) ? s : [i / Math.max(1, stops.length - 1), s]));
function geometry(spec, ctx) {
  if (spec.type === 'linear') {
    const a = (spec.angle * Math.PI) / 180, ex = Math.cos(a) * 860, ey = Math.sin(a) * 860;
    return { x1: 500 - ex, y1: 700 - ey, x2: 500 + ex, y2: 700 + ey };
  }
  const c = spec.at === 'hero' ? ctx.hero : { x: C.W / 2, y: C.H / 2 };
  return { cx: c.x, cy: c.y, r: spec.r || 900 };
}
// returns the value for a fill/stroke attribute, adding a gradient to defs when the spec needs one
function paint(spec, id, ctx) {
  if (typeof spec === 'string') return spec;
  const g = geometry(spec, ctx);
  const stops = stopList(spec.stops).map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  if (spec.type === 'linear') ctx.defs += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${C.f1(g.x1)}" y1="${C.f1(g.y1)}" x2="${C.f1(g.x2)}" y2="${C.f1(g.y2)}">${stops}</linearGradient>`;
  else ctx.defs += `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${C.f1(g.cx)}" cy="${C.f1(g.cy)}" r="${C.f1(g.r)}">${stops}</radialGradient>`;
  return `url(#${id})`;
}
// the colour a spec has at one point (used for the corner index, which sits in a rotated group)
function sample(spec, x, y, ctx) {
  if (typeof spec === 'string') return spec;
  const g = geometry(spec, ctx);
  let t;
  if (spec.type === 'linear') {
    const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
    t = ((x - g.x1) * dx + (y - g.y1) * dy) / (dx * dx + dy * dy);
  } else t = Math.hypot(x - g.cx, y - g.cy) / g.r;
  t = Math.max(0, Math.min(1, t));
  const st = stopList(spec.stops);
  let k = 1;
  while (k < st.length - 1 && st[k][0] < t) k++;
  const [o0, c0] = st[k - 1], [o1, c1] = st[k], u = o1 > o0 ? (t - o0) / (o1 - o0) : 0;
  const a = hex(c0), b = hex(c1);
  return toHex(a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, u))));
}

function paintSetup(P, T, hero, bandsRef) {
  const ctx = { defs: '', hero };
  const boardFill = paint(P.board, 'brd', ctx);
  const inkSpec = P.ink || (D.RED[T.suit] ? P.red : P.black);
  const ink = paint(inkSpec, 'ink', ctx);
  const th = typeof P.thread === 'string' ? { type: 'solid', stops: [P.thread] } : P.thread;
  const threadAll = th.type === 'linear' || th.type === 'radial' ? paint(th, 'thr', ctx) : null;
  const nail = P.nail === 'thread' ? (threadAll || th.stops[0]) : P.nail;
  const indexColor = P.index === 'sample' ? [sample(inkSpec, 92, 160, ctx), sample(inkSpec, C.W - 92, C.H - 160, ctx)] : P.index || (typeof inkSpec === 'string' ? inkSpec : sample(inkSpec, 92, 160, ctx));
  const strokeFor = (bi, band) => {
    if (th.type === 'solid') return th.stops[0];
    if (th.type === 'alt') return th.stops[bi % th.stops.length];
    if (th.type === 'band') {
      const m = (arc) => arc[Math.floor(arc.length / 2)];
      const [p, q] = bi % 2 ? [m(band.b), m(band.a)] : [m(band.a), m(band.b)];
      ctx.defs += `<linearGradient id="b${bi}" gradientUnits="userSpaceOnUse" x1="${C.f1(p[0])}" y1="${C.f1(p[1])}" x2="${C.f1(q[0])}" y2="${C.f1(q[1])}">${stopList(th.stops).map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
      return `url(#b${bi})`;
    }
    return threadAll;
  };
  // the same paint as plain data, for the player
  const asSpec = (spec) => {
    const g = geometry(spec, ctx);
    return spec.type === 'linear' ? { type: 'linear', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, stops: stopList(spec.stops) } : { type: 'radial', cx: g.cx, cy: g.cy, r: g.r, stops: stopList(spec.stops) };
  };
  strokeFor.spec = (bi, band) => {
    if (th.type === 'solid') return { type: 'solid', color: th.stops[0] };
    if (th.type === 'alt') return { type: 'solid', color: th.stops[bi % th.stops.length] };
    if (th.type === 'band') {
      const m = (arc) => arc[Math.floor(arc.length / 2)];
      const [p, q] = bi % 2 ? [m(band.b), m(band.a)] : [m(band.a), m(band.b)];
      return { type: 'linear', x1: p[0], y1: p[1], x2: q[0], y2: q[1], stops: stopList(th.stops) };
    }
    return asSpec(th);
  };
  if (COLLECT) COLLECT.nail = nail;
  // the pips' ink as plain data, for a player that draws the weave itself
  if (COLLECT) COLLECT.ink = typeof inkSpec === 'string' ? { type: 'solid', color: inkSpec } : inkSpec.type === 'linear' || inkSpec.type === 'radial' ? asSpec(inkSpec) : { type: 'solid', color: sample(inkSpec, C.W / 2, C.H / 2, ctx) };
  return { ctx, boardFill, ink, nail, indexColor, strokeFor };
}
// the threads of every band, the red one picked as the longest
function drawBands(bands, P, T, r, strokeFor, offset = 0) {
  const mid = (arc) => arc[Math.floor(arc.length / 2)];
  const len = (band) => Math.hypot(mid(band.a)[0] - mid(band.b)[0], mid(band.a)[1] - mid(band.b)[1]);
  let out = '';
  bands.forEach((band, k) => {
    const bi = k + offset;
    const [w0, of] = WEIGHTS[band.weight];
    const w = band.style === 'lattice' ? w0 * 0.85 : w0;
    const stroke = band.red ? P.accent : strokeFor(bi, band);
    const op = band.red ? 0.9 : Math.min(0.95, P.op * of * 0.8);
    for (const d of strands(bandThreads(band.style, band.a, band.b, r))) out += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${C.f1(w)}" stroke-opacity="${C.f1(op * 100) / 100}"/>`;
  });
  return out;
}
function markRed(T, bands) {
  if (T.accent !== 'red thread' || !bands.length) return;
  const mid = (arc) => arc[Math.floor(arc.length / 2)];
  const len = (band) => Math.hypot(mid(band.a)[0] - mid(band.b)[0], mid(band.a)[1] - mid(band.b)[1]);
  bands.reduce((best, b) => (len(b) > len(best) ? b : best), bands[0]).red = true;
}
// one object: its weave (clipped to its outline) and the outline thread; nails are drawn separately
// the eye weave: from every nail, the two threads tangent to the pupil circle, each run on to the nail
// nearest where it leaves the pip. No thread enters the circle, so it stays empty wherever it sits.
// E = { gx, gy, rho }: the gaze (-1..1 of the room the pupil has) and the pupil radius (share of size).
function rayExit(P, u, poly, tMin) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const ex = B[0] - A[0], ey = B[1] - A[1], den = u[0] * ey - u[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const wx = A[0] - P[0], wy = A[1] - P[1];
    const t = (wx * ey - wy * ex) / den, s = (wx * u[1] - wy * u[0]) / den;
    if (s >= 0 && s <= 1 && t > tMin && t < best) best = t;
  }
  return best === Infinity ? null : [P[0] + u[0] * best, P[1] + u[1] * best];
}
// v26f the face weave (see the head of patch26f). Everything is measured in the head's own frame (u across, v down,
// from its centre), so a turned twin weaves the turned face exactly.
let FACEW = null;
// STRUNG DECK living face, the one source for the still card (string26, patch26h) and the dance (page/player.js).
// faceDraw(R, F, f, loop, seg): the head pip's threads at loop share f. R = the head's nails (its rim), F = the face
// (string26 faceWeave): axes, each eye and the mouth as a set of convex shapes in the head's own frame (the eye
// itself, the lines of its lid and lashes, the pieces of a mouth line), the pupils, the motion.
// 1. From every other nail, the two threads tangent to each shape, run on to the rim, kept where they cross no shape:
//    every shape is a space the threads leave, a thin shape reads as a line drawn in the weave.
// 2. Inside each eye: an iris (chords of the iris circle tangent to the pupil) for some courts, then the pupil itself
//    woven dark (chords of the pupil circle tangent to a small light in it), all clipped to the eye's lids.
// 3. The king's beard ties, kept where they cross no shape.
// Motion, in whole cycles of the loop: the head turns (the face slides toward where it looks, the far eye narrows, the
// near eye widens), the pupils look round inside the eyes, the lids blink, the mouth opens and closes.
function fwCross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
// does segment p-q properly cross the polygon's edge (touching a vertex does not count)
function fwHits(p, q, poly) {
  const eps = 1e-3 * (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + 1);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d1 = fwCross(p, q, a), d2 = fwCross(p, q, b);
    if (Math.abs(d1) < eps || Math.abs(d2) < eps || d1 * d2 > 0) continue;
    const d3 = fwCross(a, b, p), d4 = fwCross(a, b, q);
    if (d3 * d4 < 0) return true;
  }
  return false;
}
// where the ray from P along (ux, uy) leaves the closed polygon R, beyond distance t0
const fwEdges = new WeakMap();
function fwExit(R, P, ux, uy, t0) {
  let E = fwEdges.get(R);
  if (!E) { const n = R.length; E = new Float64Array(4 * n); for (let i = 0; i < n; i++) { const A = R[i], B = R[(i + 1) % n]; E[4 * i] = A[0]; E[4 * i + 1] = A[1]; E[4 * i + 2] = B[0] - A[0]; E[4 * i + 3] = B[1] - A[1]; } fwEdges.set(R, E); }
  let best = Infinity;
  const px = P[0], py = P[1];
  for (let i = 0; i < E.length; i += 4) {
    const ex = E[i + 2], ey = E[i + 3], den = ux * ey - uy * ex;
    if (den < 1e-9 && den > -1e-9) continue;
    const wx = E[i] - px, wy = E[i + 1] - py, t = (wx * ey - wy * ex) / den;
    if (t <= t0 + 1e-6 || t >= best) continue;
    const s = (wx * uy - wy * ux) / den;
    if (s >= -1e-9 && s <= 1 + 1e-9) best = t;
  }
  return best === Infinity ? null : [px + ux * best, py + uy * best];
}
// where the ray from nail i of the rim R leaves it, beyond t0: only the edges that can lie in the ray's direction are
// tried (per rim and nail, the edges each 1/96 of a turn round the nail meets, built once)
const fwBuckets = new WeakMap(), FWB = 96;
function fwExitNail(R, i, ux, uy, t0) {
  let Bk = fwBuckets.get(R);
  if (!Bk) { Bk = []; fwBuckets.set(R, Bk); }
  const n = R.length, P = R[i];
  let L = Bk[i];
  if (!L) {
    L = Array.from({ length: FWB }, () => []);
    for (let e = 0; e < n; e++) {
      if (e === i || (e + 1) % n === i) continue;
      const A = R[e], B = R[(e + 1) % n];
      let a = Math.atan2(A[1] - P[1], A[0] - P[0]), b = Math.atan2(B[1] - P[1], B[0] - P[0]);
      let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const lo = Math.min(a, a + d), hi = Math.max(a, a + d);
      for (let k = Math.floor(((lo + Math.PI) / (2 * Math.PI)) * FWB) - 1; k <= Math.floor(((hi + Math.PI) / (2 * Math.PI)) * FWB) + 1; k++) { const kk = ((k % FWB) + FWB) % FWB; if (L[kk][L[kk].length - 1] !== e) L[kk].push(e); }
    }
    Bk[i] = L;
  }
  const k = ((Math.floor(((Math.atan2(uy, ux) + Math.PI) / (2 * Math.PI)) * FWB) % FWB) + FWB) % FWB;
  let best = Infinity;
  for (const e of L[k]) {
    const A = R[e], B = R[(e + 1) % n], ex = B[0] - A[0], ey = B[1] - A[1], den = ux * ey - uy * ex;
    if (den < 1e-9 && den > -1e-9) continue;
    const wx = A[0] - P[0], wy = A[1] - P[1], t = (wx * ey - wy * ex) / den;
    if (t <= t0 + 1e-6 || t >= best) continue;
    const s = (wx * uy - wy * ux) / den;
    if (s >= -1e-9 && s <= 1 + 1e-9) best = t;
  }
  return best === Infinity ? null : [P[0] + ux * best, P[1] + uy * best];
}
// the two vertices of a convex polygon that the tangents from P touch (the most clockwise and the most counter-clockwise
// seen from P, compared by cross products); none when P is inside
function fwTangents(P, poly) {
  let ql = poly[0], qh = poly[0];
  for (let i = 1; i < poly.length; i++) {
    const q = poly[i];
    if ((ql[0] - P[0]) * (q[1] - P[1]) - (ql[1] - P[1]) * (q[0] - P[0]) < 0) ql = q;
    if ((qh[0] - P[0]) * (q[1] - P[1]) - (qh[1] - P[1]) * (q[0] - P[0]) > 0) qh = q;
  }
  // P inside (or the span not below a half turn): some vertex lies behind both
  for (const q of poly) if ((ql[0] - P[0]) * (q[1] - P[1]) - (ql[1] - P[1]) * (q[0] - P[0]) < -1e-9 || (qh[0] - P[0]) * (q[1] - P[1]) - (qh[1] - P[1]) * (q[0] - P[0]) > 1e-9) return [];
  return ql === qh ? [] : [ql, qh];
}
// a segment clipped to a convex polygon (null when it misses)
function fwClip(p, q, poly) {
  let cx = 0, cy = 0;
  for (const v of poly) { cx += v[0]; cy += v[1]; }
  cx /= poly.length; cy /= poly.length;
  const d = [q[0] - p[0], q[1] - p[1]];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    let nx = -(B[1] - A[1]), ny = B[0] - A[0];
    if (nx * (cx - A[0]) + ny * (cy - A[1]) < 0) { nx = -nx; ny = -ny; }
    const num = nx * (p[0] - A[0]) + ny * (p[1] - A[1]), den = nx * d[0] + ny * d[1];
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  return [[p[0] + d[0] * t0, p[1] + d[1] * t0], [p[0] + d[0] * t1, p[1] + d[1] * t1]];
}
// chords of the circle (C, r): from n points round it, the two threads tangent to the circle (H, h) inside it
function fwChords(C, r, H, h, n, out) {
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n, P = [C[0] + r * Math.cos(t), C[1] + r * Math.sin(t)];
    const dx = H[0] - P[0], dy = H[1] - P[1], L = Math.hypot(dx, dy);
    if (L <= h * 1.02) continue;
    const base = Math.atan2(dy, dx), half = Math.asin(h / L);
    for (const sg of [1, -1]) {
      const a = base + sg * half, ux = Math.cos(a), uy = Math.sin(a), s = -2 * ((P[0] - C[0]) * ux + (P[1] - C[1]) * uy);
      if (s > 0) out(P, [P[0] + ux * s, P[1] + uy * s]);
    }
  }
}
function faceDraw(R, F, f, loop, seg) {
  const TAU = 2 * Math.PI, mv = F.mv, N = R.length;
  const W = (u, v) => [F.c[0] + u * F.rv[0] + v * F.d[0], F.c[1] + u * F.rv[1] + v * F.d[1]];
  // this frame's pose
  const sw = Math.sin(TAU * mv.gk * f + mv.ph), sv = Math.sin(TAU * mv.vk * f + 1.7 * mv.ph);
  let bl = 0;
  for (const b of mv.bl) { const d = Math.abs(f - b), dd = Math.min(d, 1 - d) * loop; if (dd < 0.22) bl = Math.max(bl, 1 - dd / 0.22); }
  const lid = 1 - 0.92 * bl, mo = 1 + F.mo * Math.max(0, Math.sin(TAU * mv.mk * f + 0.6 * mv.ph)) ** 2;
  const du = (sw > 0 ? F.tp : F.tm) * sw;
  const shapes = [], eyes = [];
  for (const e of F.eyes) {
    const ts = sw * e.o, sx = 1 - 0.24 * Math.max(0, ts) + 0.07 * Math.max(0, -ts);
    const P = (x, y, b) => W(e.u + du + x * sx, e.v + (b ? e.va + (y - e.va) * lid : y));
    const main = e.shapes[0].map(([x, y]) => P(x, y, true));
    shapes.push(main);
    for (const s of e.shapes.slice(1)) shapes.push(s.map(([x, y]) => P(x, y, false)));
    const gu = (sw > 0 ? e.ap : e.am) * sw, gv = e.av * sv;
    eyes.push({ main, pc: P(e.pu + gu, e.pv + gv, false), e, sx });
  }
  const msx = 1 - 0.1 * Math.abs(sw);
  for (const s of F.mouth.shapes) shapes.push(s.map(([x, y]) => W(F.mouth.u + 0.6 * du + x * msx, F.mouth.v + (y > 0 ? y * mo : y))));
  const boxes = shapes.map((s) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; });
  const blocked = (p, q) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    for (let i = 0; i < shapes.length; i++) {
      const b = boxes[i];
      if (Math.max(p[0], q[0]) < b[0] || Math.min(p[0], q[0]) > b[2] || Math.max(p[1], q[1]) < b[1] || Math.min(p[1], q[1]) > b[3]) continue;
      const c1 = dx * (b[1] - p[1]) - dy * (b[0] - p[0]), c2 = dx * (b[1] - p[1]) - dy * (b[2] - p[0]), c3 = dx * (b[3] - p[1]) - dy * (b[0] - p[0]), c4 = dx * (b[3] - p[1]) - dy * (b[2] - p[0]);
      if ((c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) || (c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0)) continue;
      if (fwHits(p, q, shapes[i])) return true;
    }
    return false;
  };
  // 1. the head's threads round the shapes
  for (let i = 0; i < N; i++) {
    const P = R[i];
    for (const s of shapes) for (const T of fwTangents(P, s)) {
      const dx = T[0] - P[0], dy = T[1] - P[1], L = Math.hypot(dx, dy);
      if (L < 1) continue;
      const Q = fwExitNail(R, i, dx / L, dy / L, L);
      if (Q && !blocked(P, Q)) seg(P[0], P[1], Q[0], Q[1]);
    }
  }
  // 2. inside each eye, while it is open enough: the iris, then the pupil woven dark round its light
  for (const E of eyes) {
    if (lid < 0.3) continue;
    const e = E.e, k = 0.5 + 0.5 * E.sx, clip = (p, q) => { const c = fwClip(p, q, E.main); if (c) seg(c[0][0], c[0][1], c[1][0], c[1][1]); };
    if (e.ri) fwChords(E.pc, e.ri * k, E.pc, e.pr * k * 1.02, Math.max(24, Math.round((TAU * e.ri * k) / 2.4)), clip);
    const rp = e.pr * k, H = [E.pc[0] + e.hl[0] * rp * F.rv[0] + e.hl[1] * rp * F.d[0], E.pc[1] + e.hl[0] * rp * F.rv[1] + e.hl[1] * rp * F.d[1]];
    fwChords(E.pc, rp, H, rp * e.hr, Math.max(16, Math.round((TAU * rp) / 1.3)), clip);
  }
  // 3. the beard
  for (const [a, b] of F.beard || []) if (!blocked(R[a], R[b])) seg(R[a][0], R[a][1], R[b][0], R[b][1]);
}

// a closed convex curve centred on (0, 0), x outward, y down: an upper and a lower arc (1 - t^2)^pw meeting at the
// corners (top 0 = a flat lid)
function faceShape(w, top, bot, pw) {
  const P = [];
  for (let k = 0; k <= 18; k++) { const t = -1 + (2 * k) / 18; P.push([(t * w) / 2, -top * (1 - t * t) ** pw]); }
  for (let k = 17; k >= 1; k--) { const t = -1 + (2 * k) / 18; P.push([(t * w) / 2, bot * (1 - t * t) ** pw]); }
  return P;
}
// a thin lens from (x0, y0) to (x1, y1), th wide at its middle: a line in the weave
function faceSlit(x0, y0, x1, y1, th) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, P = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8, w = (th / 2) * Math.sqrt(1 - (2 * t - 1) ** 2); P.push([x0 + dx * t + nx * w, y0 + dy * t + ny * w]); }
  for (let k = 7; k >= 1; k--) { const t = k / 8, w = (th / 2) * Math.sqrt(1 - (2 * t - 1) ** 2); P.push([x0 + dx * t - nx * w, y0 + dy * t - ny * w]); }
  return P;
}
// a curved line as overlapping slits along y = sag (1 - (x / hw)^2) (sag > 0: the middle lower, a smile)
function faceArcLine(hw, sag, th, pieces) {
  const out = [], y = (x) => sag * (1 - (x / hw) ** 2);
  for (let k = 0; k < pieces; k++) { const x0 = -hw + (2 * hw * k) / pieces - (k ? 0.08 * hw : 0), x1 = -hw + (2 * hw * (k + 1)) / pieces + (k < pieces - 1 ? 0.08 * hw : 0); out.push(faceSlit(x0, y(x0), x1, y(x1), th)); }
  return out;
}
// each court's eye (in units of r, x outward) and mouth (in units of the mouth's room)
function courtEye(rank, r) {
  const T = (P, tilt) => P.map(([x, y]) => [x * Math.cos(tilt) + y * Math.sin(tilt), -x * Math.sin(tilt) + y * Math.cos(tilt)]);
  if (rank === 12) {
    // the visible eye a narrow bowl under a heavy lid; the lid arched in two strokes; the lashes a wing; a crease above
    const tl = 0.12, sl = (x0, y0, x1, y1, th) => T(faceSlit(x0 * r, y0 * r, x1 * r, y1 * r, th * r), tl);
    const main = T(faceShape(2.5 * r, 0, 0.24 * r, 0.8), tl);
    const lid = [sl(-1.4, 0.02, 0.05, -0.1, 0.22), sl(-0.1, -0.1, 1.55, 0.0, 0.22)];
    const wing = [sl(1.4, -0.02, 2.15, -0.42, 0.24)], crease = [];
    return { shapes: [main, ...lid, ...wing, ...crease], va: 0, pu: 0.05 * r, pv: -0.04 * r, pr: 0.38 * r, ri: 0, hl: [0, 0.4], hr: 0.14 };
  }
  if (rank === 13) {
    // level and clear: a flat narrow lens, the whole pupil in it, a straight line above it like a set brow
    const main = faceShape(2.3 * r, 0.24 * r, 0.3 * r, 0.45), brow = faceSlit(-1.3 * r, -0.5 * r, 1.3 * r, -0.5 * r, 0.17 * r);
    return { shapes: [main, brow], va: 0.03 * r, pu: 0, pv: 0.03 * r, pr: 0.2 * r, ri: 0, hl: [-0.3, -0.3], hr: 0.16, round: true };
  }
  return { shapes: [faceShape(2.5 * r, 0.5 * r, 0.5 * r, 1)], va: 0.25 * r, pu: 0, pv: 0, pr: 0.22 * r, ri: 0.46 * r, hl: [-0.35, -0.35], hr: 0.2 };
}
function courtMouth(rank, hw, mh, look) {
  const th = Math.max(5, 0.4 * mh);
  if (rank === 12) return { shapes: faceArcLine(0.62 * hw, 0.5 * mh, th, 7), mo: 0.15 };
  if (rank === 13) return { shapes: [faceSlit(-0.8 * hw, 0, 0.8 * hw, 0, th * 1.1)], mo: 0 };
  const P = faceShape(1.7 * hw, 0.08 * mh, 1.25 * mh, 0.6), t = 0.14 * (look || 1);
  return { shapes: [P.map(([x, y]) => [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t)])], mo: 0.45 };
}
function faceWeave(ring, poly, E) {
  const N = ring.length, cx = ring.reduce((t, p) => t + p[0], 0) / N, cy = ring.reduce((t, p) => t + p[1], 0) / N;
  const D = [-E.up[0], -E.up[1]], Rv = [-E.up[1], E.up[0]];
  const W = (u, v) => [cx + u * Rv[0] + v * D[0], cy + u * Rv[1] + v * D[1]];
  const loc = poly.map(([x, y]) => [(x - cx) * Rv[0] + (y - cy) * Rv[1], (x - cx) * D[0] + (y - cy) * D[1]]);
  const u0 = Math.min(...loc.map((q) => q[0])), u1 = Math.max(...loc.map((q) => q[0])), v0 = Math.min(...loc.map((q) => q[1])), v1 = Math.max(...loc.map((q) => q[1]));
  const size = Math.max(u1 - u0, v1 - v0), h = size / 90;
  const room = (u, v) => { const [x, y] = W(u, v); return C.pointInPoly(x, y, poly) ? C.distToPoly(x, y, poly) : -1; };
  // where the eyes and mouth go: the roomiest mirrored pair in the upper 0.7, the mouth on the axis below
  let eu = 0, ev = 0, ed = -1;
  for (let v = v0; v <= v0 + 0.7 * (v1 - v0); v += h) for (let u = u0; u <= -size * 0.06; u += h) { const d = Math.min(room(u, v), room(-u, v), -u * 0.8); if (d > ed) { ed = d; eu = u; ev = v; } }
  const rE = Math.min(0.42 * ed, 0.075 * size) * (E.fs || 1);
  let vb = ev; for (let v = ev; v <= v1; v += h) { if (room(0, v) >= 0.8 * rE) vb = v; else if (v > ev + 2 * rE) break; }
  const vm = ev + 0.55 * (vb - ev), dm = Math.max(4, room(0, vm));
  const J = E.rank === 11 && E.look;
  let sh = J ? E.look * 0.42 * Math.abs(eu) : 0;
  const ok = (u, v, r) => room(u, v) > r * 1.15;
  if (J) for (let t = 0; t < 20 && !(ok(eu + sh, ev, rE) && ok(-eu + sh, ev, rE)); t++) sh *= 0.85;
  const near = J ? (E.look > 0 ? 1 : 0) : -1;
  const fits = (Ps, u, v, m = 3) => Ps.every((P) => P.every(([x, y]) => room(u + x, v + y) > m));
  const r2 = (x) => Math.round(x * 100) / 100, rp = (P) => P.map(([x, y]) => [r2(x), r2(y)]);
  const eyes = [0, 1].map((k) => {
    const o = k ? 1 : -1, u = (k ? -eu : eu) + sh;
    let r = 1.45 * rE * (J && k !== near ? 0.8 : 1), EY;
    for (let t = 0; t < 30; t++) { EY = courtEye(E.rank, r); EY.shapes = EY.shapes.map((P) => P.map(([x, y]) => [x * o, y])); if (fits(EY.shapes, u, ev)) break; r *= 0.93; }
    const M = EY.shapes[0], pr = EY.pr;
    // how far the pupil may go each way: its centre stays inside the eye, clear of the corners
    const flat = E.rank === 12, test = (x, y) => C.pointInPoly(x, flat ? y + 0.35 * pr : y, M) && C.distToPoly(x, flat ? y + 0.35 * pr : y, M) >= (flat ? 0.3 * pr : Math.max(pr * 1.3, EY.ri * 0.55));
    const reach = (dx, dy) => { let m = 0; for (let t = 0; t <= 2 * r; t += 0.5) { if (test(EY.pu + dx * t, EY.pv + dy * t)) m = t; else break; } return m; };
    let ap = reach(1, 0), am = reach(-1, 0), pu = 0;
    if (J) { pu = E.look * 0.5 * (E.look > 0 ? ap : am); ap -= Math.max(0, pu); am += Math.min(0, pu); }
    const av = flat ? 0 : Math.min(reach(0, 1), reach(0, -1), 0.5 * r);
    return { u: r2(u), v: r2(ev), o, shapes: EY.shapes.map(rp), va: r2(EY.va), pu: r2(pu), pv: r2(EY.pv), pr: r2(pr), ri: r2(EY.ri), hl: EY.hl.map((x) => x * o), hr: EY.hr, ap: r2(ap), am: r2(am), av: r2(av) };
  });
  // the mouth: its own line or opening, as wide as the room allows; how far it may open
  const mh = Math.min(0.5 * rE, 0.6 * dm), mu = sh * 1.15 + (J ? E.look * 0.12 * Math.abs(eu) : 0);
  let hw = Math.min(0.72 * Math.abs(eu), 0.72 * dm), MO;
  for (let t = 0; t < 30; t++) { MO = courtMouth(E.rank, hw, mh, E.look); if (J) MO.shapes = MO.shapes.map((P) => P.map(([x, y]) => [x * E.look, y])); if (fits(MO.shapes, mu, vm)) break; hw *= 0.93; }
  let mo = 0; for (let m = 0; m <= MO.mo; m += 0.05) { if (fits(MO.shapes.map((P) => P.map(([x, y]) => [x, y > 0 ? y * (1 + m) : y])), mu, vm)) mo = m; else break; }
  // how far the head may turn: the face slides that far each way and every shape stays inside
  // (only the eyes themselves and the mouth: a lid line or a lash may run out past the head as it turns)
  const all = (du) => eyes.every((e) => fits([e.shapes[0]], e.u + du, e.v, 2)) && fits(MO.shapes, mu + 0.6 * du, vm, 2);
  let tp = 0, tm = 0;
  for (let d = 0; d <= 0.5 * Math.abs(eu); d += h) { if (all(d)) tp = d; else break; }
  for (let d = 0; d <= 0.5 * Math.abs(eu); d += h) { if (all(-d)) tm = d; else break; }
  // the king's beard: below his mouth every nail tied across to the nails round its mirror and down to the chin
  const beard = [];
  if (E.rank === 13) {
    const L = ring.map(([x, y]) => [(x - cx) * Rv[0] + (y - cy) * Rv[1], (x - cx) * D[0] + (y - cy) * D[1]]);
    const B = L.map((q, i) => i).filter((i) => L[i][1] > vm + 0.6 * mh), chin = B.reduce((m, i) => (L[i][1] > L[m][1] ? i : m), B[0] || 0);
    for (const i of B) {
      const m = B.reduce((bb, k) => (Math.hypot(L[k][0] + L[i][0], L[k][1] - L[i][1]) < Math.hypot(L[bb][0] + L[i][0], L[bb][1] - L[i][1]) ? k : bb), B[0]);
      for (const k of [-2, -1, 0, 1, 2].map((o) => (m + o + N) % N).concat([-1, 0, 1].map((o) => (chin + o + N) % N))) if (k !== i && !beard.some(([x, y]) => (x === i && y === k) || (x === k && y === i))) beard.push([i, k]);
    }
  }
  const face = { c: [r2(cx), r2(cy)], rv: Rv.map(r2), d: D.map(r2), eyes, mouth: { u: r2(mu), v: r2(vm), shapes: MO.shapes.map(rp) }, mo: r2(mo), tp: r2(tp), tm: r2(tm), mv: E.mv || { ph: 0, gk: 1, vk: 2, mk: 2, bl: [] }, beard };
  let d = '', count = 0;
  faceDraw(ring, face, 0, LOOP, (x1, y1, x2, y2) => { d += seg([x1, y1], [x2, y2]); count++; });
  return { d, c: W(eyes[0].u, ev), R: rE, threads: count, pairs: [], fine: 4, face };
}
function eyeWeave(ring, poly, E) {
  const N = ring.length;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const mx = ring.reduce((s, p) => s + p[0], 0) / N, my = ring.reduce((s, p) => s + p[1], 0) / N;
  let R = E.rho * size, k = 1;
  const at = () => [mx + E.gx * size * 0.16 * k, my + E.gy * size * 0.16 * k];
  const fits = (c) => C.pointInPoly(c[0], c[1], poly) && C.distToPoly(c[0], c[1], poly) > R * 1.15 + 4;
  let c = at();
  for (let t = 0; t < 40 && !fits(c); t++) { if (k > 0.05) k *= 0.85; else R *= 0.9; c = at(); }
  // thread ends may land anywhere on the outline at a finer pitch than the drawn nails (E.fine x): with
  // ends only at the nails, the threads closest to the pupil miss it by up to half a nail spacing and the
  // hole comes out a polygon of 8-10 sides (measured; adding the next-closest threads changed nothing).
  const M = N * (E.fine || 4), F = resample(poly, M);
  let d = '';
  const seen = new Set(), pairs = [];
  // threads start at every E.step-th nail (2: every nail made the pip a white mass once the ends were fine).
  // E.rings: more invisible circles round the same centre (1 = the pupil); each family leaves its own ring
  for (const f of E.rings || [1]) for (let i = 0; i < N; i += E.step || 2) {
    const Rf = R * f;
    const P = ring[i], dx = c[0] - P[0], dy = c[1] - P[1], L = Math.hypot(dx, dy);
    if (L <= Rf * 1.02) continue;
    const base = Math.atan2(dy, dx), half = Math.asin(Rf / L), tT = Math.sqrt(L * L - Rf * Rf);
    for (const sgn of [1, -1]) {
      const a = base + sgn * half;
      const Q = rayExit(P, [Math.cos(a), Math.sin(a)], poly, tT);
      if (!Q) continue;
      let j0 = 0, bd = Infinity;
      for (let q = 0; q < M; q++) { const e = Math.hypot(F[q][0] - Q[0], F[q][1] - Q[1]); if (e < bd) { bd = e; j0 = q; } }
      // of the points round the exit, the one whose thread passes closest to the pupil without entering it
      let j = -1, gap = Infinity;
      for (let s = -12; s <= 12; s++) {
        const q = (j0 + s + M) % M, B = F[q], ex = B[0] - P[0], ey = B[1] - P[1], len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;
        const dist = Math.abs(ex * dy - ey * dx) / len, along = (ex * dx + ey * dy) / len;
        if (along <= 0 || along >= len) continue;
        if (dist >= Rf && dist - Rf < gap) { gap = dist - Rf; j = q; }
      }
      if (j < 0 || seen.has(i + '_' + j)) continue;
      seen.add(i + '_' + j);
      pairs.push([i, j]);
      d += seg(P, F[j]);
    }
  }
  return { d, c, R, threads: seen.size, pairs, fine: E.fine || 4 };
}
// the trait read off a rule: what the threads make, named by the curve the times table is known for
function weaveName(m, kf) {
  if (m < 1.05) return kf > 0.4 ? 'Star' : kf < 0.22 ? 'Lace' : 'Woven';
  const n = Math.round(m);
  return Math.abs(m - n) < 0.1 ? { 2: 'Cardioid', 3: 'Nephroid', 4: 'Trefoil', 5: 'Quatrefoil' }[n] || 'Drift' : 'Drift';
}
// one pip under the card's rule: m from the base by the rule (alike, by size, by distance from the middle), then
// from every nail q a thread to nail round(m * q + k) (both ways round when k > 0; an ace adds reaches)
function ruleWeave(ring, poly, centre, cw) {
  const N = ring.length;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  let m = cw.m0;
  if (cw.rule === 'size') m = 1 + (cw.m0 - 1) * (0.4 + 0.6 * cw.spread * Math.min(1.2, Math.max(0.15, size / 360)));
  if (cw.rule === 'radius') m = 1 + (cw.m0 - 1) * (0.5 + cw.spread * (Math.min(1, Math.hypot(centre[0] - C.W / 2, centre[1] - C.H / 2) / 600) - 0.3));
  m = Math.max(1, Math.min(5.4, m));
  let k = Math.round(cw.kf * N);
  // below m = 1.8 a short reach strings only short threads along the rim and the pip looks empty (seen on #2)
  if (m < 1.8 && k < Math.round(0.14 * N)) k = Math.round(0.14 * N);
  const ks = [k];
  for (let f = 1; f < cw.fams; f++) ks.push(k + f * Math.round(cw.k2 * N));
  let d = '';
  const pairs = [];
  for (const kk of ks) for (let q = 0; q < N; q++) for (const sg of kk ? [kk, -kk] : [0]) {
    const p = (((Math.round(m * q + sg) % N) + N) % N);
    if (p === q) continue;
    pairs.push([q, p]);
    d += seg(ring[q], ring[p]);
  }
  return { d, pairs, m, w: cw.fams > 1 ? 0.7 : 0.95, op: cw.fams > 1 ? 0.75 : 0.88 };
}
// v26 Ace in the Hole: chord families round the rim that leave a small pip (the outline shrunk about the centre)
// untouched, so the hidden pip shows as a hole in the weave
const crossZ = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segX = (p, q, a, b) => crossZ(a, b, p) * crossZ(a, b, q) < 0 && crossZ(p, q, a) * crossZ(p, q, b) < 0;
function holeWeave(ring, poly, centre) {
  const N = ring.length, [cx, cy] = centre, inner = poly.map(([x, y]) => [cx + (x - cx) * 0.36, cy + (y - cy) * 0.36]);
  const hits = (p, q) => { for (let i = 0; i < inner.length; i++) if (segX(p, q, inner[i], inner[(i + 1) % inner.length])) return true; return false; };
  let d = '';
  const pairs = [];
  // long reaches pass close to the middle, so the threads that miss the hidden pip draw its silhouette
  for (const f of [0.2, 0.28, 0.35, 0.41, 0.46, 0.5]) {
    const k = Math.round(f * N);
    for (let q = 0; q < N; q++) { const o = (q + k) % N; if (hits(ring[q], ring[o])) continue; pairs.push([q, o]); d += seg(ring[q], ring[o]); }
  }
  d += C.polyPath(inner); // and one thread round it
  return { d, pairs };
}
// v26 Wild Card: the weaves of every other deck, one picked per pip
const WILD_WEAVES = [[2, 0], [1, 0.2, 2, 0.18], [4, 0], [3, 0], [5, 0], [1, 0.46], [1, 0.3], [1, 0.12], [1.5, 0], [2.5, 0], [3.5, 0], [4.5, 0], [1, 0.3, 2, 0.16], [6, 0], [1, 0.38], [2, 0, 2, 0.25]]
  .map(([m0, kf, fams, k2]) => ({ m0, kf, rule: 'uniform', spread: 1, fams: fams || 1, k2: k2 || 0.1 }));
function drawObject(ring, poly, centre, T, r, ink, ctx, id) {
  const svg = drawObject0(ring, poly, centre, T, r, ink, ctx, id);
  if (COLLECT) COLLECT.objs.push({ id, centre, poly, ring, svg, weave: LASTW });
  LASTW = null;
  return svg;
}
function drawObject0(ring, poly, centre, T, r, ink, ctx, id) {
  const N = ring.length;
  let d = '', out = '';
  const ks = [];
  const chords = (k) => { ks.push(k); for (let i = 0; i < N; i++) for (const s of [k, -k]) d += seg(ring[i], ring[(i + s + N) % N]); };
  let w = 1.15, op = 0.92;
  let pupil = null;
  let cpairs = null;
  if (FACEW && FACEW[id]) { pupil = faceWeave(ring, poly, FACEW[id]); d = pupil.d; w = 1.0; op = 0.9; }
  else if (T.eye && T.eye.on && T.eye.on.includes(id)) { pupil = eyeWeave(ring, poly, T.eye); d = pupil.d; w = 1.0; op = 0.9; }
  else if (T.hole && T.hole === id) { const hw = holeWeave(ring, poly, centre); d = hw.d; cpairs = hw.pairs; w = 0.95; op = 0.88; }
  else if (T.wild) {
    const ia = r.int(0, WILD_WEAVES.length - 1);
    let cw = ruleWeave(ring, poly, centre, WILD_WEAVES[ia]);
    if (T.rank === 1) { const c2 = ruleWeave(ring, poly, centre, WILD_WEAVES[(ia + 1 + r.int(0, WILD_WEAVES.length - 2)) % WILD_WEAVES.length]); cw = { d: cw.d + c2.d, pairs: cw.pairs.concat(c2.pairs), w: 0.8, op: 0.72 }; }
    d = cw.d; w = cw.w; op = cw.op; cpairs = cw.pairs;
  }
  else if (T.cw) { const cw = ruleWeave(ring, poly, centre, T.cw); d = cw.d; w = cw.w; op = cw.op; cpairs = cw.pairs; }
  else if (T.weave === 'woven') chords(Math.round(N * r.range(0.27, 0.36)));
  else if (T.weave === 'star') { chords(Math.round(N * r.range(0.42, 0.48))); w = 0.9; op = 0.85; }
  else if (T.weave === 'lace') { chords(Math.round(N * 0.2)); chords(Math.round(N * 0.38)); w = 0.8; op = 0.8; }
  else if (T.weave === 'mandala') {
    // three chord families of rising reach; each leaves its own envelope inside the pip
    const ks = [r.range(0.1, 0.14), r.range(0.22, 0.28), r.range(0.36, 0.44)];
    for (const k of ks) chords(Math.round(N * k));
    w = 0.7; op = 0.72;
  }
  const spin = MACH && !MACH.rigid && MACH.turns[id] !== undefined ? MACH.turns[id] : null;
  if (d) {
    ctx.defs += `<clipPath id="${id}"><path d="${C.polyPath(poly)}"/></clipPath>`;
    const weave = `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-opacity="${op}"/>`;
    const weaveEl = `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-opacity="${op}" clip-path="url(#${id})"/>`;
    out += spin === null ? weaveEl : `<g clip-path="url(#${id})">${turning(centre[0], centre[1], spin, weave)}</g>`;
    if (COLLECT) LASTW = { ks, w, op, eye: !!(pupil || cpairs), weaveEl, dotEl: '', pairs: pupil ? pupil.pairs : cpairs, fine: pupil ? pupil.fine : 1, pupil: pupil ? { c: pupil.c, R: pupil.R } : null, face: pupil && pupil.face ? pupil.face : null };
  }
  if (COLLECT && !d) LASTW = { ks: [], w: 0.9, op: 0.8, eye: false, weaveEl: '', dotEl: '', empty: true }; // a contour pip: no threads yet
  out += `<path d="${C.polyPath(ring)}" fill="none" stroke="${ink}" stroke-width="${T.weave === 'contour' ? 2.4 : 1.6}"/>`;
  if (pupil && T.eye && T.eye.dot) { const dotEl = pin(pupil.c[0], pupil.c[1], Math.max(2.5, pupil.R * 0.32), ink); out += dotEl; if (LASTW) LASTW.dotEl = dotEl; }
  if (T.weave === 'contour') {
    const [mx, my] = centre;
    let rings = '';
    for (const k of [0.78, 0.56]) rings += `<path d="${C.polyPath(ring.map(([x, y]) => [mx + (x - mx) * k, my + (y - my) * k]))}" fill="none" stroke="${ink}" stroke-width="2"/>`;
    if (spin === null) out += rings;
    else {
      if (!d) ctx.defs += `<clipPath id="${id}"><path d="${C.polyPath(poly)}"/></clipPath>`;
      out += `<g clip-path="url(#${id})">${turning(mx, my, spin, rings)}</g>`;
    }
  }
  return out;
}

// ---------- v8 layouts ----------
// like settle, but positions pull in from the first step (shapes that start too wide, like arcs)
function settleBoth(make, minSize) {
  for (let k = 0; k < 80; k++) {
    const list = make(Math.pow(0.985, k), Math.pow(0.98, k));
    if (list.some((h) => h.size < minSize)) return null;
    if (list.every(clear) && apart(list, 30)) return list;
  }
  return null;
}
function placeOne(r, list, make, gap = 34, tries = 400) {
  for (let t = 0; t < tries; t++) { const h = make(); if (clear(h) && apart([...list, h], gap)) return h; }
  return null;
}
// left-right mirror: pairs of twins and pips on the axis; twin indices in .twin
function mirrorLayout(r, n) {
  const k = Math.min(1.2, Math.max(0.7, Math.sqrt(6 / n)));
  for (let round = 0; round < 60; round++) {
    const list = [], pairs = Math.floor(n / 2);
    const bigPair = pairs && r() < 0.45 ? r.int(0, pairs - 1) : -1;
    let ok = true;
    if (n % 2) {
      const h = placeOne(r, list, () => { const s = r.range(110, 250) * k; return { x: C.W / 2, y: r.range(FIELD.y0 + s / 2, FIELD.y1 - s / 2), size: s }; }, 40);
      if (h) list.push(h); else ok = false;
    }
    for (let p = 0; p < pairs && ok; p++) {
      let placed = false;
      for (let t = 0; t < 400 && !placed; t++) {
        const low = n <= 3, s = (p === bigPair ? r.range(190, 260) : r.range(80, 150)) * k * (low ? 1.5 : 1);
        const dx = r.range(s / 2 + (low ? 110 : 22), 400 - s / 2), y = r.range(FIELD.y0 + s / 2, FIELD.y1 - s / 2);
        if (low && list.length && Math.abs(y - list[0].y) < 330) continue; // a 3 stands tall: twins well above or below the axis pip
        const R = { x: C.W / 2 + dx, y, size: s }, L = { x: C.W / 2 - dx, y, size: s };
        if (clear(R) && clear(L) && apart([...list, R, L], 40)) { const i = list.length; R.twin = i + 1; L.twin = i; L.left = true; list.push(R, L); placed = true; }
      }
      ok = placed;
    }
    if (ok) return list;
  }
  return null;
}
// one huge pip and small ones around it
function giantLayout(r, n) {
  for (let round = 0; round < 40; round++) {
    const G = r.range(360, 470);
    const g = { x: C.W / 2 + r.range(-80, 80), y: C.H / 2 + r.range(-200, 200), size: G };
    if (!clear(g)) continue;
    const list = [g];
    for (let i = 1; i < n; i++) { const h = placeOne(r, list, () => { const s = r.range(60, 110); return { x: r.range(FIELD.x0 + s / 2, FIELD.x1 - s / 2), y: r.range(FIELD.y0 + s / 2, FIELD.y1 - s / 2), size: s }; }, 28); if (!h) break; list.push(h); }
    if (list.length === n) return list;
  }
  return null;
}
// golden-angle spiral, growing or shrinking outward
function spiralLayout(r, n) {
  const cx = C.W / 2 + r.range(-40, 40), cy = C.H / 2 + r.range(-60, 60), a = r.range(70, 95), th0 = r.range(0, Math.PI * 2);
  const grow = r() < 0.5, base = r.range(105, 135) * Math.min(1.2, Math.max(0.75, Math.sqrt(7 / n))), GA = Math.PI * (3 - Math.sqrt(5));
  return settleBoth((s, p) => Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1), rad = a * Math.sqrt(i + 0.6) * p * 1.35, ang = th0 + i * GA;
    return { x: cx + rad * Math.cos(ang), y: cy + rad * 1.3 * Math.sin(ang), size: base * s * (grow ? 0.6 + 0.9 * t : 1.5 - 0.9 * t) };
  }), n >= 8 ? 55 : 70);
}
// a lattice with holes: n of the cells, sizes varied
function gridLayout(r, n) {
  const cols = n <= 3 ? 2 : n <= 8 ? 3 : 4, rows = Math.min(5, Math.ceil((n + 2) / cols) + (r() < 0.6 ? 1 : 0));
  // inset by the largest pip a cell may hold (200), so edge cells stay inside the field
  const x0 = FIELD.x0 + 118, x1 = FIELD.x1 - 118, y0 = FIELD.y0 + 118, y1 = FIELD.y1 - 118, cw = (x1 - x0) / Math.max(1, cols - 1), ch = (y1 - y0) / Math.max(1, rows - 1);
  for (let round = 0; round < 60; round++) {
    const cells = [];
    // the two corner cells under the index are never used
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!(i === 0 && j === 0) && !(i === cols - 1 && j === rows - 1)) cells.push([x0 + i * cw, y0 + j * ch]);
    r.shuffle(cells);
    const list = cells.slice(0, n).map(([x, y]) => ({ x: x + r.range(-12, 12), y: y + r.range(-12, 12), size: Math.min(210, Math.min(cw, ch) * r.range(0.45, 0.8)) }));
    if (list.length === n && list.every(clear) && apart(list, 30)) return list;
  }
  return null;
}
// along an arc of a circle, opening up, down or sideways
function arcLayout(r, n) {
  const big = n >= 7, R = big ? r.range(330, 400) : r.range(240, 360), span = big ? r.range(3.0, 3.8) : r.range(2.2, 3.6), dir = r.pick([Math.PI / 2, -Math.PI / 2, 0, Math.PI]);
  const cx = C.W / 2 - Math.cos(dir) * R * 0.35, cy = C.H / 2 - Math.sin(dir) * R * 0.35;
  // pips sized by the room the arc has for them
  const swell = r() < 0.5, base = Math.min(r.range(110, 150), (0.9 * R * span) / n - 20);
  return settleBoth((s, p) => Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1), ang = dir - span / 2 + span * t;
    return { x: cx + R * p * Math.cos(ang), y: cy + R * p * 1.15 * Math.sin(ang), size: base * s * (swell ? 0.75 + 0.6 * Math.sin(Math.PI * t) : 1) };
  }), n >= 8 ? 55 : 70);
}
function layoutFor8(kind, r, n) {
  if (kind === 'mirror') return mirrorLayout(r, n);
  if (kind === 'giant') return n >= 2 ? giantLayout(r, n) : null;
  if (kind === 'spiral') return spiralLayout(r, n);
  if (kind === 'grid') return gridLayout(r, n);
  if (kind === 'arc') return n >= 3 ? arcLayout(r, n) : null;
  return layoutFor(kind, r, n);
}
// loop: round the composition by angle; mirror: each pip to its twin and to its nearest neighbour
function pairsFor8(kind, pips, r) {
  const n = pips.length;
  if (n <= 1) return [];
  if (kind === 'loop') {
    const cx = pips.reduce((a, p) => a + p.x, 0) / n, cy = pips.reduce((a, p) => a + p.y, 0) / n;
    const order = [...Array(n).keys()].sort((a, b) => Math.atan2(pips[a].y - cy, pips[a].x - cx) - Math.atan2(pips[b].y - cy, pips[b].x - cx));
    const out = [];
    for (let k = 0; k < (n === 2 ? 1 : n); k++) out.push([order[k], order[(k + 1) % n]]);
    return out;
  }
  if (kind === 'figure') {
    const out = [];
    pips.forEach((p, i) => (p.bones || []).forEach((j) => out.push([i, j])));
    return out;
  }
  if (kind === 'court') {
    const k = pips.findIndex((p) => p.king), ring = pips.map((_, i) => i).filter((i) => i !== k), out = [];
    if (ring.length === 1) return k >= 0 ? [[ring[0], k]] : [];
    for (let i = 0; i < ring.length - 1; i++) out.push([ring[i], ring[i + 1]]);
    if (ring.length >= 3) out.push([ring[ring.length - 1], ring[0]]);
    return out;
  }
  if (kind === 'seq' || kind === 'seqloop') {
    const out = [];
    for (let i = 0; i < n - 1; i++) out.push([i, i + 1]);
    if (kind === 'seqloop' && n >= 3) out.push([n - 1, 0]);
    return out;
  }
  if (kind === 'house') {
    const d = (i, j) => Math.hypot(pips[i].x - pips[j].x, pips[i].y - pips[j].y), out = [];
    let best = null;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if ((pips[i].grp || 0) === (pips[j].grp || 0)) { if (blocker(pips, i, j) < 0) out.push([i, j]); }
      else if (!best || d(i, j) < d(best[0], best[1])) best = [i, j];
    }
    if (best) out.push(best);
    return out;
  }
  if (kind === 'all') {
    const out = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (blocker(pips, i, j) < 0) out.push([i, j]);
    return out;
  }
  if (kind === 'pairs') {
    const d = (i, j) => Math.hypot(pips[i].x - pips[j].x, pips[i].y - pips[j].y);
    if (pips.some((q) => q.mate !== undefined)) {
      const out = [];
      pips.forEach((q, i) => { if (q.mate !== undefined && q.mate > i) out.push([i, q.mate]); });
      const paired = new Set(out.flat());
      pips.forEach((q, i) => { if (!paired.has(i)) out.push([i, [...paired].sort((a, b) => d(i, a) - d(i, b))[0]]); });
      return out;
    }
    const cand = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cand.push([d(i, j) * (blocker(pips, i, j) < 0 ? 1 : 3), i, j]);
    cand.sort((a, b) => a[0] - b[0]);
    const used = new Set(), out = [];
    for (const [, i, j] of cand) if (!used.has(i) && !used.has(j)) { out.push([i, j]); used.add(i); used.add(j); }
    for (let i = 0; i < n; i++) if (!used.has(i)) {
      const j = [...used].sort((a, b) => d(i, a) - d(i, b))[0];
      out.push([i, j]);
    }
    return out;
  }
  if (kind === 'mirror') {
    const d = (i, j) => Math.hypot(pips[i].x - pips[j].x, pips[i].y - pips[j].y);
    const edges = new Map();
    const add = (i, j) => { if (i !== j) edges.set(Math.min(i, j) + '-' + Math.max(i, j), [i, j]); };
    for (let i = 0; i < n; i++) {
      if (pips[i].twin !== undefined) add(i, pips[i].twin);
      const near = [...Array(n).keys()].filter((j) => j !== i && j !== pips[i].twin && blocker(pips, i, j) < 0).sort((a, b) => d(i, a) - d(i, b));
      if (near.length) add(i, near[0]);
    }
    return [...edges.values()];
  }
  return pairsFor(kind, pips, r);
}
// a few threads only, spread across the arcs
function threadsFor(style, a, b, r) {
  if (style !== 'single') return bandThreads(style, a, b, r);
  const m = a.length, c = Math.min(m, r.int(3, 5)), out = [];
  for (let q = 0; q < c; q++) { const i = Math.round((q * (m - 1)) / Math.max(1, c - 1)); out.push([a[i], b[i]]); }
  return out;
}
function drawBands8(bands, P, r, strokeFor) {
  let out = COLLECT && !COLLECT.front ? ((COLLECT.front = true), '<!--FRONT-->') : '';
  bands.forEach((band, bi) => {
    const [w0, of] = WEIGHTS[band.weight];
    const k = band.style === 'lattice' ? 0.85 : band.style === 'single' ? 1.35 : 1;
    const stroke = band.red ? P.accent : band.color || strokeFor(bi, band);
    const op = band.red ? 0.9 : band.solid ? 0.95 : Math.min(0.95, P.op * of * 0.8 * (band.style === 'single' ? 1.25 : 1));
    const threads = band.threads || threadsFor(band.style, band.a, band.b, r);
    for (const d of strands(threads)) out += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${C.f1(w0 * k)}" stroke-opacity="${C.f1(op * 100) / 100}"/>`;
    if (COLLECT && band.ends) {
      const onA = new Set(band.a.map((p) => C.f1(p[0]) + ',' + C.f1(p[1])));
      const end = (p) => (onA.has(C.f1(p[0]) + ',' + C.f1(p[1])) ? 0 : 1);
      COLLECT.bands.push({
        ends: band.ends, style: band.style,
        paint: band.red ? { type: 'solid', color: P.accent } : band.color ? { type: 'solid', color: band.color } : strokeFor.spec(bi, band),
        width: w0 * k, opacity: op,
        // each thread: [end of p (0 = ends[0], 1 = ends[1]), px, py, end of q, qx, qy]
        threads: threads.map(([p, q]) => [end(p), p[0], p[1], end(q), q[0], q[1]]),
      });
    }
    if (MACH && band.ends) {
      // beads: a dash pattern on the oriented threads (dashes restart on every thread), moved one belt
      // step per tick
      out += `<path d="${beltPaths(band, threads)}" fill="none" stroke="${stroke}" stroke-width="${C.f1(w0 * k * 2.2)}" stroke-opacity="${C.f1(Math.min(1, op * 1.5) * 100) / 100}" stroke-linecap="round" stroke-dasharray="2 22">${flowing('stroke-dashoffset', -MACH.belt)}</path>`;
    }
  });
  return out;
}
// the veil: Ringers' string round circles (one per pip), each passed on a side; tangent lines with
// signed radii, arcs walked the way the string turns. Returns path data, or null if a tie cannot close.
function veilPath(pips, sides) {
  const n = pips.length;
  const cx = pips.reduce((a, p) => a + p.x, 0) / n, cy = pips.reduce((a, p) => a + p.y, 0) / n;
  const order = [...Array(n).keys()].sort((a, b) => Math.atan2(pips[a].y - cy, pips[a].x - cx) - Math.atan2(pips[b].y - cy, pips[b].x - cx));
  const circ = order.map((i) => ({ c: [pips[i].x, pips[i].y], rho: sides[i] * pips[i].size * 0.5 }));
  const tans = [];
  for (let k = 0; k < n; k++) {
    const A = circ[k], B = circ[(k + 1) % n];
    const Dx = B.c[0] - A.c[0], Dy = B.c[1] - A.c[1], L = Math.hypot(Dx, Dy);
    const cs = (A.rho - B.rho) / L;
    if (!(Math.abs(cs) < 1)) return null;
    const ux = Dx / L, uy = Dy / L, vx = -uy, vy = ux, sn = Math.sqrt(1 - cs * cs);
    const nx = cs * ux + sn * vx, ny = cs * uy + sn * vy;
    tans.push({ p: [A.c[0] + A.rho * nx, A.c[1] + A.rho * ny], q: [B.c[0] + B.rho * nx, B.c[1] + B.rho * ny] });
  }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const A = circ[k], tin = tans[(k - 1 + n) % n], tout = tans[k];
    const a0 = Math.atan2(tin.q[1] - A.c[1], tin.q[0] - A.c[0]), a1 = Math.atan2(tout.p[1] - A.c[1], tout.p[0] - A.c[0]);
    const din = [tin.q[0] - tin.p[0], tin.q[1] - tin.p[1]], rad = [tin.q[0] - A.c[0], tin.q[1] - A.c[1]];
    const turn = Math.sign(rad[0] * din[1] - rad[1] * din[0]) || 1;
    let sweep = a1 - a0;
    while (turn > 0 && sweep < 0) sweep += Math.PI * 2;
    while (turn < 0 && sweep > 0) sweep -= Math.PI * 2;
    const R = Math.abs(A.rho), steps = Math.max(1, Math.ceil(Math.abs(sweep) / 0.1));
    for (let q = 0; q <= steps; q++) { const a = a0 + (sweep * q) / steps; pts.push([A.c[0] + R * Math.cos(a), A.c[1] + R * Math.sin(a)]); }
  }
  return pts;
}
// (v26e) a court figure's twins are turned 180 degrees round the card's centre, not mirrored
let ROT = false;
const mx = ([x, y]) => (ROT ? [C.W - x, C.H - y] : [C.W - x, y]);

// ---------- v10: veil family and grounds ----------
// one solid colour for the thread (patterns cannot carry a card-space gradient)
function threadSolid(P, ctx) {
  if (typeof P.thread === 'string') return P.thread;
  if (P.thread.type === 'alt' || P.thread.type === 'band') return P.thread.stops[0];
  return sample(P.thread, C.W / 2, C.H / 2, ctx);
}
function threadStroke(P, ctx) {
  if (typeof P.thread === 'string') return P.thread;
  if (P.thread.type === 'alt' || P.thread.type === 'band') return P.thread.stops[0];
  return paint(P.thread, 'vt', ctx);
}
function drawVeil(pts, style, P, PS, r, nail) {
  const d = C.polyPath(pts), solid = threadSolid(P, PS.ctx), stroke = threadStroke(P, PS.ctx);
  if (style === 'string') {
    // the loop is a real string: wound round pins about 26 apart along it
    let out = `<path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="0.8" stroke-width="1.5" stroke-linejoin="round"/>`;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc >= 26) { acc = 0; out += pin(pts[i][0], pts[i][1], 2.2, nail); }
    }
    return out;
  }
  let fill = stroke, op = 0.1;
  if (style !== 'tone') {
    const ang = r.pick([0, 30, 45, 60, 90, 120, 135, 150]), sp = r.range(7, 12);
    let cell = '';
    if (style === 'hatch') cell = `<line x1="${C.f1(sp / 2)}" y1="0" x2="${C.f1(sp / 2)}" y2="${C.f1(sp)}" stroke="${solid}" stroke-width="0.9" stroke-opacity="0.5"/>`;
    else if (style === 'cross') cell = `<path d="M${C.f1(sp / 2)} 0V${C.f1(sp)}M0 ${C.f1(sp / 2)}H${C.f1(sp)}" stroke="${solid}" stroke-width="0.7" stroke-opacity="0.45"/>`;
    else cell = `<circle cx="${C.f1(sp / 2)}" cy="${C.f1(sp / 2)}" r="${C.f1(r.range(1, 1.6))}" fill="${solid}" fill-opacity="0.55"/>`;
    PS.ctx.defs += `<pattern id="vp" patternUnits="userSpaceOnUse" width="${C.f1(sp)}" height="${C.f1(sp)}" patternTransform="rotate(${ang})">${cell}</pattern>`;
    fill = 'url(#vp)'; op = 1;
  }
  return `<path d="${d}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-opacity="0.55" stroke-width="1.4"/>`;
}
// objs: [{ x, y, size, poly }]; edges: [[i, j]] between objs
function drawGround(kind, objs, edges, P, PS, r, nail) {
  if (kind === 'pegs') {
    // a pegboard: every hole the composition did not use keeps its peg; a few pegs are larger
    const sp = r.pick([26, 32, 38]), hex = r() < 0.5, dy = hex ? sp * 0.866 : sp;
    let out = '';
    for (let j = 0, y = 34; y < C.H - 30; y += dy, j++) {
      for (let x = 34 + (hex && j % 2 ? sp / 2 : 0); x < C.W - 30; x += sp) {
        if ((x < 178 && y < 300) || (x > C.W - 178 && y > C.H - 300)) continue;
        if (objs.some((o) => Math.hypot(x - o.x, y - o.y) < o.size * 0.75 && (C.pointInPoly(x, y, o.poly) || C.distToPoly(x, y, o.poly) < 12))) continue;
        out += `<circle cx="${C.f1(x)}" cy="${C.f1(y)}" r="${r() < 0.06 ? 2.6 : 1.3}" fill="${nail}" fill-opacity="0.5"/>`;
      }
    }
    return out;
  }
  if (kind !== 'geometry' || !edges.length) return '';
  // construction lines: each tie as a full line through both pips, clipped to the card
  const ink = threadSolid(P, PS.ctx);
  let out = '';
  for (const [i, j] of edges) {
    const a = objs[i], b = objs[j], dx = b.x - a.x, dy = b.y - a.y;
    const ts = [];
    if (dx) ts.push(-a.x / dx, (C.W - a.x) / dx);
    if (dy) ts.push(-a.y / dy, (C.H - a.y) / dy);
    const lo = Math.max(...ts.filter((t) => t <= 0)), hi = Math.min(...ts.filter((t) => t >= 1));
    out += `<path d="M${C.f1(a.x + dx * lo)} ${C.f1(a.y + dy * lo)}L${C.f1(a.x + dx * hi)} ${C.f1(a.y + dy * hi)}" stroke="${ink}" stroke-width="0.7" stroke-opacity="0.32"/>`;
  }
  // at each pip, an arc between neighbouring lines (15 to 150 degrees), with a tick at its middle
  objs.forEach((o, i) => {
    const dirs = [];
    for (const [a, b] of edges) { if (a === i) dirs.push(Math.atan2(objs[b].y - o.y, objs[b].x - o.x)); if (b === i) dirs.push(Math.atan2(objs[a].y - o.y, objs[a].x - o.x)); }
    if (dirs.length < 2) return;
    dirs.sort((u, v) => u - v);
    let lane = 0;
    for (let k = 0; k < dirs.length; k++) {
      const a0 = dirs[k], a1 = k + 1 < dirs.length ? dirs[k + 1] : dirs[0] + Math.PI * 2, gap = a1 - a0;
      if (gap < 0.26 || gap > 2.62) continue;
      const R = o.size * 0.62 + 14 + 9 * (lane++ % 2);
      const p0 = [o.x + R * Math.cos(a0), o.y + R * Math.sin(a0)], p1 = [o.x + R * Math.cos(a1), o.y + R * Math.sin(a1)], am = (a0 + a1) / 2;
      out += `<path d="M${C.f1(p0[0])} ${C.f1(p0[1])}A${C.f1(R)} ${C.f1(R)} 0 0 1 ${C.f1(p1[0])} ${C.f1(p1[1])}" fill="none" stroke="${ink}" stroke-width="0.9" stroke-opacity="0.55"/>`;
      out += `<path d="M${C.f1(o.x + (R - 5) * Math.cos(am))} ${C.f1(o.y + (R - 5) * Math.sin(am))}L${C.f1(o.x + (R + 5) * Math.cos(am))} ${C.f1(o.y + (R + 5) * Math.sin(am))}" stroke="${ink}" stroke-width="0.9" stroke-opacity="0.55"/>`;
    }
  });
  return out;
}

// the theme's ground replaces the seed's; the seed's is still drawn (into nothing) so the card stream
// draws exactly what it did before
function groundLayer(kind, objs, edges, P, PS, r, nail) {
  const own = drawGround(kind, objs, edges, P, PS, r, nail);
  if (!THEME) return own;
  const g = THEMES[THEME.name].ground;
  if (g === 'sparks') return drawSparks(objs);
  if (g === 'geometry') return kind === 'geometry' ? own : drawGround('geometry', objs, edges, P, PS, THEME.r, nail);
  if (g === 'linen') return drawLinen(P, PS);
  if (g === 'brushed') return drawBrushed();
  if (g === 'leaf') return drawLeaf(objs);
  if (g === 'stars') return drawStars(objs);
  return '';
}
// sparks rising from the pips: a source pip (weighted by size), a rise that is mostly short and now and then
// long, a sideways drift that grows with the rise; colour, size and opacity cool with height
function drawSparks(objs) {
  const r = THEME.r, HOT = ['#fff4d6', '#ffd27a', '#ff9a3d', '#e4572e', '#a3261a', '#5a1410'];
  const total = objs.reduce((s, o) => s + o.size, 0), n = r.int(70, 130);
  let glow = '', core = '';
  for (let k = 0; k < n; k++) {
    let u = r() * total, o = objs[0];
    for (const q of objs) { u -= q.size; if (u <= 0) { o = q; break; } }
    const rise = o.size * 0.35 + Math.pow(r(), 1.8) * 900, ph = r.range(0, 6.28), wl = r.range(60, 140);
    const x = o.x + r.range(-0.5, 0.5) * o.size + Math.sin(rise / wl + ph) * rise * 0.12, y = o.y - rise;
    const t = Math.min(1, rise / 900), rad = (1 - t) * r.range(1.2, 3) + 0.6, op = (1 - t * 0.8) * r.range(0.55, 1);
    const col = HOT[Math.max(0, Math.min(HOT.length - 1, Math.round(t * (HOT.length - 1) + r.range(-0.7, 0.7))))];
    const streak = r() < 0.3, len = r.range(4, 12) * (1 - t * 0.6);
    if (x < 40 || x > C.W - 40 || y < 40 || y > C.H - 40) continue;
    if ((x < 178 && y < 300) || (x > C.W - 178 && y > C.H - 300)) continue; // the index corners
    if (objs.some((q) => C.pointInPoly(x, y, q.poly))) continue;
    glow += '<circle cx="' + C.f1(x) + '" cy="' + C.f1(y) + '" r="' + C.f1(rad * 3.2) + '" fill="' + col + '" fill-opacity="' + C.f1(op * 0.14 * 100) / 100 + '"/>';
    core += streak
      ? '<path d="M' + C.f1(x) + ' ' + C.f1(y) + 'L' + C.f1(x - Math.sin(rise / wl + ph) * len * 0.3) + ' ' + C.f1(y + len) + '" stroke="' + col + '" stroke-width="' + C.f1(rad * 0.9) + '" stroke-linecap="round" stroke-opacity="' + C.f1(op * 100) / 100 + '"/>'
      : '<circle cx="' + C.f1(x) + '" cy="' + C.f1(y) + '" r="' + C.f1(rad) + '" fill="' + col + '" fill-opacity="' + C.f1(op * 100) / 100 + '"/>';
  }
  return glow + core;
}

// where a ground mark may sit: on the card, off the index corners, off the pips
const groundFree = (x, y, objs, pad = 0) => !(x < 40 || x > C.W - 40 || y < 40 || y > C.H - 40) && !((x < 178 && y < 300) || (x > C.W - 178 && y > C.H - 300)) &&
  !objs.some((q) => C.pointInPoly(x, y, q.poly) || (pad && C.distToPoly(x, y, q.poly) < pad));
// linen: warp and weft at an uneven pitch in the thread's own colour, a few heavier slub threads
function drawLinen(P, PS) {
  const r = THEME.r, col = threadSolid(P, PS.ctx);
  let fine = '', slub = '';
  for (let y = 2; y < C.H; y += r.range(3.2, 5.2)) { if (r() < 0.06) slub += `M0 ${C.f1(y)}H${C.W}`; else fine += `M0 ${C.f1(y)}H${C.W}`; }
  for (let x = 2; x < C.W; x += r.range(3.2, 5.2)) { if (r() < 0.06) slub += `M${C.f1(x)} 0V${C.H}`; else fine += `M${C.f1(x)} 0V${C.H}`; }
  return `<path d="${fine}" stroke="${col}" stroke-width="0.6" stroke-opacity="0.06"/><path d="${slub}" stroke="${col}" stroke-width="1.1" stroke-opacity="0.08"/>`;
}
// brushed steel: short horizontal hairlines, light and dark, at four strengths
function drawBrushed() {
  const r = THEME.r, d = ['', '', '', ''];
  for (let y = 1; y < C.H; y += r.range(1.2, 2.6)) {
    for (let x = r.range(-200, 0); x < C.W; ) { const L = r.range(60, 420); d[r.int(0, 3)] += `M${C.f1(x)} ${C.f1(y)}h${C.f1(L)}`; x += L + r.range(10, 140); }
  }
  const look = [['#ffffff', 0.025], ['#ffffff', 0.05], ['#000000', 0.18], ['#cfd5dc', 0.07]];
  return d.map((p, i) => `<path d="${p}" stroke="${look[i][0]}" stroke-width="0.7" stroke-opacity="${look[i][1]}"/>`).join('');
}
// gold leaf: flakes with broken edges, a few larger ones, laid where the board is free
function drawLeaf(objs) {
  const r = THEME.r, n = r.int(26, 46);
  let out = '';
  for (let k = 0; k < n; k++) {
    const x = r.range(40, C.W - 40), y = r.range(40, C.H - 40), big = r() < 0.15, sz = big ? r.range(7, 13) : r.range(2, 6.5);
    const m = r.int(4, 7), a0 = r.range(0, 6.28), pts = [];
    for (let q = 0; q < m; q++) { const a = a0 + (q / m) * 6.28 + r.range(-0.3, 0.3), rr = sz * r.range(0.45, 1); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * r.range(0.6, 1)]); }
    const col = GOLD[r.int(0, GOLD.length - 1)], op = r.range(0.45, 0.9);
    if (!groundFree(x, y, objs, 10)) continue;
    out += `<path d="${C.polyPath(pts)}" fill="${col}" fill-opacity="${C.f1(op * 100) / 100}"/>`;
  }
  return out;
}
// a night sky: faint stars, a few brighter, none on the pips
function drawStars(objs) {
  const r = THEME.r, n = r.int(70, 130);
  let out = '';
  for (let k = 0; k < n; k++) {
    const x = r.range(40, C.W - 40), y = r.range(40, C.H - 40), bright = r() < 0.06;
    const rad = bright ? r.range(1.3, 1.9) : r.range(0.4, 1.1), op = bright ? r.range(0.7, 0.95) : r.range(0.15, 0.6);
    if (!groundFree(x, y, objs, 8)) continue;
    if (bright) out += `<circle cx="${C.f1(x)}" cy="${C.f1(y)}" r="${C.f1(rad * 3.5)}" fill="#e8f4ff" fill-opacity="0.07"/>`;
    out += `<circle cx="${C.f1(x)}" cy="${C.f1(y)}" r="${C.f1(rad)}" fill="#eef6ff" fill-opacity="${C.f1(op * 100) / 100}"/>`;
  }
  return out;
}

// ---------- v9: bloom ----------
const CX = C.W / 2, CY = C.H / 2;
const turnAbout = ([x, y], a, cx = CX, cy = CY) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
function bloomLayout(r, n) {
  const hub = n >= 5 && r() < 0.5, m = hub ? n - 1 : n;
  const facing = r.weighted([['inward', 4], ['outward', 3], ['pinwheel', 3]]);
  const th0 = -Math.PI / 2 + (r() < 0.5 ? Math.PI / m : 0);
  for (let t = 0; t < 200; t++) {
    const size = r.range(110, 200) * Math.min(1.15, Math.max(0.7, Math.sqrt(6 / m)));
    const Rmin = (size + 34) / (2 * Math.sin(Math.PI / m)), Rmax = 392 - size * 0.56;
    if (Rmin > Rmax) continue;
    const R = r.range(Rmin, Math.min(Rmax, Rmin + 160));
    const hubSize = hub ? Math.min(r.range(150, 300), 2 * (R - size * 0.56) - 40) : 0;
    if (hub && hubSize < 90) continue;
    const ring = Array.from({ length: m }, (_, k) => { const a = th0 + (2 * Math.PI * k) / m; return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), size, a }; });
    if (!ring.every(clear)) continue;
    return { ring, hub: hub ? { x: CX, y: CY, size: hubSize } : null, m, facing };
  }
  return null;
}
function renderBloom(r, T, P, unit, L) {
  const { ring, hub, m, facing } = L;
  T.turn = facing; T.veil = 'none';
  const edges = [];
  T.ties = r.weighted(m >= 5 ? [['ring', 3], ['star', 3], ['ring+star', 2]] : [['ring', 1]]) + (hub ? '+hub' : '');
  // pip 0, then every other ring pip is pip 0 turned about the centre
  const p0 = ring[0];
  const rot0 = facing === 'inward' ? p0.a + Math.PI / 2 : facing === 'outward' ? p0.a - Math.PI / 2 : p0.a + Math.PI;
  const poly0 = turnPoly(C.placeShape(unit, p0.x, p0.y, p0.size, false), rot0 - Math.PI, p0.x, p0.y);
  const N0 = r.pick([72, 96, 120]);
  const nails0 = resample(poly0, Math.round(N0 * Math.min(1.6, Math.max(0.6, p0.size / 132))));
  const step = (2 * Math.PI) / m;
  const polys = ring.map((_, k) => poly0.map((q) => turnAbout(q, step * k)));
  const nails = ring.map((_, k) => nails0.map((q) => turnAbout(q, step * k)));
  const centres = ring.map((p) => [p.x, p.y]);
  let hubPoly = null, hubNails = null;
  if (hub) { hubPoly = C.placeShape(unit, hub.x, hub.y, hub.size, false); hubNails = resample(hubPoly, Math.round(N0 * Math.min(1.6, hub.size / 132))); }
  const objSeed = r.int(1, 1e9);

  // one band per orbit, then its turned copies
  const perPair = n3(m);
  const swirl = r.range(0.45, 0.9) * (r() < 0.5 ? 1 : -1);
  const turnFor = () => (T.flow === 'direct' ? 0 : T.flow === 'swirl' ? swirl : r.range(-0.9, 0.9));
  const half0 = r.int(12, 20);
  const bands = [];
  const orbit = (j, A, Ac) => {
    for (let k = 0; k < perPair; k++) {
      const spread = (k - (perPair - 1) / 2) * 0.75;
      const style = T.bands === 'mixed' ? r.weighted(STYLES) : T.style;
      const weight = T.weight === 'mixed' ? r.weighted([['fine', 2], ['regular', 5], ['heavy', 2]]) : T.weight;
      const h = Math.min(Math.floor(Math.min(nails0.length, A.length) / 4), T.bands === 'mixed' ? r.int(8, 22) : half0);
      const sh = () => r.int(-Math.floor(h / 2), Math.floor(h / 2));
      const a = facingArc(nails0, centres[0], Ac, h, sh(), turnFor() + spread), b = facingArc(A, Ac, centres[0], h, sh(), turnFor() - spread);
      const threads = threadsFor(style, a, b, r);
      const group = [];
      for (let q = 0; q < m; q++) {
        const tf = (p) => turnAbout(p, step * q);
        const band = { style, weight, a: a.map(tf), b: b.map(tf), threads: threads.map(([u, v]) => [tf(u), tf(v)]), ends: [q, j === 'hub' ? m : (j + q) % m] };
        group.push(band); bands.push(band);
        if (j === 'self' && m % 2 === 0 && q === m / 2 - 1) break; // a diameter would be strung twice
      }
      group.forEach((b) => { b.group = group; });
    }
  };
  if (T.ties.startsWith('ring') || m < 5) { orbit(1, nails[1], centres[1]); for (let k = 0; k < m; k++) edges.push([k, (k + 1) % m]); }
  if (T.ties.includes('star')) { const sk = m >= 7 ? 3 : 2; orbit(sk, nails[sk], centres[sk]); for (let k = 0; k < m; k++) if (!(m % 2 === 0 && sk === m / 2 && k >= m / 2)) edges.push([k, (k + sk) % m]); }
  if (hub) { orbit('hub', hubNails, [hub.x, hub.y]); for (let k = 0; k < m; k++) edges.push([k, m]); }
  markRed(T, bands);
  for (const b of bands) if (b.red && b.group) b.group.forEach((g) => { g.red = true; });

  const PS = paintSetup(P, T, hub ? { ...hub } : { x: CX, y: CY, size: p0.size }, null);
  let inner = `<rect width="${C.W}" height="${C.H}" fill="${PS.boardFill}"/>`;
  const objs = ring.map((p, k) => ({ x: p.x, y: p.y, size: p.size, poly: polys[k] }));
  if (hub) objs.push({ x: hub.x, y: hub.y, size: hub.size, poly: hubPoly });
  inner += groundLayer(T.ground, objs, edges, P, PS, r, PS.nail);
  if (ANIMATE) MACH = planMachine([...ring.map((p, k) => ({ c: centres[k], size: p.size, id: 'p' + k })), ...(hub ? [{ c: [hub.x, hub.y], size: hub.size, id: 'ph' }] : [])], bands, C.rng(objSeed + 7));
  inner += drawBands8(bands, P, r, PS.strokeFor);
  if (MACH) {
    MACH.rigid = true;
    const wheel = (ringN, poly, c, rr, id) => { let o = drawObject(ringN, poly, c, T, rr, PS.ink, PS.ctx, id); for (const [x, y] of ringN.filter((_, q) => q % 2 === 0)) o += pin(x, y, 2, PS.nail); return turning(c[0], c[1], MACH.turns[id], o); };
    ring.forEach((p, k) => { inner += wheel(nails[k], polys[k], centres[k], C.rng(objSeed), 'p' + k); });
    if (hub) inner += wheel(hubNails, hubPoly, [hub.x, hub.y], C.rng(objSeed + 1), 'ph');
  } else {
  ring.forEach((p, k) => { inner += drawObject(nails[k], polys[k], centres[k], T, C.rng(objSeed), PS.ink, PS.ctx, 'p' + k); });
  if (hub) inner += drawObject(hubNails, hubPoly, [hub.x, hub.y], T, C.rng(objSeed + 1), PS.ink, PS.ctx, 'ph');
  for (const ringN of hub ? [...nails, hubNails] : nails) for (const [x, y] of ringN.filter((_, q) => q % 2 === 0)) inner += pin(x, y, 2, PS.nail);
  }
  const base = typeof P.board === 'string' ? P.board : sample(P.board, CX, CY, PS.ctx);
  return { svg: D.cardSvg(inner, { board: base, rank: T.rank, suit: T.suit, indexColor: PS.indexColor, defs: PS.ctx.defs }), stats: { traits: T, pips: m + (hub ? 1 : 0), bands: bands.length } };
}
const n3 = (m) => (m === 3 ? 2 : 1);

// ---------- v9: nest ----------
function nestLayout(r, n) {
  for (let t = 0; t < 120; t++) {
    const S0 = r.range(520, 680) * Math.pow(0.97, t);
    const qMin = Math.pow(70 / S0, 1 / Math.max(1, n - 1));
    const q = Math.max(qMin, r.range(0.55, 0.82));
    const c0 = [CX, CY + r.range(-40, 40)];
    const da = r.range(0, Math.PI * 2), dl = r.range(0, 0.22); // inner rings drift toward one side
    const twist = r() < 0.6 ? r.range(-0.28, 0.28) : 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const size = S0 * Math.pow(q, i);
      const off = (S0 - size) * dl;
      list.push({ x: c0[0] + Math.cos(da) * off, y: c0[1] + Math.sin(da) * off, size, rot: twist * i });
    }
    if (!clear(list[0])) continue;
    return { list, twist };
  }
  return null;
}
function renderNest(r, T, P, unit, L) {
  const { list, twist } = L;
  T.turn = twist ? 'twisted' : 'straight'; T.veil = 'none'; T.ties = 'tunnel';
  if (T.ground === 'geometry') T.ground = 'pegs';
  const polys = list.map((p) => turnPoly(C.placeShape(unit, p.x, p.y, p.size, false), p.rot, p.x, p.y));
  const No = r.int(150, 220), spacing = perimeter(polys[0]) / No;
  const nails = polys.map((poly) => resample(poly, Math.max(24, Math.round(perimeter(poly) / spacing))));
  // each gap: every nail of the outer ring to the inner ring at the same fraction of the way round,
  // shifted; the style sets how (straight in, a vortex, or two crossing families)
  const mode = { crossed: 'cross', straight: 'tunnel', lattice: 'cross', fan: 'vortex', twist: 'vortex', single: 'sparse', mixed: null }[T.style];
  const bands = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const A = nails[i], B = nails[i + 1], NA = A.length, NB = B.length;
    const md = mode || r.pick(['tunnel', 'vortex', 'cross', 'sparse']);
    const sh = Math.round(NB * (md === 'tunnel' ? r.range(-0.02, 0.02) : r.range(0.08, 0.2))) * (r() < 0.5 ? 1 : -1);
    const threads = [];
    const every = md === 'sparse' ? 6 : NA > 160 ? 2 : 1;
    for (let k = 0; k < NA; k += every) {
      const j = Math.round((k * NB) / NA);
      threads.push([A[k], B[(j + sh + NB * 4) % NB]]);
      if (md === 'cross') threads.push([A[k], B[(j - sh + NB * 4) % NB]]);
    }
    const weight = T.weight === 'mixed' ? r.weighted([['fine', 3], ['regular', 4], ['heavy', 1]]) : T.weight;
    bands.push({ style: md === 'sparse' ? 'single' : 'crossed', weight, a: A, b: B, threads, ends: [i, i + 1] });
  }
  markRed(T, bands);
  const PS = paintSetup(P, T, { x: list[0].x, y: list[0].y, size: list[0].size }, null);
  let inner = `<rect width="${C.W}" height="${C.H}" fill="${PS.boardFill}"/>`;
  inner += groundLayer(T.ground, [{ x: list[0].x, y: list[0].y, size: list[0].size, poly: polys[0] }], [], P, PS, r, PS.nail);
  const last = list.length - 1;
  if (COLLECT) COLLECT.nestCentre = [list[0].x, list[0].y];
  if (COLLECT) COLLECT.nest = { rings: nails, ink: PS.ink };
  if (ANIMATE) {
    // a nest turns as ONE dial: rings with their own speeds would tear the web strung between them.
    // The whole tunnel turns with the motor; beads still run along every thread.
    MACH = planMachine(list.map((p, i) => ({ c: [p.x, p.y], size: p.size, id: i === last ? 'pn' : 'n' + i })), bands, C.rng(No));
    MACH.rigid = true;
    let dial = drawBands8(bands, P, r, PS.strokeFor);
    polys.forEach((poly, i) => {
      dial += i === last ? drawObject(nails[i], poly, [list[i].x, list[i].y], T, r, PS.ink, PS.ctx, 'pn') : `<path d="${C.polyPath(nails[i])}" fill="none" stroke="${PS.ink}" stroke-width="1.6"/>`;
      for (const [x, y] of nails[i].filter((_, q) => q % 2 === 0)) dial += pin(x, y, 2, PS.nail);
    });
    inner += turning(list[0].x, list[0].y, MACH.turns.n0, dial);
  } else {
  inner += drawBands8(bands, P, r, PS.strokeFor);
  polys.forEach((poly, i) => {
    if (i === last) inner += drawObject(nails[i], poly, [list[i].x, list[i].y], T, r, PS.ink, PS.ctx, 'pn');
    else inner += `<path d="${C.polyPath(nails[i])}" fill="none" stroke="${PS.ink}" stroke-width="1.6"/>`;
  });
  for (const ringN of nails) for (const [x, y] of ringN.filter((_, q) => q % 2 === 0)) inner += pin(x, y, 2, PS.nail);
  }
  const base = typeof P.board === 'string' ? P.board : sample(P.board, CX, CY, PS.ctx);
  return { svg: D.cardSvg(inner, { board: base, rank: T.rank, suit: T.suit, indexColor: PS.indexColor, defs: PS.ctx.defs }), stats: { traits: T, pips: list.length, bands: bands.length } };
}

// ---------- court cards ----------
const rot = ([x, y]) => [C.W - x, C.H - y];
const turnPoly = (poly, a, cx, cy) => poly.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
const perimeter = (poly) => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
// the top half: emblem over pip, kept in the top half and clear of the top-left index (the
// bottom-right index is its turned copy, so the turned half clears it too)
function courtLayout(r, T, pipUnit, embUnit) {
  const hit = (b) => b.x0 < 70 || b.x1 > C.W - 70 || b.y0 < 70 || (b.x0 < 178 && b.y0 < 298);
  // upright: a straight column on the centre line. offset: the column moved to one side. lean: the pip
  // moved to one side and the emblem leaning back over the centre, which opens a diagonal for 'braid'
  const side = r() < 0.5 ? 1 : -1;
  for (let t = 0; t < 600; t++) {
    const ps = r.range(160, 210), es = ps * r.range(1.0, 1.2);
    const x = T.layout === 'upright' ? r.range(480, 520) : 500 - side * r.range(60, 110);
    const py = r.range(500, 560), gap = r.range(60, 110);
    const tilt = T.layout === 'lean' ? side * r.range(0.45, 0.8) : 0;
    const pipPoly = C.placeShape(pipUnit, x, py, ps, false), pb = bbox(pipPoly);
    const eh = es * (bbox(embUnit).y1 - bbox(embUnit).y0);
    const dist = (pb.y1 - pb.y0) / 2 + gap + eh / 2;
    const ex = x + Math.sin(tilt) * dist, ey = py - Math.cos(tilt) * dist;
    const embPoly = turnPoly(C.placeShape(embUnit, ex, ey, es, false), tilt * 0.7, ex, ey), eb = bbox(embPoly);
    if (pb.y1 > 682 || hit(pb) || hit(eb)) continue;
    return { pip: { c: [x, py], poly: pipPoly, size: ps }, emb: { c: [ex, ey], poly: embPoly, size: es } };
  }
  return null;
}
function renderCourt(seed, r, T, P) {
  const pipUnit = D.UNITS[T.suit], embUnit = D.EMBLEMS[T.rank];
  let L = courtLayout(r, T, pipUnit, embUnit);
  if (!L) { T.layout = 'upright'; L = courtLayout(r, T, pipUnit, embUnit); }
  const N0 = r.pick([72, 96, 120]);
  const pipN = Math.round(N0 * Math.min(1.6, Math.max(0.6, L.pip.size / 132)));
  const spacing = perimeter(L.pip.poly) / pipN;
  const pipNails = resample(L.pip.poly, pipN);
  // emblems have long outlines (spikes, plume): a wider nail spacing keeps their weave as light as a pip's
  const embNails = resample(L.emb.poly, Math.round(perimeter(L.emb.poly) / (spacing * 1.4)));
  const pip2 = { c: rot(L.pip.c), nails: pipNails.map(rot) };
  const half0 = r.int(12, 20);
  const swirl = r.range(0.45, 0.9) * (r() < 0.5 ? 1 : -1);
  const turnFor = () => (T.flow === 'direct' ? 0 : T.flow === 'swirl' ? swirl : r.range(-0.9, 0.9));
  const pickStyle = () => (T.bands === 'mixed' ? r.weighted(STYLES) : T.style);
  const pickWeight = () => (T.weight === 'mixed' ? r.weighted([['fine', 2], ['regular', 5], ['heavy', 2]]) : T.weight);
  const hFor = (A, B) => Math.min(Math.floor(Math.min(A.length, B.length) / 4), T.bands === 'mixed' ? r.int(8, 22) : half0);
  const sh = (h) => r.int(-Math.floor(h / 2), Math.floor(h / 2));

  // inside the half: emblem to pip (two bands), and for 'braid' emblem to the other half's pip
  const half = [];
  for (const spread of [-0.375, 0.375]) {
    const h = hFor(embNails, pipNails);
    half.push({ style: pickStyle(), weight: pickWeight(), a: facingArc(embNails, L.emb.c, L.pip.c, h, sh(h), turnFor() + spread), b: facingArc(pipNails, L.pip.c, L.emb.c, h, sh(h), turnFor() - spread) });
  }
  if (T.ties === 'braid') {
    // the straight line must clear the pip it passes; otherwise the card stays a spine
    const [ax, ay] = L.emb.c, [bx, by] = pip2.c, [px, py] = L.pip.c;
    const dx = bx - ax, dy = by - ay, t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    const miss = Math.hypot(ax + t * dx - px, ay + t * dy - py);
    if (miss > L.pip.size * 0.55 + 12) {
      const h = hFor(embNails, pipNails);
      half.push({ style: pickStyle(), weight: pickWeight(), a: facingArc(embNails, L.emb.c, pip2.c, h, sh(h), turnFor()), b: facingArc(pip2.nails, pip2.c, L.emb.c, h, sh(h), turnFor()) });
    } else T.ties = 'spine';
  }
  // across the middle: pip to its turned copy; the far arc is the near arc turned, so each band is
  // its own turned copy (fan is the one style that is not, so it becomes crossed here)
  const cross = [];
  for (const spread of [-0.3, 0.3]) {
    const h = Math.min(Math.floor(pipNails.length / 4), T.bands === 'mixed' ? r.int(8, 22) : half0);
    const a = facingArc(pipNails, L.pip.c, pip2.c, h, sh(h), turnFor() + spread);
    const style = pickStyle();
    cross.push({ style: style === 'fan' ? 'crossed' : style, weight: pickWeight(), a, b: a.map(rot) });
  }
  markRed(T, [...half, ...cross]);

  const PS = paintSetup(P, T, { x: C.W / 2, y: C.H / 2, size: L.pip.size }, null);
  let inner = `<rect width="${C.W}" height="${C.H}" fill="${PS.boardFill}"/>`;
  inner += drawBands(cross, P, T, r, PS.strokeFor, 100);
  let g = drawBands(half, P, T, r, PS.strokeFor, 0);
  g += drawObject(embNails, L.emb.poly, L.emb.c, T, r, PS.ink, PS.ctx, 'ce');
  g += drawObject(pipNails, L.pip.poly, L.pip.c, T, r, PS.ink, PS.ctx, 'cp');
  inner += `<g id="half">${g}</g><use href="#half" transform="rotate(180 ${C.W / 2} ${C.H / 2})"/>`;
  // nails outside the turned group, so every pin keeps its highlight up and to the left
  for (const ring of [embNails, pipNails]) for (const p of ring.filter((_, i) => i % 2 === 0)) { inner += pin(p[0], p[1], 2, PS.nail); const q = rot(p); inner += pin(q[0], q[1], 2, PS.nail); }
  const base = typeof P.board === 'string' ? P.board : sample(P.board, C.W / 2, C.H / 2, PS.ctx);
  return { svg: D.cardSvg(inner, { board: base, rank: T.rank, suit: T.suit, indexColor: PS.indexColor, defs: PS.ctx.defs }), stats: { traits: T, pips: 1, bands: half.length * 2 + cross.length } };
}

let ANIMATE = false;
const round2 = (v) => Math.round(v * 100) / 100;
function describeMachine(out, seed) {
  const svg = out.svg, T = out.stats.traits;
  const s1 = svg.indexOf('<!--FRONT-->'), s2 = svg.indexOf('</g>\n', s1);
  const back = svg.slice(0, s1) + svg.slice(s2);
  const defs = (svg.match(/<defs>([\s\S]*?)<\/defs>/) || ['', ''])[1];
  // a sprite carries only the defs its body uses
  const defOf = (id) => (defs.match(new RegExp('<(clipPath|linearGradient|radialGradient|pattern) id="' + id + '"[\\s\\S]*?</\\1>')) || [''])[0];
  const sprite = (x0, y0, w, h, body) => {
    const ids = [...new Set([...body.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${C.f1(w)}" height="${C.f1(h)}" viewBox="${C.f1(x0)} ${C.f1(y0)} ${C.f1(w)} ${C.f1(h)}"><defs>${ids.map(defOf).join('')}</defs>${body}</svg>`;
  };
  const rng = C.rng(seed + 31);
  if (T.layout === 'nest') {
    // a nest turns as one dial: its whole moving layer is one sprite, turning about the outer ring
    const c = COLLECT.nestCentre;
    if (MOTION === 'caustic' && COLLECT.nest) {
      // the rings become objects (outline and nails; the inner pip keeps its sprite without the weave), the
      // ring-to-ring threads become bands tied to them
      const rings = COLLECT.nest.rings, last = rings.length - 1, pn = COLLECT.objs.find((o) => o.id === 'pn');
      const objs = rings.map((ring, i) => {
        const n = ring.length, cx = ring.reduce((s, q) => s + q[0], 0) / n, cy = ring.reduce((s, q) => s + q[1], 0) / n;
        let R = 0;
        for (const [x, y] of ring) R = Math.max(R, Math.hypot(x - cx, y - cy));
        R += 8;
        const inner = i === last && pn;
        let body = inner ? (pn.weave ? pn.svg.replace(pn.weave.weaveEl, '').replace(pn.weave.dotEl || '\u0000', '') : pn.svg) : `<path d="${C.polyPath(ring)}" fill="none" stroke="${COLLECT.nest.ink}" stroke-width="1.6"/>`;
        for (const [x, y] of ring.filter((_, q) => q % 2 === 0)) body += pin(x, y, 2, COLLECT.nail);
        return { centre: [cx, cy], size: 2 * (R - 8), ring, R, body, weave: inner ? pn.weave : { ks: [], w: 0, op: 0, rimOnly: true } };
      });
      return {
        loop: LOOP, back, belt: BEAD * 8, bead: THEME ? THEMES[THEME.name].bead || null : null,
        objs: objs.map((o) => ({ c: [round2(o.centre[0]), round2(o.centre[1])], turns: 0, box: [o.centre[0] - o.R, o.centre[1] - o.R, 2 * o.R, 2 * o.R], svg: sprite(o.centre[0] - o.R, o.centre[1] - o.R, 2 * o.R, 2 * o.R, o.body) })),
        bands: COLLECT.bands.map((b) => ({ ...b, threads: b.threads.map(([ea, px, py, eb, qx, qy]) => [ea, round2(px), round2(py), eb, round2(qx), round2(qy), 1]), ends: b.ends.map(Number) })),
        caustic: planCaustic(objs, seed, T),
      };
    }
    const turns = 2 * (rng() < 0.5 ? 1 : -1);
    return { loop: LOOP, back, objs: [{ c, turns, box: [0, 0, C.W, C.H], svg: sprite(0, 0, C.W, C.H, svg.slice(s1, s2)) }], bands: [], belt: 0, bead: THEME ? THEMES[THEME.name].bead || null : null,
      yoyo: YOYO ? { cycles: YOYO_CYCLES, order: [0], objs: [{ p: 0, ux: 0, uy: 0, amp: 0, spin: Math.sign(turns) * Math.PI * 0.5, lag: 0 }] } : undefined,
      ...playPlans([{ centre: c, size: 300 }], seed) };
  }
  const objs = COLLECT.objs.map((o) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, R = 0;
    for (const [x, y] of o.poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); R = Math.max(R, Math.hypot(x - o.centre[0], y - o.centre[1])); }
    return { ...o, size: Math.max(x1 - x0, y1 - y0), R: R + 8 };
  });
  const plan = planMachine(objs.map((o) => ({ c: o.centre, size: o.size, id: o.id })), COLLECT.bands, rng);
  return {
    loop: LOOP, belt: plan.belt, back, bead: THEME ? THEMES[THEME.name].bead || null : null,
    yoyo: YOYO ? planYoyo(objs, COLLECT.bands, plan) : undefined,
    ...playPlans(objs, seed),
    ...(MOTION === 'caustic' ? { caustic: planCaustic(objs, seed, T) } : {}),
    objs: objs.map((o, i) => {
      const live = MOTION === 'caustic' && o.weave && (o.weave.ks.length || o.weave.eye);
      let body = live ? o.svg.replace(o.weave.weaveEl, '').replace(o.weave.dotEl || '\u0000', '') : o.svg;
      if (!PHANTOM) for (const [x, y] of o.ring.filter((_, q) => q % 2 === 0)) body += pin(x, y, 2, COLLECT.nail);
      const [cx, cy] = o.centre;
      return { c: [round2(cx), round2(cy)], turns: plan.turns[o.id], box: [cx - o.R, cy - o.R, 2 * o.R, 2 * o.R], svg: sprite(cx - o.R, cy - o.R, 2 * o.R, 2 * o.R, body) };
    }),
    bands: COLLECT.bands.map((b) => {
      // beads run the way the belt leaves the first object
      const o = objs[b.ends[0]], wr = plan.w[b.ends[0]];
      return { ...b, threads: b.threads.map((t) => {
        const [ea, px, py, eb, qx, qy] = t;
        const own = ea === 0 ? o : objs[b.ends[1]], w = ea === 0 ? wr : plan.w[b.ends[1]];
        const along = -w * (py - own.centre[1]) * (qx - px) + w * (px - own.centre[0]) * (qy - py);
        return [ea, round2(px), round2(py), eb, round2(qx), round2(qy), along >= 0 ? 1 : -1];
      }), ends: b.ends.map(Number), paint: b.paint };
    }),
  };
}

function render(seed, opts = {}) {
  if (opts.machine) {
    COLLECT = { bands: [], objs: [], nail: '#000', front: false };
    YOYO = opts.motion === 'yoyo';
    MOTION = opts.motion || null;
    try {
      const out = renderStatic(seed, opts);
      out.machine = describeMachine(out, seed);
      out.svg = out.svg.replace('<!--FRONT-->', '');
      return out;
    } finally { COLLECT = null; YOYO = false; MOTION = null; }
  }
  ANIMATE = !!opts.animate;
  MACH = null;
  try {
    const out = renderStatic(seed, opts);
    if (ANIMATE) out.stats.traits.motion = 'machine';
    return out;
  } finally { ANIMATE = false; MACH = null; }
}

function renderStatic(seed, opts = {}) {
  THEME = null;
  ROT = false;
  FACEW = null;
  PHANTOM = false;
  if (opts.theme && opts.theme !== 'off') {
    const tr = C.rng((seed * 2654435761 + 97) >>> 0);
    const name = opts.theme === 'seed' ? (opts.palette ? themeOf(opts.palette) : tr.pick(Object.keys(THEMES))) : THEMES[opts.theme] ? opts.theme : null;
    if (name) {
      THEME = { name, r: tr };
      opts = { ...opts, palette: opts.palette || tr.pick(THEMES[name].palettes) };
    }
  }
  const r = C.rng(seed), rs = C.rng((seed * 7919 + 13) >>> 0);
  const DK = opts.deck ? DECKS[opts.deck] : null;
  if (opts.deck && !DK) throw new Error('unknown deck ' + opts.deck);
  DKC = DK;
  if (DK && DK.palette && !opts.palette) opts = { ...opts, palette: DK.palette };
  const T = traitsFor(r, rs, opts);
  // every deck owns its signature alone: the red accent thread only where the deck has it (Marked Cards)
  if (DK) { T.deck = DK.name; if (DK.ties && T.rank > 1) T.ties = DK.ties; T.accent = 'none'; }
  if (THEME) T.theme = THEME.name;
  T.rare = 'none';
  if (T.weave !== 'contour') {
    // the weave rule this card writes for itself (its own stream: nothing else on the card moves)
    const rw = C.rng((seed * 1597334677 + 11) >>> 0);
    const classic = rw() < 0.2;
    const m0 = classic ? 1 : 1.3 + 3.9 * Math.pow(rw(), 1.2);
    const kf = classic ? rw.range(0.14, 0.46) : rw() < 0.35 ? 0 : rw.range(0.04, 0.3);
    const rule = classic ? 'uniform' : rw.weighted([['uniform', 5], ['size', 3], ['radius', 2]]);
    T.cw = { m0, kf, rule, spread: rw.range(0.5, 1.3), fams: T.rank === 1 ? (rw() < 0.5 ? 2 : 3) : 1, k2: rw.range(0.06, 0.16) };
    T.weave = weaveName(m0, kf);
    T.rule = rule === 'uniform' ? 'One for all' : rule === 'size' ? 'By size' : 'By distance';
  }
  if (DK && typeof DK.weave === 'string') { T.cw = undefined; T.weave = DK.weave; T.rule = 'Deck'; }
  else if (DK && DK.weave) {
    const w = DK.weave;
    T.cw = { m0: w.m0, kf: w.kf, rule: 'uniform', spread: 1, fams: w.fams || 1, k2: w.k2 || 0.1 };
    T.weave = weaveName(w.m0, w.kf); T.rule = 'Deck';
  }
  if (opts.weaveTest) {
    const w = opts.weaveTest;
    if (w === 'contour' || w === 'mandala') { T.cw = undefined; T.weave = w; T.rule = 'Test'; }
    else { T.cw = { m0: w.m0, kf: w.kf, rule: 'uniform', spread: 1, fams: w.fams || 1, k2: w.k2 || 0.1 }; T.weave = weaveName(w.m0, w.kf); T.rule = 'Test'; }
  }
  if (DK && DK.upright) T.turn = 'upright';
  if (DK && DK.spin) T.turn = 'thrown';
  if (DK && DK.flow && T.rank > 1) T.flow = DK.flow;
  if (DK && DK.wild) { T.wild = true; T.weave = 'Wild'; T.rule = 'Deck'; }
  if (DK && DK.bands && T.rank > 1) { T.bands = 'uniform'; T.style = DK.bands; if (DK.weight) T.weight = DK.weight; }
  if ((opts.eyes && !DK) || (DK && DK.eye)) {
    // one gaze for the whole card, from its own stream so no other trait moves
    const re = C.rng((seed * 15485863 + 29) >>> 0);
    const a = re.range(0, Math.PI * 2), m = re.range(0.35, 1);
    T.eye = { gx: Math.cos(a) * m, gy: Math.sin(a) * m, rho: re.range(0.05, 0.13), dot: re() < 0.5, pick: re(), ...(opts.eye || {}) };
  }
  if (DK && DK.lean) T.lean = (T.eye && T.eye.gx < 0 ? -1 : 1) * (0.28 + 0.3 * Math.abs(T.eye ? T.eye.gx : 0.5));
  // a fade palette draws its angle and start from the card stream; an overriding palette (a theme or a filter)
  // would shift every later draw and move the whole composition. So the seed's own palette always takes its
  // draws, and an overriding one takes its own from a side stream: same seed, same composition, any palette.
  let P = resolvePalette(PALETTES[NATIVE], r);
  if (T.palette !== NATIVE) P = resolvePalette(PALETTES[T.palette], C.rng((seed * 40503 + 211) >>> 0));
  // a theme that dyes the pips in its own light (aurora: the pips take the sky's colours, not red and black)
  if (THEME && THEMES[THEME.name].ink === 'thread') P = { ...P, ink: P.thread, index: typeof P.thread === 'string' ? P.thread : sample(P.thread, 92, 160, { hero: { x: C.W / 2, y: C.H / 2 } }) };
  GLINT = !P.flat;
  const FIGC = T.rank >= 11 && !!opts.figure;
  if (T.rank >= 11 && !FIGC) return renderCourt(seed, r, T, P);
  if (FIGC) ROT = true;
  const n = T.rank, unit = D.UNITS[T.suit];
  // the composition rule this card writes for itself (its own stream); a filter may force a family
  const rc = C.rng((seed * 3266489917 + 7) >>> 0);
  const forced = ['bloom', 'nest', 'classic', 'free', 'mirror'].includes(opts.layout) ? opts.layout : null;
  let fam = n === 1 ? (rc() < 0.12 ? 'classic' : 'free') : rc.weighted([['free', 6], ['bloom', n >= 3 ? 1.6 : 0], ['nest', 1], ['classic', 0.6]]);
  if (forced) fam = forced === 'mirror' ? 'free' : forced;
  if (DK && DK.fam) fam = DK.fam;
  if (DK && DK.mirror === true && n <= 2) fam = 'classic';
  if (FIGC) fam = 'free';
  if (fam === 'classic') T.turn = 'upright';
  if (fam === 'bloom') { const L = n >= 3 ? bloomLayout(r, n) : null; if (L) { T.layout = 'bloom'; T.symmetry = 'rotational'; T.scale = 'even'; return renderBloom(r, T, P, unit, L); } fam = 'free'; }
  if (fam === 'nest') { const L = n >= 2 ? nestLayout(r, n) : null; if (L) { T.layout = 'nest'; T.symmetry = 'concentric'; T.scale = 'taper'; return renderNest(r, T, P, unit, L); } fam = 'free'; }
  // the rare switches this card may carry (its own stream; a filter may force one)
  const rr = C.rng((seed * 2246822507 + 17) >>> 0);
  const R = { rr, bleed: rr() < 0.03, phantom: rr() < 0.02, swarm: rr() < 0.03, argus: rr() < 0.03, crimson: rr() < 0.025, mono: rr() < 0.03 };
  if (['bleed', 'phantom', 'swarm', 'argus', 'crimson', 'mono'].includes(opts.rare)) R[opts.rare] = true;
  if (opts.rare === 'none' || DK) for (const k of ['bleed', 'phantom', 'swarm', 'argus', 'crimson', 'mono']) R[k] = false;
  if (DK && DK.bleed) R.bleed = true;
  if (fam === 'classic') { R.bleed = false; R.swarm = false; }
  if (R.swarm) R.bleed = false;
  if (n < 3) R.phantom = false; // an ace or a 2 has too few threads to trace anything: a phantom ace was a blank card
  if (R.phantom) R.argus = false;
  if (R.argus && T.eye) T.eye.all = true;
  PHANTOM = R.phantom;
  T.rare = [['bleed', 'Bleed'], ['phantom', 'Phantom'], ['swarm', 'Swarm'], ['argus', 'Argus'], ['crimson', 'Crimson'], ['mono', 'Monofilament']].filter(([k]) => R[k] && (k !== 'argus' || T.eye)).map(([, v]) => v).join(' + ') || 'none';
  let pips = FIGC ? courtFigure(rc, T.rank, T.suit, opts.figure) : fam === 'classic' ? D.pipLayout(n) : (DK && DK.layout && (n > 1 || DK.aceLayout) ? DK.layout(rc, n, R) : DK && DK.couple ? couples(rc, n, R) : compose(rc, n, forced === 'mirror' || (DK && DK.mirror === true) ? true : DK && DK.mirror === false ? false : undefined, R));
  if (!pips) { fam = 'free'; pips = scatter(r, n); }
  if (!pips) { fam = 'classic'; pips = D.pipLayout(n); }
  if (fam === 'classic' && n === 1) pips = pips.map((p) => ({ ...p, size: 440 }));
  const mirror = pips.some((p) => p.twin !== undefined);
  if (mirror && rc() < 0.5 && n > 1 && !(DK && DK.ties)) T.ties = 'mirror';
  if (!mirror && T.ties === 'mirror') T.ties = 'nearest';
  Object.assign(T, fam === 'classic' ? { layout: 'classic', symmetry: 'mirror', scale: 'even' } : measureLayout(pips));
  if (FIGC) Object.assign(T, { layout: 'figure', symmetry: 'turned', ties: 'figure', veil: 'none' });
  if (FIGC && opts.faceScale !== 0) { const H = pips.findIndex((p) => p.part === 'head'), ha = pips[H].a || 0; const hb = pips.find((p) => p.part === 'halberd'), look = hb ? (hb.x < pips[H].x ? 1 : -1) : 0; FACEW = { ['p' + H]: { up: [Math.sin(ha), -Math.cos(ha)], rank: T.rank, look, fs: opts.faceScale === undefined ? 1 : opts.faceScale }, ['p' + pips[H].twin]: { up: [-Math.sin(ha), Math.cos(ha)], rank: T.rank, look, fs: opts.faceScale === undefined ? 1 : opts.faceScale } };
    const fr = C.rng((seed * 48271 + 11) >>> 0), mv = { ph: fr.range(0, 2 * Math.PI), gk: fr.pick([1, 2]), vk: fr.pick([2, 3]), mk: fr.pick([2, 3]), bl: [fr.range(0.14, 0.28), fr.range(0.44, 0.6), fr.range(0.74, 0.9)] };
    for (const k of Object.keys(FACEW)) FACEW[k].mv = mv; }

  if (DK && DK.tell) {
    const rt = C.rng((seed * 1103515245 + 12345) >>> 0);
    T.tellIdx = rt.int(0, pips.length - 1); T.tellA = (rt() < 0.5 ? -1 : 1) * rt.range(0.45, 0.6);
  }
  if (DK && DK.hole) T.hole = 'p' + pips.reduce((m, p, i) => (p.size > pips[m].size ? i : m), 0);
  // shapes: turned pips; a left twin is its right twin reflected, outline, nails and all
  const N0 = r.pick([72, 96, 120]);
  const polys = [], nails = [], objSeed = [];
  pips.forEach((p, i) => {
    if (p.left) return;
    const a = p.a !== undefined ? p.a : DK && DK.spin ? r.range(-1.3, 1.3) : DK && DK.tell ? (i === T.tellIdx ? T.tellA : 0) : DK && DK.lean ? T.lean : T.turn === 'turned' && !(mirror && p.twin === undefined) ? r.range(-0.6, 0.6) : 0;
    polys[i] = turnPoly(C.placeShape(unit, p.x, p.y, p.size, fam === 'classic' && !!p.flip), a, p.x, p.y);
    nails[i] = resample(polys[i], Math.round(N0 * Math.min(p.bleed ? 3.4 : n === 1 ? 2 : 1.6, Math.max(0.6, p.size / 132))));
    objSeed[i] = r.int(1, 1e9);
  });
  pips.forEach((p, i) => { if (p.left) { polys[i] = polys[p.twin].map(mx); nails[i] = nails[p.twin].map(mx); objSeed[i] = objSeed[p.twin]; } });
  const centres = pips.map((p) => [p.x, p.y]);
  if (T.eye) {
    // the eye is the card's one focal point: its largest pip (ties drawn from the eye stream) and that
    // pip's mirror twin, so a mirrored card looks out through a pair. eye.all puts it in every pip.
    const max = Math.max(...pips.map((p) => p.size));
    const cand = pips.map((_, i) => i).filter((i) => pips[i].size >= max * 0.97 && !pips[i].left);
    const k = cand[Math.floor(T.eye.pick * cand.length)];
    T.eye.on = PHANTOM ? [] : T.eye.all ? pips.map((_, i) => 'p' + i) : ['p' + k].concat(pips[k].twin === undefined ? [] : ['p' + pips[k].twin]);
  }
  if (DK && DK.lean) T.turn = 'leaning';
  const half0 = r.int(12, 20);
  const pairs = pairsFor8(T.ties, pips, r);

  // ---- bands ----
  const perPair = DK && DK.perPair ? DK.perPair(n) : n === 2 ? 3 : n === 3 ? 2 : 1;
  const swirl = r.range(0.45, 0.9) * (r() < 0.5 ? 1 : -1);
  const turnFor = () => (T.flow === 'direct' ? 0 : T.flow === 'swirl' ? swirl : r.range(-0.9, 0.9));
  const pickWeight = () => (T.weight === 'mixed' ? r.weighted([['fine', 2], ['regular', 5], ['heavy', 2]]) : T.weight);
  const twinOf = (i) => (pips[i].twin === undefined ? i : pips[i].twin);
  const bands = [], done = new Set();
  const key = (i, j) => Math.min(i, j) + '-' + Math.max(i, j);
  for (const [i, j] of pairs) {
    if (done.has(key(i, j))) continue;
    done.add(key(i, j));
    const mi = twinOf(i), mj = twinOf(j);
    const BS = FIGC && pips[i].spec ? pips[i].spec[j] || null : null, PP = BS && BS.n ? BS.n : perPair;
    for (let k = 0; k < PP; k++) {
      const spread = (k - (PP - 1) / 2) * (n <= 3 ? 1.05 : 0.75);
      const style = BS && BS.style ? BS.style : T.bands === 'mixed' ? r.weighted(STYLES) : T.style;
      // low cards: wide arcs, so the few bands they have open into broad hourglasses
      const minN = Math.min(nails[i].length, nails[j].length), hCap = Math.floor(minN / (n <= 3 ? 2.8 : 4));
      const h0 = Math.min(hCap, n <= 3 ? r.int(Math.floor(minN / 6), Math.floor(minN / 2.8)) : T.bands === 'mixed' ? r.int(8, 22) : half0);
      const h = BS && BS.share ? Math.max(1, Math.round(BS.share * minN)) : DK && DK.half ? Math.min(h0, DK.half(n)) : h0;
      const sh = () => r.int(-Math.floor(h / 2), Math.floor(h / 2));
      const weight = BS && BS.weight ? BS.weight : pickWeight();
      const a = BS ? facingArc(nails[i], centres[i], centres[j], h, 0, 0) : facingArc(nails[i], centres[i], centres[j], h, sh(), turnFor() + spread);
      if (mirror && mj === i) {
        // a pip and its twin: the far arc is the near one reflected, so the band is its own mirror image
        const m = a.length, b = a.map(mx);
        const PAR = (q) => (ROT ? b[m - 1 - q] : b[q]), CRS = (q) => (ROT ? b[q] : b[m - 1 - q]);
        const threads = style === 'straight' || style === 'single' ? a.map((p, q) => [p, PAR(q)]).filter((_, q) => style !== 'single' || q % Math.max(1, Math.floor(m / 4)) === 0) : a.map((p, q) => [p, CRS(q)]);
        bands.push({ style, weight, a, b, threads, ends: [i, j] });
        continue;
      }
      const b = BS ? facingArc(nails[j], centres[j], centres[i], h, 0, 0) : facingArc(nails[j], centres[j], centres[i], h, sh(), turnFor() - spread);
      const band = { style, weight, a, b, ends: [i, j] };
      if (BS && BS.point) { const [p, q] = BS.point === 'to' ? [b, a] : [a, b], mid = Math.floor(p.length / 2), w = 1; band.threads = q.map((x, t) => (BS.point === 'to' ? [x, p[mid - w + (t % (2 * w + 1))]] : [p[mid - w + (t % (2 * w + 1))], x])); }
      if (mirror && !(mi === i && mj === j)) {
        band.threads = band.threads || threadsFor(style, a, b, r);
        bands.push(band);
        if (!done.has(key(mi, mj)) || k > 0) {
          const copy = { style, weight, a: a.map(mx), b: b.map(mx), threads: band.threads.map(([p, q]) => [mx(p), mx(q)]), mate: band, ends: [mi, mj] };
          band.mate = copy;
          bands.push(copy);
        }
        continue;
      }
      bands.push(band);
    }
    if (mirror) done.add(key(mi, mj));
  }
  if (R.mono) for (const b of bands) {
    // monofilament: one heavier thread, the middle one (a mirror copy keeps the mirror of it)
    const th = b.threads || [[b.a[Math.floor(b.a.length / 2)], b.b[Math.floor(b.b.length / 2)]]];
    b.threads = [th[Math.floor(th.length / 2)]];
    b.style = 'single'; b.weight = 'heavy';
  }
  for (const b of bands) if (b.mate && b.threads) b.mate.threads = b.threads.map(([p, q]) => [mx(p), mx(q)]);
  markRed(T, bands);
  for (const b of bands) if (b.red && b.mate) b.mate.red = true; // a red band and its mirror image both
  if (R.crimson) {
    // crimson: every band in the accent red, a brighter one on a dark board
    const bc = typeof P.board === 'string' ? P.board : (P.board.stops[0][1] || P.board.stops[0]);
    const dark = hex(bc).reduce((a, v) => a + v, 0) < 300;
    P = { ...P, accent: P.accent || (dark ? '#e0303a' : '#c8102e') };
    for (const b of bands) b.red = true;
  }

  if (DK && DK.sword) {
    const hi = pips.reduce((m, p, i) => (p.size > pips[m].size ? i : m), 0), hc = centres[hi];
    const nearest = (ring, tx, ty) => ring.reduce((b, pt) => (Math.hypot(pt[0] - tx, pt[1] - ty) < Math.hypot(b[0] - tx, b[1] - ty) ? pt : b), ring[0]);
    let best = null;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (i === hi || j === hi) continue;
      const [ax, ay] = centres[i], [bx, by] = centres[j], L2 = (bx - ax) ** 2 + (by - ay) ** 2, t = ((hc[0] - ax) * (bx - ax) + (hc[1] - ay) * (by - ay)) / L2;
      if (t < 0.2 || t > 0.8) continue;
      const dist = Math.hypot(ax + t * (bx - ax) - hc[0], ay + t * (by - ay) - hc[1]);
      if (dist < pips[hi].size * 0.18 && (!best || dist < best.dist)) best = { i, j, dist };
    }
    let a, b, ends;
    if (best) { a = nearest(nails[best.i], centres[best.j][0], centres[best.j][1]); b = nearest(nails[best.j], centres[best.i][0], centres[best.i][1]); ends = [best.i, best.j]; }
    else if (n >= 2) {
      // from the pip farthest from the king, through his centre, to his far rim
      const k = [...Array(n).keys()].filter((x) => x !== hi).sort((x, y) => Math.hypot(centres[y][0] - hc[0], centres[y][1] - hc[1]) - Math.hypot(centres[x][0] - hc[0], centres[x][1] - hc[1]))[0];
      a = nearest(nails[k], hc[0], hc[1]);
      const ux = hc[0] - a[0], uy = hc[1] - a[1], L = Math.hypot(ux, uy) || 1;
      b = nearest(nails[hi], hc[0] + (ux / L) * pips[hi].size, hc[1] + (uy / L) * pips[hi].size);
      ends = [k, hi];
    } else { const ring = nails[0], N = ring.length; a = ring[Math.round(N * 0.12)]; b = nearest(ring, 2 * hc[0] - a[0], 2 * hc[1] - a[1]); ends = [0, 0]; }
    bands.push({ style: 'single', weight: 'sword', a: [a], b: [b], threads: [[a, b]], ends, solid: true, color: P.sword || null });
    T.sword = true;
  }
  if (FIGC) pips.forEach((p, i) => (p.rods || []).forEach((d) => {
    const near = (ring, [tx, ty]) => ring.reduce((b, q) => (Math.hypot(q[0] - tx, q[1] - ty) < Math.hypot(b[0] - tx, b[1] - ty) ? q : b), ring[0]);
    const a = near(nails[i], d.from), b = near(nails[d.to], d.at);
    for (const [u, v, e] of [[a, b, [i, d.to]], [mx(a), mx(b), [twinOf(i), twinOf(d.to)]]]) bands.push({ style: 'single', weight: 'sword', a: [u], b: [v], threads: [[u, v]], ends: e, solid: true, color: P.sword || null });
  }));
  if (DK && DK.mark) {
    const rm = C.rng((seed * 2654435761 + 1013) >>> 0);
    if (!P.accent) P = { ...P, accent: '#e0303a' };
    if (bands.length) {
      const b = bands[rm.int(0, bands.length - 1)];
      const th = b.threads || threadsFor(b.style, b.a, b.b, rm);
      const t = th[rm.int(Math.floor(th.length * 0.25), Math.max(Math.floor(th.length * 0.25), Math.ceil(th.length * 0.75) - 1))];
      bands.push({ style: 'single', weight: 'mark', a: b.a, b: b.b, threads: [t], ends: b.ends, red: true });
    } else {
      const ring = nails[0], N = ring.length, q = rm.int(0, N - 1), o = (q + Math.round(N * rm.range(0.3, 0.5))) % N;
      bands.push({ style: 'single', weight: 'mark', a: [ring[q]], b: [ring[o]], threads: [[ring[q], ring[o]]], ends: [0, 0], red: true });
    }
    T.accent = 'marked';
  }
  // ---- paint and draw ----
  const hero = pips.reduce((a, p) => (p.size > a.size ? p : a), pips[0]);
  const PS = paintSetup(P, T, hero, null);
  let inner = `<rect width="${C.W}" height="${C.H}" fill="${PS.boardFill}"/>`;
  inner += groundLayer(T.ground, pips.map((p, i) => ({ x: p.x, y: p.y, size: p.size, poly: polys[i] })), pairs, P, PS, r, PS.nail);
  if (T.veil !== 'none') {
    const sides = [];
    pips.forEach((p, i) => { if (!p.left) sides[i] = r() < 0.25 ? -1 : 1; });
    pips.forEach((p, i) => { if (p.left) sides[i] = sides[p.twin]; });
    let pts = veilPath(pips, sides);
    if (!pts) pts = veilPath(pips, sides.map(() => 1));
    if (pts) inner += drawVeil(pts, T.veil, P, PS, r, PS.nail);
    else T.veil = 'none';
  }
  if (ANIMATE) MACH = planMachine(pips.map((p, i) => ({ c: centres[i], size: p.size, id: 'p' + i })), bands, C.rng(seed + 31));
  inner += drawBands8(bands, P, r, PS.strokeFor);
  if (MACH) {
    MACH.rigid = true;
    pips.forEach((p, i) => {
      let obj = drawObject(nails[i], polys[i], centres[i], T, C.rng(objSeed[i]), PS.ink, PS.ctx, 'p' + i);
      for (const [x, y] of nails[i].filter((_, q) => q % 2 === 0)) obj += pin(x, y, 2, PS.nail);
      inner += turning(centres[i][0], centres[i][1], MACH.turns['p' + i], obj);
    });
  } else {
    pips.forEach((p, i) => {
      const obj = drawObject(nails[i], polys[i], centres[i], T, C.rng(objSeed[i]), PS.ink, PS.ctx, 'p' + i);
      if (!PHANTOM) inner += obj;
      else if (COLLECT) { const o = COLLECT.objs[COLLECT.objs.length - 1]; o.svg = ''; o.weave = null; }
    });
    if (!PHANTOM) for (const ring of nails) for (const [x, y] of ring.filter((_, q) => q % 2 === 0)) inner += pin(x, y, 2, PS.nail);
  }

  const base = typeof P.board === 'string' ? P.board : sample(P.board, C.W / 2, C.H / 2, PS.ctx);
  return { svg: D.cardSvg(inner, { board: base, rank: n, suit: T.suit, indexColor: PS.indexColor, defs: PS.ctx.defs }), stats: { traits: T, pips: pips.length, bands: bands.length } };
}

module.exports = { render, PALETTES, STYLISED, FADES, THEMES, YOYO_CYCLES, DECKS };
// building blocks for other card designs (the court study), without the machine recorder
module.exports.internals = { drawObject: drawObject0, eyeWeave, paintSetup, resolvePalette, resample, facingArc, bandThreads, strands, seg, pin, sample, paint, WEIGHTS, setGlint: (v) => { GLINT = v; } };

};
self.onmessage = function (e) {
  var d = e.data;
  try { var o = __req('./string26.cjs').render(d.seed, d.opts || {}); self.postMessage({ id: d.id, machine: o.machine }); }
  catch (err) { self.postMessage({ id: d.id, error: String(err && err.message || err) }); }
};
