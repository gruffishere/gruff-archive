export const name = 'chromatic-aberration';

export function randomParams(rng) {
  return {
    strength: 8 + rng() * 35,
    rSign: rng() < 0.5 ? -1 : 1,
    bSign: rng() < 0.5 ? -1 : 1,
    falloff: 1 + rng() * 1.5,
  };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const strength = params.strength * (0.4 + t * 0.9);
  const falloff = params.falloff;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 0.001) {
        continue;
      }
      const factor = Math.pow(r / maxR, falloff) * strength;
      const dxN = dx / r;
      const dyN = dy / r;

      const rxOff = Math.round(dxN * factor * params.rSign);
      const ryOff = Math.round(dyN * factor * params.rSign);
      const bxOff = Math.round(dxN * factor * params.bSign);
      const byOff = Math.round(dyN * factor * params.bSign);

      const rx = clamp(x + rxOff, 0, width - 1);
      const ry = clamp(y + ryOff, 0, height - 1);
      const bx = clamp(x + bxOff, 0, width - 1);
      const by = clamp(y + byOff, 0, height - 1);

      const i = (y * width + x) * 4;
      data[i]     = src[(ry * width + rx) * 4];
      data[i + 2] = src[(by * width + bx) * 4 + 2];
    }
  }
  return imageData;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
