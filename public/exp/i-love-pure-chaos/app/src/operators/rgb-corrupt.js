export const name = 'rgb-corrupt';

export function randomParams(rng) {
  const bandCount = 3 + Math.floor(rng() * 10);
  const actions = [];
  for (let i = 0; i < bandCount; i++) {
    actions.push(Math.floor(rng() * 7));
  }
  return { bandCount, actions };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const bandCount = params.bandCount;
  const bandHeight = Math.max(1, Math.ceil(height / bandCount));
  const strength = 0.5 + t * 0.5;

  for (let b = 0; b < bandCount; b++) {
    const action = params.actions[b];
    const y0 = b * bandHeight;
    const y1 = Math.min(y0 + bandHeight, height);

    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (action === 0) data[i]     = data[i] * (1 - strength);
        else if (action === 1) data[i + 1] = data[i + 1] * (1 - strength);
        else if (action === 2) data[i + 2] = data[i + 2] * (1 - strength);
        else if (action === 3) data[i]     = data[i]     * (1 - strength) + (255 - data[i])     * strength;
        else if (action === 4) data[i + 1] = data[i + 1] * (1 - strength) + (255 - data[i + 1]) * strength;
        else if (action === 5) data[i + 2] = data[i + 2] * (1 - strength) + (255 - data[i + 2]) * strength;
        else {
          const r = data[i];
          data[i]     = data[i + 2];
          data[i + 2] = r;
        }
      }
    }
  }
  return imageData;
}
