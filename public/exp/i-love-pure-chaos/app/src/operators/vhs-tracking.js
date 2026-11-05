export const name = 'vhs-tracking';

export function randomParams(rng) {
  return {
    tearCount: 3 + Math.floor(rng() * 8),
    maxShift: 30 + rng() * 90,
    bandIntensity: 0.4 + rng() * 0.4,
  };
}

export function apply(imageData, params, t, rng) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const tears = [];
  for (let i = 0; i < params.tearCount; i++) {
    tears.push({
      y: Math.floor(rng() * height),
      shift: Math.floor((rng() * 2 - 1) * params.maxShift * (0.4 + t * 0.8)),
      thickness: 1 + Math.floor(rng() * 6),
    });
  }
  tears.sort((a, b) => a.y - b.y);

  let cumShift = 0;
  let nextTear = 0;
  for (let y = 0; y < height; y++) {
    while (nextTear < tears.length && y >= tears[nextTear].y) {
      cumShift += tears[nextTear].shift;
      nextTear++;
    }
    for (let x = 0; x < width; x++) {
      const sx = ((x + cumShift) % width + width) % width;
      const di = (y * width + x) * 4;
      const si = (y * width + sx) * 4;
      data[di]     = src[si];
      data[di + 1] = src[si + 1];
      data[di + 2] = src[si + 2];
    }
  }

  for (const tear of tears) {
    for (let dy = 0; dy < tear.thickness && tear.y + dy < height; dy++) {
      const y = tear.y + dy;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const factor = 1 + params.bandIntensity * (rng() - 0.5) * 2;
        data[i]     = clamp(data[i] * factor);
        data[i + 1] = clamp(data[i + 1] * factor);
        data[i + 2] = clamp(data[i + 2] * factor);
      }
    }
  }
  return imageData;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
