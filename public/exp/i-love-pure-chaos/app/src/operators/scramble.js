export const name = 'scramble';

export function randomParams(rng) {
  return {
    xorMask: Math.floor(rng() * 256),
    rotateBits: 1 + Math.floor(rng() * 7),
    mode: ['xor', 'rotate', 'invert-g'][Math.floor(rng() * 3)],
  };
}

export function apply(imageData, params, t) {
  const { data } = imageData;
  const intensity = 0.3 + t * 0.9;
  const maskFull = params.xorMask;
  const mask = Math.floor(maskFull * intensity);

  if (params.mode === 'xor') {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = data[i]     ^ mask;
      data[i + 1] = data[i + 1] ^ mask;
      data[i + 2] = data[i + 2] ^ mask;
    }
  } else if (params.mode === 'rotate') {
    const r = params.rotateBits;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = rotL(data[i], r);
      data[i + 1] = rotL(data[i + 1], r);
      data[i + 2] = rotL(data[i + 2], r);
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = data[i]     ^ mask;
      data[i + 1] = (~data[i + 1]) & 0xFF;
      data[i + 2] = data[i + 2] ^ mask;
    }
  }
  return imageData;
}

function rotL(v, n) {
  return ((v << n) | (v >>> (8 - n))) & 0xFF;
}
