export const name = 'threshold';

export function randomParams(rng) {
  return {
    threshold: 0.35 + rng() * 0.3,
    tintLight: [
      Math.floor(rng() * 255),
      Math.floor(rng() * 255),
      Math.floor(rng() * 255),
    ],
    tintDark: [
      Math.floor(rng() * 60),
      Math.floor(rng() * 60),
      Math.floor(rng() * 60),
    ],
    tinted: rng() < 0.4,
  };
}

export function apply(imageData, params, t) {
  const { data } = imageData;
  const threshold = params.threshold * 255;
  const useTint = params.tinted;
  const tl = params.tintLight;
  const td = params.tintDark;

  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum > threshold) {
      if (useTint) { data[i] = tl[0]; data[i + 1] = tl[1]; data[i + 2] = tl[2]; }
      else { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
    } else {
      if (useTint) { data[i] = td[0]; data[i + 1] = td[1]; data[i + 2] = td[2]; }
      else { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; }
    }
  }
  return imageData;
}
