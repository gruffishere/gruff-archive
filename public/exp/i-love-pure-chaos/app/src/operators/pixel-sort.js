export const name = 'pixel-sort';

export function randomParams(rng) {
  return {
    threshold: 0.25 + rng() * 0.4,
    direction: rng() < 0.5 ? 'row' : 'col',
    sortBy: ['brightness', 'r', 'g', 'b'][Math.floor(rng() * 4)],
    invert: rng() < 0.5,
  };
}

function k(r, g, b, mode) {
  if (mode === 'brightness') return (r + g + b) / 3;
  if (mode === 'r') return r;
  if (mode === 'g') return g;
  return b;
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const threshold = params.threshold * 255 * (0.4 + t * 0.8);
  const invert = params.invert;

  if (params.direction === 'row') {
    for (let y = 0; y < height; y++) {
      let segStart = -1;
      for (let x = 0; x <= width; x++) {
        let inSeg = false;
        if (x < width) {
          const i = (y * width + x) * 4;
          const val = k(data[i], data[i + 1], data[i + 2], params.sortBy);
          inSeg = invert ? val < threshold : val > threshold;
        }
        if (inSeg && segStart < 0) segStart = x;
        if (!inSeg && segStart >= 0) {
          sortRow(data, width, y, segStart, x, params.sortBy);
          segStart = -1;
        }
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      let segStart = -1;
      for (let y = 0; y <= height; y++) {
        let inSeg = false;
        if (y < height) {
          const i = (y * width + x) * 4;
          const val = k(data[i], data[i + 1], data[i + 2], params.sortBy);
          inSeg = invert ? val < threshold : val > threshold;
        }
        if (inSeg && segStart < 0) segStart = y;
        if (!inSeg && segStart >= 0) {
          sortCol(data, width, x, segStart, y, params.sortBy);
          segStart = -1;
        }
      }
    }
  }
  return imageData;
}

function sortRow(data, width, y, x0, x1, mode) {
  const len = x1 - x0;
  if (len < 2) return;
  const pixels = new Array(len);
  for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 4;
    pixels[x - x0] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  pixels.sort((p, q) => k(p[0], p[1], p[2], mode) - k(q[0], q[1], q[2], mode));
  for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 4;
    const p = pixels[x - x0];
    data[i] = p[0]; data[i + 1] = p[1]; data[i + 2] = p[2]; data[i + 3] = p[3];
  }
}

function sortCol(data, width, x, y0, y1, mode) {
  const len = y1 - y0;
  if (len < 2) return;
  const pixels = new Array(len);
  for (let y = y0; y < y1; y++) {
    const i = (y * width + x) * 4;
    pixels[y - y0] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  pixels.sort((p, q) => k(p[0], p[1], p[2], mode) - k(q[0], q[1], q[2], mode));
  for (let y = y0; y < y1; y++) {
    const i = (y * width + x) * 4;
    const p = pixels[y - y0];
    data[i] = p[0]; data[i + 1] = p[1]; data[i + 2] = p[2]; data[i + 3] = p[3];
  }
}
