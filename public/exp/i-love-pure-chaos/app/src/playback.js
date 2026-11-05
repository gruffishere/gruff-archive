let rafId = null;
let token = 0;

export function stopPlayback() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  token++;
}

export function startPlayback(canvas, frames, fps) {
  stopPlayback();
  if (!frames || frames.length === 0) return;
  const myToken = ++token;
  const ctx = canvas.getContext('2d');
  const interval = 1000 / fps;
  let lastTime = performance.now();
  let idx = 0;

  ctx.drawImage(frames[0], 0, 0);

  function tick(time) {
    if (myToken !== token) return;
    if (time - lastTime >= interval) {
      idx = (idx + 1) % frames.length;
      ctx.drawImage(frames[idx], 0, 0);
      lastTime = time;
    }
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
}
