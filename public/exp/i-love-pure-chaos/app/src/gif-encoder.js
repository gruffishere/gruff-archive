let workerScriptURL = null;

async function ensureWorkerScript() {
  if (workerScriptURL) return workerScriptURL;
  const response = await fetch(new URL('../vendor/gif.worker.js', import.meta.url));
  if (!response.ok) throw new Error('Failed to load gif.worker.js from vendor');
  const code = await response.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  workerScriptURL = URL.createObjectURL(blob);
  return workerScriptURL;
}

export async function encodeGif(frames, options) {
  const { fps, width, height, onProgress } = options;
  const workerScript = await ensureWorkerScript();

  return new Promise((resolve, reject) => {
    if (typeof GIF === 'undefined') {
      reject(new Error('GIF library not loaded'));
      return;
    }

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript,
      dither: false,
      repeat: 0,
    });

    const delay = Math.round(1000 / fps);
    for (const frame of frames) {
      gif.addFrame(frame, { delay });
    }

    gif.on('progress', (p) => { if (onProgress) onProgress(p); });
    gif.on('finished', (blob) => resolve(blob));
    gif.on('abort', () => reject(new Error('GIF encoding aborted')));

    gif.render();
  });
}
