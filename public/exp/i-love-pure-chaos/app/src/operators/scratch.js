export const name = 'scratch';

export function randomParams(rng) {
  return {
    scratchCount: 3 + Math.floor(rng() * 14),
    dustCount: 30 + Math.floor(rng() * 220),
    color: rng() < 0.6 ? 'white' : 'black',
  };
}

export function apply(imageData, params, t, rng) {
  const { data, width, height } = imageData;
  const sc = Math.max(0, Math.floor(params.scratchCount * (0.4 + t * 0.8)));
  const dc = Math.max(0, Math.floor(params.dustCount * (0.4 + t * 0.8)));
  const v = params.color === 'white' ? 240 : 15;

  for (let s = 0; s < sc; s++) {
    const x0 = Math.floor(rng() * width);
    const y0 = Math.floor(rng() * height);
    const len = 20 + Math.floor(rng() * 120);
    const angle = rng() * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + dx * k);
      const y = Math.round(y0 + dy * k);
      if (x < 0 || x >= width || y < 0 || y >= height) break;
      const i = (y * width + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  }

  for (let d = 0; d < dc; d++) {
    const x = Math.floor(rng() * width);
    const y = Math.floor(rng() * height);
    const size = 1 + Math.floor(rng() * 3);
    for (let ddy = 0; ddy < size; ddy++) {
      for (let ddx = 0; ddx < size; ddx++) {
        const xx = x + ddx;
        const yy = y + ddy;
        if (xx >= width || yy >= height) continue;
        const i = (yy * width + xx) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
      }
    }
  }
  return imageData;
}
