import { salonLayout } from '../lib/salon';

const wall = document.getElementById('salon');
if (wall) {
  const tiles = Array.from(wall.querySelectorAll<HTMLAnchorElement>('a.tile'));
  const items = tiles.map((t) => ({ w: Number(t.dataset.w) || 1, h: Number(t.dataset.h) || 1, weight: Number(t.dataset.weight) || 1 }));
  let lastWidth = 0;
  let lastVw = 0;

  const layout = () => {
    const W = wall.clientWidth;
    const vw = window.innerWidth;
    // re-hang only for a real change of width (a scrollbar appearing is ~15 px); the same width always gives the same wall
    if (!W || (Math.abs(W - lastWidth) <= 24 && (vw >= 768) === (lastVw >= 768) && (vw < 380) === (lastVw < 380) && lastWidth)) return;
    lastWidth = W;
    lastVw = vw;
    const gap = vw >= 768 ? 26 : 14;
    const { rects, height } = salonLayout(items, W, gap, { viewport: vw });
    wall.classList.add('on');
    wall.style.height = `${Math.ceil(height)}px`;
    tiles.forEach((t, i) => {
      const r = rects[i]!;
      t.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      const img = t.querySelector('img');
      if (img) img.sizes = `${Math.ceil(r.w)}px`;
    });
  };

  // Hover or keyboard focus plays an animated piece: the tile swaps its static rendition for the original gif (loaded
  // only now), or plays its video. The box never changes, so nothing reflows. Touch is left alone: a tap opens the work.
  const play = (tile: HTMLAnchorElement) => {
    const video = tile.querySelector('video');
    if (video) return void video.play().catch(() => {});
    const img = tile.querySelector<HTMLImageElement>('img[data-gif]');
    if (!img || img.src.endsWith(img.dataset.gif!)) return;
    img.removeAttribute('srcset');
    img.src = img.dataset.gif!;
  };
  const stop = (tile: HTMLAnchorElement) => {
    const video = tile.querySelector('video');
    if (video) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    const img = tile.querySelector<HTMLImageElement>('img[data-gif]');
    if (img?.dataset.still) img.src = img.dataset.still;
  };
  for (const tile of tiles) {
    if (!tile.querySelector('video, img[data-gif]')) continue;
    tile.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && play(tile));
    tile.addEventListener('pointerleave', () => stop(tile));
    tile.addEventListener('focus', () => tile.matches(':focus-visible') && play(tile));
    tile.addEventListener('blur', () => stop(tile));
  }

  layout();
  let timer = 0;
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(layout, 120);
  };
  new ResizeObserver(later).observe(wall);
  window.addEventListener('resize', later);
}
