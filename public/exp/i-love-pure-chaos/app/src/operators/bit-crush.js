export const name = 'bit-crush';

export function randomParams(rng) {
  return {
    rTarget: 1 + Math.floor(rng() * 4),
    gTarget: 1 + Math.floor(rng() * 4),
    bTarget: 1 + Math.floor(rng() * 4),
    posterize: rng() < 0.3,
  };
}

export function apply(imageData, params, t) {
  const { data } = imageData;
  const crushAmount = 0.2 + t * 0.8;
  const rBits = Math.max(1, Math.round(8 - (8 - params.rTarget) * crushAmount));
  const gBits = Math.max(1, Math.round(8 - (8 - params.gTarget) * crushAmount));
  const bBits = Math.max(1, Math.round(8 - (8 - params.bTarget) * crushAmount));
  const rMask = (0xff << (8 - rBits)) & 0xff;
  const gMask = (0xff << (8 - gBits)) & 0xff;
  const bMask = (0xff << (8 - bBits)) & 0xff;

  if (params.posterize) {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = (data[i]     & rMask) | (rMask >> 1);
      data[i + 1] = (data[i + 1] & gMask) | (gMask >> 1);
      data[i + 2] = (data[i + 2] & bMask) | (bMask >> 1);
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = data[i]     & rMask;
      data[i + 1] = data[i + 1] & gMask;
      data[i + 2] = data[i + 2] & bMask;
    }
  }
  return imageData;
}
