export const name = 'glitch-zoom';

export function randomParams(rng) {
  const zoomCount = 2 + Math.floor(rng() * 5);
  const zooms = [];
  for (let i = 0; i < zoomCount; i++) {
    zooms.push({
      x: rng() * 0.7,
      y: rng() * 0.7,
      w: 0.1 + rng() * 0.3,
      h: 0.1 + rng() * 0.3,
      zoom: 1.5 + rng() * 3.5,
      offsetX: (rng() * 2 - 1) * 0.3,
      offsetY: (rng() * 2 - 1) * 0.3,
    });
  }
  return { zooms };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const tIntensity = 0.4 + t * 0.8;

  for (const z of params.zooms) {
    const rx = Math.floor(z.x * width);
    const ry = Math.floor(z.y * height);
    const rw = Math.floor(z.w * width);
    const rh = Math.floor(z.h * height);
    const zoom = 1 + (z.zoom - 1) * tIntensity;
    const ox = Math.floor(z.offsetX * width);
    const oy = Math.floor(z.offsetY * height);

    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const tx = rx + dx;
        const ty = ry + dy;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
        const srcX = clamp(Math.floor(rx + ox + dx / zoom), 0, width - 1);
        const srcY = clamp(Math.floor(ry + oy + dy / zoom), 0, height - 1);
        const di = (ty * width + tx) * 4;
        const si = (srcY * width + srcX) * 4;
        data[di]     = src[si];
        data[di + 1] = src[si + 1];
        data[di + 2] = src[si + 2];
      }
    }
  }
  return imageData;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
