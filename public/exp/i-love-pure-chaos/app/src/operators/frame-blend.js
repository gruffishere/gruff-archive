export const name = 'frame-blend';

export function randomParams(rng) {
  return {
    direction: rng() * Math.PI * 2,
    distance: 10 + rng() * 40,
    trailCount: 4 + Math.floor(rng() * 7),
    rDecay: 0.4 + rng() * 0.4,
    gDecay: 0.4 + rng() * 0.4,
    bDecay: 0.4 + rng() * 0.4,
  };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const dist = params.distance * (0.5 + t * 0.7);
  const dx = Math.cos(params.direction) * dist;
  const dy = Math.sin(params.direction) * dist;
  const trails = params.trailCount;
  const rD = params.rDecay;
  const gD = params.gDecay;
  const bD = params.bDecay;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      let rW = 0, gW = 0, bW = 0;

      for (let tr = 0; tr <= trails; tr++) {
        const sx = Math.round(x - dx * (tr / trails));
        const sy = Math.round(y - dy * (tr / trails));
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
        const si = (sy * width + sx) * 4;
        const wR = Math.pow(rD, tr);
        const wG = Math.pow(gD, tr);
        const wB = Math.pow(bD, tr);
        r += src[si] * wR;
        g += src[si + 1] * wG;
        b += src[si + 2] * wB;
        rW += wR;
        gW += wG;
        bW += wB;
      }

      const i = (y * width + x) * 4;
      data[i]     = rW > 0 ? r / rW : 0;
      data[i + 1] = gW > 0 ? g / gW : 0;
      data[i + 2] = bW > 0 ? b / bW : 0;
    }
  }
  return imageData;
}
