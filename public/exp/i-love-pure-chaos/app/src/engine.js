import { createRNG, randomSeed } from './rng.js';
import { OPERATORS as DEFAULT_OPERATORS } from './operators/index.js';
import { encodeGif } from './gif-encoder.js';

function selectOperators(operators, enabledOperators, operatorIntensities, rng) {
  let pool;
  if (enabledOperators && enabledOperators.length > 0) {
    pool = operators.filter((op) => enabledOperators.includes(op.name));
  } else {
    pool = [...operators];
  }
  if (pool.length === 0) throw new Error('No operators enabled');

  const ordered = [...pool];
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  return ordered.map((op) => {
    const params = op.randomParams(rng);
    const randIntensity = rng();
    const manual = operatorIntensities ? operatorIntensities[op.name] : undefined;
    return {
      name: op.name,
      apply: op.apply,
      params,
      intensity: typeof manual === 'number' ? manual : randIntensity,
    };
  });
}

function buildSourceFrames(sourceImage, width, height) {
  if (Array.isArray(sourceImage)) return sourceImage;
  return [drawCoverCropToCanvas(sourceImage, width, height)];
}

async function applyFrame(sourceFrames, selected, t, width, height, rng, beforeBuffer) {
  const srcIdx = sourceFrames.length === 1
    ? 0
    : Math.min(sourceFrames.length - 1, Math.floor(t * sourceFrames.length));
  const baseData = sourceFrames[srcIdx].getContext('2d').getImageData(0, 0, width, height);
  let imageData = new ImageData(new Uint8ClampedArray(baseData.data), width, height);

  for (const op of selected) {
    beforeBuffer.set(imageData.data);
    try {
      imageData = await op.apply(imageData, op.params, t, rng);
    } catch (e) {
      console.warn(`Operator ${op.name} failed at t=${t.toFixed(2)}:`, e);
    }
    if (op.intensity < 0.99) {
      blendInPlace(imageData.data, beforeBuffer, op.intensity);
    }
  }
  return imageData;
}

export async function generate(sourceImage, options = {}) {
  const {
    width = 512,
    height = 512,
    frameCount = 30,
    fps = 15,
    seed = randomSeed(),
    enabledOperators = null,
    operatorIntensities = null,
    operators = DEFAULT_OPERATORS,
    onFrame = () => {},
    onStatus = () => {},
    onEncodeProgress = () => {},
    onFramesReady = () => {},
  } = options;

  const rng = createRNG(seed);
  const selected = selectOperators(operators, enabledOperators, operatorIntensities, rng);
  const sourceFrames = buildSourceFrames(sourceImage, width, height);
  const beforeBuffer = new Uint8ClampedArray(width * height * 4);

  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const t = frameCount === 1 ? 0.5 : f / (frameCount - 1);
    onStatus(`FRAME ${String(f + 1).padStart(2, '0')}/${frameCount}`);

    const imageData = await applyFrame(sourceFrames, selected, t, width, height, rng, beforeBuffer);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    frames.push(canvas);
    onFrame(canvas, f, frameCount);

    await new Promise((r) => setTimeout(r, 0));
  }

  onFramesReady(frames, fps, selected.map((s) => ({ name: s.name, intensity: s.intensity })));

  onStatus('ENCODING GIF...');
  const gifBlob = await encodeGif(frames, { fps, width, height, onProgress: onEncodeProgress });

  return {
    blob: gifBlob,
    seed,
    ops: selected.map((s) => ({ name: s.name, intensity: s.intensity })),
    frames,
    fps,
  };
}

export async function previewFrame(sourceImage, options = {}) {
  const {
    width = 512,
    height = 512,
    t = 0.5,
    seed = 0,
    enabledOperators = null,
    operatorIntensities = null,
    operators = DEFAULT_OPERATORS,
  } = options;

  const rng = createRNG(seed);
  const selected = selectOperators(operators, enabledOperators, operatorIntensities, rng);
  const sourceFrames = buildSourceFrames(sourceImage, width, height);
  const beforeBuffer = new Uint8ClampedArray(width * height * 4);
  return await applyFrame(sourceFrames, selected, t, width, height, rng, beforeBuffer);
}

function blendInPlace(after, before, intensity) {
  const inv = 1 - intensity;
  for (let i = 0; i < after.length; i += 4) {
    after[i]     = before[i]     * inv + after[i]     * intensity;
    after[i + 1] = before[i + 1] * inv + after[i + 1] * intensity;
    after[i + 2] = before[i + 2] * inv + after[i + 2] * intensity;
  }
}

function drawCoverCropToCanvas(image, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
  return canvas;
}
