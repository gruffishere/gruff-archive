export const name = 'databend';

export function randomParams(rng) {
  return {
    corruptionRate: 0.0015 + rng() * 0.008,
    streakChance: 0.2 + rng() * 0.5,
    maxStreak: 5 + Math.floor(rng() * 50),
  };
}

export function apply(imageData, params, t, rng) {
  const { data } = imageData;
  const rate = params.corruptionRate * (0.3 + t * 1.1);
  const corruptCount = Math.floor((data.length / 4) * rate);

  for (let c = 0; c < corruptCount; c++) {
    const pixelIdx = Math.floor(rng() * (data.length / 4));
    const startByte = pixelIdx * 4;
    const streak = rng() < params.streakChance ? 1 + Math.floor(rng() * params.maxStreak) : 1;

    for (let s = 0; s < streak; s++) {
      const base = startByte + s * 4;
      if (base + 3 >= data.length) break;
      data[base]     = Math.floor(rng() * 256);
      data[base + 1] = Math.floor(rng() * 256);
      data[base + 2] = Math.floor(rng() * 256);
    }
  }
  return imageData;
}
