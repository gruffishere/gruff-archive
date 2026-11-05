export const name = 'palette-corrupt';

export function randomParams(rng) {
  const colorCount = 5 + Math.floor(rng() * 8);
  const palette = [];
  for (let i = 0; i < colorCount; i++) {
    palette.push([
      Math.floor(rng() * 255),
      Math.floor(rng() * 255),
      Math.floor(rng() * 255),
    ]);
  }
  const permutation = [];
  for (let i = 0; i < colorCount; i++) permutation.push(i);
  for (let i = permutation.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  return { palette, permutation, colorCount };
}

export function apply(imageData, params, t) {
  const { data } = imageData;
  const palette = params.palette;
  const perm = params.permutation;
  const pCount = palette.length;
  const swap = 0.3 + t * 0.7;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let p = 0; p < pCount; p++) {
      const pr = palette[p][0];
      const pg = palette[p][1];
      const pb = palette[p][2];
      const dr = pr - r, dg = pg - g, db = pb - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; bestIdx = p; }
    }
    const sp = palette[perm[bestIdx]];
    data[i]     = r * (1 - swap) + sp[0] * swap;
    data[i + 1] = g * (1 - swap) + sp[1] * swap;
    data[i + 2] = b * (1 - swap) + sp[2] * swap;
  }
  return imageData;
}
