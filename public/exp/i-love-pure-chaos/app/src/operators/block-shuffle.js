export const name = 'block-shuffle';

export function randomParams(rng) {
  const sizes = [8, 16, 16, 24, 32, 32];
  return {
    blockSize: sizes[Math.floor(rng() * sizes.length)],
    shuffleAmount: 0.05 + rng() * 0.35,
    shiftMode: rng() < 0.4 ? 'shift' : 'swap',
    shiftRange: 30 + Math.floor(rng() * 100),
  };
}

export function apply(imageData, params, t, rng) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const bs = params.blockSize;
  const blocksX = Math.floor(width / bs);
  const blocksY = Math.floor(height / bs);
  const totalBlocks = blocksX * blocksY;
  if (totalBlocks < 2) return imageData;

  const count = Math.floor(totalBlocks * params.shuffleAmount * (0.3 + t * 0.8));

  if (params.shiftMode === 'shift') {
    const range = params.shiftRange;
    for (let s = 0; s < count; s++) {
      const ax = Math.floor(rng() * blocksX);
      const ay = Math.floor(rng() * blocksY);
      const dx = Math.floor((rng() * 2 - 1) * range);
      const dy = Math.floor((rng() * 2 - 1) * range);
      const sxPix = clamp(ax * bs + dx, 0, width - bs);
      const syPix = clamp(ay * bs + dy, 0, height - bs);
      copyBlock(data, src, width, ax * bs, ay * bs, sxPix, syPix, bs);
    }
  } else {
    for (let s = 0; s < count; s++) {
      const ax = Math.floor(rng() * blocksX);
      const ay = Math.floor(rng() * blocksY);
      const bxb = Math.floor(rng() * blocksX);
      const byb = Math.floor(rng() * blocksY);
      swapBlock(data, src, width, ax * bs, ay * bs, bxb * bs, byb * bs, bs);
    }
  }
  return imageData;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function copyBlock(data, src, width, dx, dy, sx, sy, bs) {
  for (let y = 0; y < bs; y++) {
    for (let x = 0; x < bs; x++) {
      const di = ((dy + y) * width + (dx + x)) * 4;
      const si = ((sy + y) * width + (sx + x)) * 4;
      data[di]     = src[si];
      data[di + 1] = src[si + 1];
      data[di + 2] = src[si + 2];
      data[di + 3] = src[si + 3];
    }
  }
}

function swapBlock(data, src, width, ax, ay, bx, by, bs) {
  for (let y = 0; y < bs; y++) {
    for (let x = 0; x < bs; x++) {
      const ai = ((ay + y) * width + (ax + x)) * 4;
      const bi = ((by + y) * width + (bx + x)) * 4;
      data[ai]     = src[bi];
      data[ai + 1] = src[bi + 1];
      data[ai + 2] = src[bi + 2];
      data[ai + 3] = src[bi + 3];
      data[bi]     = src[ai];
      data[bi + 1] = src[ai + 1];
      data[bi + 2] = src[ai + 2];
      data[bi + 3] = src[ai + 3];
    }
  }
}
