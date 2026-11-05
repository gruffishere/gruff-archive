export const name = 'channel-shift';

export function randomParams(rng) {
  return {
    rdx: (rng() * 2 - 1) * 40,
    rdy: (rng() * 2 - 1) * 40,
    gdx: (rng() * 2 - 1) * 40,
    gdy: (rng() * 2 - 1) * 40,
    bdx: (rng() * 2 - 1) * 40,
    bdy: (rng() * 2 - 1) * 40,
  };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const scale = 0.3 + t * 0.9;
  const rdx = Math.round(params.rdx * scale);
  const rdy = Math.round(params.rdy * scale);
  const gdx = Math.round(params.gdx * scale);
  const gdy = Math.round(params.gdy * scale);
  const bdx = Math.round(params.bdx * scale);
  const bdy = Math.round(params.bdy * scale);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rx = clamp(x - rdx, 0, width - 1);
      const ry = clamp(y - rdy, 0, height - 1);
      const gx = clamp(x - gdx, 0, width - 1);
      const gy = clamp(y - gdy, 0, height - 1);
      const bx = clamp(x - bdx, 0, width - 1);
      const by = clamp(y - bdy, 0, height - 1);
      data[i]     = src[(ry * width + rx) * 4];
      data[i + 1] = src[(gy * width + gx) * 4 + 1];
      data[i + 2] = src[(by * width + bx) * 4 + 2];
    }
  }
  return imageData;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
