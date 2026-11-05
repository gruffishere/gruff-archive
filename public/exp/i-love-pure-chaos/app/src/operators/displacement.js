export const name = 'displacement';

export function randomParams(rng) {
  return {
    amplitude: 6 + rng() * 35,
    freqX: 0.004 + rng() * 0.04,
    freqY: 0.004 + rng() * 0.04,
    speed: 0.5 + rng() * 2.5,
    phase: rng() * Math.PI * 2,
    mode: rng() < 0.5 ? 'wave' : 'crosswave',
  };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const amp = params.amplitude * (0.4 + t * 0.6);
  const phase = params.phase + t * params.speed * Math.PI * 2;
  const crosswave = params.mode === 'crosswave';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx, dy;
      if (crosswave) {
        dx = Math.sin(y * params.freqX + phase) * amp;
        dy = Math.cos(x * params.freqY + phase * 0.7) * amp;
      } else {
        dx = Math.sin((x + y) * params.freqX + phase) * amp;
        dy = Math.cos((x - y) * params.freqY + phase) * amp;
      }
      const sx = clamp(Math.round(x + dx), 0, width - 1);
      const sy = clamp(Math.round(y + dy), 0, height - 1);
      const di = (y * width + x) * 4;
      const si = (sy * width + sx) * 4;
      data[di]     = src[si];
      data[di + 1] = src[si + 1];
      data[di + 2] = src[si + 2];
      data[di + 3] = src[si + 3];
    }
  }
  return imageData;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
