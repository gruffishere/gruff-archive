export const name = 'wave-tear';

export function randomParams(rng) {
  return {
    sliceHeight: 2 + Math.floor(rng() * 14),
    amplitude: 20 + rng() * 70,
    frequency: 0.004 + rng() * 0.04,
    phase: rng() * Math.PI * 2,
    speed: 0.5 + rng() * 2.5,
  };
}

export function apply(imageData, params, t) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const amp = params.amplitude * (0.4 + t * 0.8);
  const sliceH = params.sliceHeight;
  const phase = params.phase + t * params.speed * Math.PI * 2;

  for (let sliceStart = 0; sliceStart < height; sliceStart += sliceH) {
    const sliceMid = sliceStart + sliceH / 2;
    const offset = Math.round(Math.sin(sliceMid * params.frequency + phase) * amp);

    for (let dy = 0; dy < sliceH && sliceStart + dy < height; dy++) {
      const y = sliceStart + dy;
      for (let x = 0; x < width; x++) {
        const sx = ((x + offset) % width + width) % width;
        const di = (y * width + x) * 4;
        const si = (y * width + sx) * 4;
        data[di]     = src[si];
        data[di + 1] = src[si + 1];
        data[di + 2] = src[si + 2];
      }
    }
  }
  return imageData;
}
