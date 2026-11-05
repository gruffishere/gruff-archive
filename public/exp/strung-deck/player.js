// STRUNG DECK canvas player (page/player.js from the deck project): runMachine(canvas, machine, { width, play }).
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

// The machine player. Draws a card's machine description (render(seed, { machine: true }).machine) on a
// canvas: the still back layer, then every thread between its two nails as they turn, then every
// turning object. Threads are redrawn each frame from their tied ends, so nothing comes loose.
// runMachine(canvas, M, { width, dpr, play }) -> Promise<{ drawAt(t), stop() }>
// With M.yoyo the same machine plays as a yoyo: every object slides out along its tie and back (carrying the
// objects that hang from it) and turns as it travels, unwinding out and winding up back; see string18.
// M.coins, M.unravel and M.breath play it three more ways (string19); M.caustic (string20) draws the weaves
// itself: the times tables (thread i -> m * i + k round the rim, m easing 1 -> top -> 1) and eyes that look around.
// Every object's pose is a 2x2 matrix
// and an offset about its centre, so a turn, a coin's squash or a swell all go through the same draw.
function runMachine(canvas, M, opt) {
  opt = opt || {};
  const W = 1000, H = 1400, BEAD = 24;
  const dpr = opt.dpr || Math.min(2, window.devicePixelRatio || 1);
  const cssW = opt.width || canvas.clientWidth || 500;
  const pxW = Math.round(cssW * dpr), pxH = Math.round((pxW * H) / W), k = pxW / W;
  canvas.width = pxW;
  canvas.height = pxH;
  const g = canvas.getContext('2d');
  const urls = [];
  const load = (svg) => new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    urls.push(url);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image'));
    im.src = url;
  });
  const raster = (im, w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k));
    c.height = Math.max(1, Math.ceil(h * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c;
  };
  const paint = (p) => {
    if (p.type === 'solid') return p.color;
    const gr = p.type === 'linear' ? g.createLinearGradient(p.x1, p.y1, p.x2, p.y2) : g.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, p.r);
    for (const [o, c] of p.stops) gr.addColorStop(Math.max(0, Math.min(1, o)), c);
    return gr;
  };
  return Promise.all([load(M.back), ...M.objs.map((o) => load(o.svg))]).then(([backIm, ...objIms]) => {
    const back = raster(backIm, W, H);
    const sprites = objIms.map((im, i) => raster(im, M.objs[i].box[2], M.objs[i].box[3]));
    urls.forEach((u) => URL.revokeObjectURL(u));
    const paints = M.bands.map((b) => paint(b.paint));
    const n = M.objs.length, ox = new Float64Array(n), oy = new Float64Array(n), dd = new Float64Array(n);
    const m00 = new Float64Array(n), m01 = new Float64Array(n), m10 = new Float64Array(n), m11 = new Float64Array(n);
    const turn = (i, a, s = 1) => { const c = Math.cos(a) * s, d = Math.sin(a) * s; m00[i] = c; m01[i] = -d; m10[i] = d; m11[i] = c; };
    const Co = M.coins || null, Un = M.unravel || null, Br = M.breath || null, Ca = M.caustic || null;
    const inkPaint = Ca ? paint(Ca.ink) : null;
    // the caustic dance (string21): every woven pip's threads and every band end on a pip follow that pip's
    // times table, rim point p -> m * p with the weave's own reach melting away, m easing 1 -> top -> 1
    const em = new Float64Array(n), mm = new Float64Array(n).fill(1);
    // a point p (in nail units) round a rim; a tiny negative p wraps to N - 1e-15, which rounds to N itself, so the
    // index is folded back into the rim (an index of N crashed the frame at t = 33 s of #69602)
    const rimAt = (R, p) => { const N = R.length; if (!(p === p)) p = 0; p %= N; if (p < 0) p += N; let a = Math.floor(p); if (a >= N) { a = 0; p = 0; } const b = (a + 1) % N, u = p - a; return [R[a][0] + (R[b][0] - R[a][0]) * u, R[a][1] + (R[b][1] - R[a][1]) * u]; };
    const wrapD = (d, N) => { d %= N; if (d > N / 2) d -= N; if (d < -N / 2) d += N; return d; };
    // each band thread end as an index on its pip's rim, and per band side the middle of its arc
    const bandRim = Ca ? M.bands.map((b) => {
      const idx = b.threads.map((t) => [t[0], t[3]].map((side, s) => {
        const o = Ca.objs[b.ends[side]], x = s ? t[4] : t[1], y = s ? t[5] : t[2];
        if (!o) return -1;
        let best = 0, bd = Infinity;
        o.ring.forEach(([rx, ry], q) => { const d2 = (rx - x) ** 2 + (ry - y) ** 2; if (d2 < bd) { bd = d2; best = q; } });
        return best;
      }));
      const mid = [0, 1].map((side) => {
        const o = Ca.objs[b.ends[side]];
        if (!o) return 0;
        const N = o.ring.length;
        let sx = 0, sy = 0;
        b.threads.forEach((t, ti) => [t[0], t[3]].forEach((sd, s) => { if (sd === side && idx[ti][s] >= 0) { const a = (2 * Math.PI * idx[ti][s]) / N; sx += Math.cos(a); sy += Math.sin(a); } }));
        let c = (Math.atan2(sy, sx) / (2 * Math.PI)) * N;
        return c < 0 ? c + N : c;
      });
      return { idx, mid };
    }) : null;
    // each pip's rim as it stands this frame (it turns about its centre, string22); the dance draws on it
    const rr = Ca ? Ca.objs.map((o) => (o ? o.ring.map((p) => [p[0], p[1]]) : null)) : null;
    // a band thread's two ends this frame: spread round each pip's rim from the arc's middle by that pip's m (at most 3)
    const bandEnd = (bi, ti) => {
      const b = M.bands[bi], t = b.threads[ti], br = bandRim[bi];
      return [0, 1].map((s) => {
        const side = s ? t[3] : t[0], oi = b.ends[side], o = Ca.objs[oi], ix = br.idx[ti][s];
        if (!o || ix < 0) return s ? [t[4], t[5]] : [t[1], t[2]];
        const N = o.ring.length, c = br.mid[side], mB = 1 + (Math.min(o.top, 3) - 1) * em[oi];
        return rimAt(rr[oi], c + wrapD(ix - c, N) * mB);
      });
    };
    const Yo = M.yoyo || null;
    // which end of a band is the one hanging from the other (its slide pays the thread out); -1 if neither
    const childEnd = M.bands.map((b) => (Yo ? (Yo.objs[b.ends[1]].p === b.ends[0] ? 1 : Yo.objs[b.ends[0]].p === b.ends[1] ? 0 : -1) : -1));
    function drawAt(t) {
      const f = (((t % M.loop) + M.loop) % M.loop) / M.loop;
      if (Yo) {
        // eased travel: s = (1 - cos) / 2 of a phase that lags with depth mid-cycle and meets at every rest
        const ph = f * Yo.cycles, w = Math.sin(Math.PI * ph) ** 2;
        for (const i of Yo.order) {
          const o = Yo.objs[i], s = (1 - Math.cos(2 * Math.PI * (ph - o.lag * w))) / 2;
          dd[i] = o.amp * s;
          ox[i] = (o.p === i ? 0 : ox[o.p]) + o.ux * dd[i];
          oy[i] = (o.p === i ? 0 : oy[o.p]) + o.uy * dd[i];
          turn(i, o.spin * s);
        }
      } else if (Co) {
        // a coin turning about an axis in the card: across the axis everything is scaled by cos (the depth is
        // dropped), along it nothing changes; m = I + (cos - 1) b b^T with b the unit vector across the axis
        for (let i = 0; i < n; i++) {
          const o = Co.objs[i], c = Math.cos(2 * Math.PI * o.k * f), bx = Math.cos(o.ax), by = Math.sin(o.ax);
          m00[i] = 1 + (c - 1) * bx * bx; m01[i] = m10[i] = (c - 1) * bx * by; m11[i] = 1 + (c - 1) * by * by; ox[i] = oy[i] = 0;
        }
      } else if (Un) {
        // a wander scaled by sin^2: whole at rest, a tangle midway, whole again
        const env = Math.sin(Math.PI * f * Un.cycles) ** 2;
        for (let i = 0; i < n; i++) {
          const o = Un.objs[i], a = 2 * Math.PI * f;
          ox[i] = env * o.mx * o.ax * Math.sin(o.nx * a + o.px);
          oy[i] = env * o.ay * Math.sin(o.ny * a + o.py);
          turn(i, env * o.spin);
        }
      } else if (Br) {
        for (let i = 0; i < n; i++) { const o = Br.objs[i], a = 2 * Math.PI * f; turn(i, o.a * Math.sin(o.n * a), 1 + o.b * Math.sin(o.m * a)); ox[i] = oy[i] = 0; }
      } else if (Ca) { // the pips hold still; their weaves and the bands dance
        for (let i = 0; i < n; i++) {
          const o = Ca.objs[i], a = o && o.dir ? o.dir * (o.k || 1) * 2 * Math.PI * f : 0;
          turn(i, a); ox[i] = oy[i] = 0;
          em[i] = o ? (1 - Math.cos(2 * Math.PI * o.cyc * f)) / 2 : 0; mm[i] = o ? 1 + (o.top - 1) * em[i] : 1;
          // whole turns a loop: the rim turns with the sprite, so threads, band ends and the dot stay on it
          if (o) { const c = M.objs[i].c, ca = Math.cos(a), sa = Math.sin(a); o.ring.forEach(([x, y], q) => { rr[i][q][0] = c[0] + (x - c[0]) * ca - (y - c[1]) * sa; rr[i][q][1] = c[1] + (x - c[0]) * sa + (y - c[1]) * ca; }); }
        }
      } else for (let i = 0; i < n; i++) turn(i, 2 * Math.PI * M.objs[i].turns * f);
      const X = (i, x, y) => { const c = M.objs[i].c, dx = x - c[0], dy = y - c[1]; return c[0] + ox[i] + dx * m00[i] + dy * m01[i]; };
      const Y = (i, x, y) => { const c = M.objs[i].c, dx = x - c[0], dy = y - c[1]; return c[1] + oy[i] + dx * m10[i] + dy * m11[i]; };
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, pxW, pxH);
      g.drawImage(back, 0, 0);
      g.setTransform(k, 0, 0, k, 0, 0);
      g.save();
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, W, H, 48); else g.rect(0, 0, W, H);
      g.clip();
      // threads: three interleaved strands per band, as in the still card
      M.bands.forEach((b, bi) => {
        g.strokeStyle = paints[bi];
        g.lineWidth = b.width;
        g.globalAlpha = b.opacity;
        g.setLineDash([]);
        for (let s = 0; s < 3; s++) {
          g.beginPath();
          for (let i = s; i < b.threads.length; i += 3) {
            const t = b.threads[i], A = b.ends[t[0]], B = b.ends[t[3]];
            if (Ca) { const [p, q] = bandEnd(bi, i); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); continue; }
            g.moveTo(X(A, t[1], t[2]), Y(A, t[1], t[2]));
            g.lineTo(X(B, t[4], t[5]), Y(B, t[4], t[5]));
          }
          g.stroke();
        }
        // beads run the way the belt travels; a themed card makes them of its own material (M.bead:
        // embers, pearls, gold, steel), with a soft glow first where the material has one
        g.lineCap = 'round';
        g.setLineDash([2, 22]);
        // a yoyo pays its thread out and takes it back: the beads ride the slide, from the holding end out
        const ce = childEnd[bi];
        g.lineDashOffset = Yo ? -(ce < 0 ? (dd[b.ends[0]] + dd[b.ends[1]]) / 2 : dd[b.ends[ce]]) : -((M.belt * f) % BEAD);
        g.beginPath();
        for (let ti = 0; ti < b.threads.length; ti++) {
          const t = b.threads[ti], A = b.ends[t[0]], B = b.ends[t[3]];
          let px, py, qx, qy;
          if (Ca) { const [p, q] = bandEnd(bi, ti); [px, py] = p; [qx, qy] = q; } else { px = X(A, t[1], t[2]); py = Y(A, t[1], t[2]); qx = X(B, t[4], t[5]); qy = Y(B, t[4], t[5]); }
          const fwd = Yo ? (ce === 0 ? t[0] === 1 : ce === 1 ? t[0] === 0 : t[6] > 0) : t[6] > 0;
          if (fwd) { g.moveTo(px, py); g.lineTo(qx, qy); } else { g.moveTo(qx, qy); g.lineTo(px, py); }
        }
        if (M.bead && M.bead.glow) {
          g.strokeStyle = M.bead.glow;
          g.lineWidth = b.width * 6;
          g.globalAlpha = 0.13;
          g.stroke();
        }
        g.strokeStyle = M.bead ? M.bead.core : paints[bi];
        g.lineWidth = b.width * (M.bead ? 2.4 : 2.2);
        g.globalAlpha = M.bead ? 0.8 : Math.min(1, b.opacity * 1.5);
        g.stroke();
        g.lineCap = 'butt';
      });
      g.setLineDash([]);
      g.globalAlpha = 1;
      // the caustic dance: each woven pip's threads re-strung by the times table, clipped to its rim
      if (Ca) Ca.objs.forEach((o, i) => {
        if (!o || o.rimOnly) return;
        const R = rr[i], N = R.length, ease = em[i], m = mm[i];
        g.save();
        g.beginPath();
        R.forEach(([x, y], q) => (q ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.clip();
        g.strokeStyle = inkPaint; g.lineWidth = o.w; g.globalAlpha = o.op;
        g.beginPath();
        // an eye's own threads (nail q to its tangent point p) melt into the table: m * q + (p - q)(1 - e)
        if (o.face) faceDraw(R, o.face, f, M.loop, (x1, y1, x2, y2) => { g.moveTo(x1, y1); g.lineTo(x2, y2); });
        else if (o.pairs) for (const [q, p0] of o.pairs) { const P = rimAt(R, m * q + wrapD(p0 - q, N) * (1 - ease)); g.moveTo(R[q][0], R[q][1]); g.lineTo(P[0], P[1]); }
        // a weave's chord families (reach k, both ways) and a contour pip's empty family (k = 0, zero length at rest)
        for (const k0 of o.ks) {
          const fam = k0 ? [k0 * (1 - ease), -k0 * (1 - ease)] : [0];
          for (let q = 0; q < N; q++) for (const s of fam) { const P = rimAt(R, m * q + s); g.moveTo(R[q][0], R[q][1]); g.lineTo(P[0], P[1]); }
        }
        g.stroke();
        if (o.dot && ease < 0.999) { const c = M.objs[i].c, dx = o.dot.c[0] - c[0], dy = o.dot.c[1] - c[1]; g.globalAlpha = 1 - ease; g.fillStyle = inkPaint; g.beginPath(); g.arc(c[0] + dx * m00[i] + dy * m01[i], c[1] + dx * m10[i] + dy * m11[i], o.dot.r, 0, 2 * Math.PI); g.fill(); }
        g.restore();
      });
      // the turning objects
      M.objs.forEach((o, i) => {
        g.save();
        g.translate(o.c[0] + ox[i], o.c[1] + oy[i]);
        g.transform(m00[i], m10[i], m01[i], m11[i], 0, 0);
        g.drawImage(sprites[i], o.box[0] - o.c[0], o.box[1] - o.c[1], o.box[2], o.box[3]);
        g.restore();
      });
      g.restore();
    }
    let raf = 0, start = 0;
    const tick = (now) => { if (!start) start = now; drawAt((now - start) / 1000); raf = requestAnimationFrame(tick); };
    if (opt.play !== false) raf = requestAnimationFrame(tick);
    else drawAt(0);
    return { drawAt, stop: () => cancelAnimationFrame(raf) };
  });
}
