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
    if (!W || (Math.abs(W - lastWidth) < 0.5 && vw === lastVw)) return;
    lastWidth = W;
    lastVw = vw;
    const gap = vw >= 768 ? 28 : 12;
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

  layout();
  let timer = 0;
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(layout, 120);
  };
  new ResizeObserver(later).observe(wall);
  window.addEventListener('resize', later);
}
