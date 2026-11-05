export const name = 'noise';

export function randomParams(rng) {
  const modes = ['mono', 'color', 'salt', 'stripe'];
  return {
    mode: modes[Math.floor(rng() * modes.length)],
    intensity: 0.15 + rng() * 0.45,
  };
}

export function apply(imageData, params, t, rng) {
  const { data, width, height } = imageData;
  const intensity = params.intensity * (0.3 + t * 0.9);
  const mode = params.mode;

  if (mode === 'mono') {
    for (let i = 0; i < data.length; i += 4) {
      const n = (rng() - 0.5) * 255 * intensity;
      data[i]     = clamp(data[i] + n);
      data[i + 1] = clamp(data[i + 1] + n);
      data[i + 2] = clamp(data[i + 2] + n);
    }
  } else if (mode === 'color') {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i]     + (rng() - 0.5) * 255 * intensity);
      data[i + 1] = clamp(data[i + 1] + (rng() - 0.5) * 255 * intensity);
      data[i + 2] = clamp(data[i + 2] + (rng() - 0.5) * 255 * intensity);
    }
  } else if (mode === 'salt') {
    const prob = intensity * 0.15;
    for (let i = 0; i < data.length; i += 4) {
      if (rng() < prob) {
        const v = rng() < 0.5 ? 0 : 255;
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      const rowNoise = (rng() - 0.5) * 255 * intensity;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i]     = clamp(data[i] + rowNoise);
        data[i + 1] = clamp(data[i + 1] + rowNoise);
        data[i + 2] = clamp(data[i + 2] + rowNoise);
      }
    }
  }
  return imageData;
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
