import { salonLayout } from '../lib/salon';
import { drawWall, type PoolItem } from '../lib/pool';

const wall = document.getElementById('salon');
if (wall) {
  let tiles = Array.from(wall.querySelectorAll<HTMLAnchorElement>('a.tile'));
  let items = itemsOf(tiles);
  let lastWidth = 0;
  let lastVw = 0;

  function itemsOf(list: HTMLAnchorElement[]) {
    return list.map((t) => ({ w: Number(t.dataset.w) || 1, h: Number(t.dataset.h) || 1, weight: Number(t.dataset.weight) || 1 }));
  }

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
  const state = new Map<HTMLAnchorElement, { hover: boolean; focus: boolean }>();
  const flags = (tile: HTMLAnchorElement) => state.get(tile) ?? state.set(tile, { hover: false, focus: false }).get(tile)!;
  const play = (tile: HTMLAnchorElement) => {
    const video = tile.querySelector('video');
    if (video) return void video.play().catch(() => {});
    const img = tile.querySelector<HTMLImageElement>('img[data-gif]');
    if (!img || img.src.endsWith(img.dataset.gif!)) return;
    if (img.srcset) img.dataset.srcset = img.srcset;
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
    if (!img?.dataset.still) return;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.still;
  };
  const wire = (tile: HTMLAnchorElement) => {
    if (!tile.querySelector('video, img[data-gif]')) return;
    // plays while hovered or keyboard-focused; stops only when neither remains
    const settle = () => {
      const s = flags(tile);
      if (s.hover || s.focus) play(tile);
      else stop(tile);
    };
    tile.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      flags(tile).hover = true;
      settle();
    });
    tile.addEventListener('pointerleave', () => {
      flags(tile).hover = false;
      settle();
    });
    tile.addEventListener('focus', () => {
      if (!tile.matches(':focus-visible')) return;
      flags(tile).focus = true;
      settle();
    });
    tile.addEventListener('blur', () => {
      flags(tile).focus = false;
      settle();
    });
  }


  tiles.forEach(wire);

  /** A tile as the server renders it, built from a pool item (all through the DOM, never as markup). */
  const tileOf = (p: PoolItem): HTMLAnchorElement => {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = p.href;
    a.setAttribute('aria-label', `${p.title}, ${p.collection}`);
    a.dataset.slug = p.slug;
    a.dataset.id = p.id;
    a.dataset.w = String(p.w);
    a.dataset.h = String(p.h);
    a.dataset.weight = String(p.weight);
    a.style.aspectRatio = `${p.w} / ${p.h}`;
    if (p.kind === 'iframe') {
      const f = document.createElement('iframe');
      f.src = p.src;
      f.title = '';
      f.setAttribute('sandbox', 'allow-scripts');
      f.loading = 'lazy';
      f.tabIndex = -1;
      f.setAttribute('aria-hidden', 'true');
      a.append(f);
    } else if (p.hover?.type === 'video') {
      const v = document.createElement('video');
      v.src = p.hover.src;
      v.poster = p.src;
      v.muted = true;
      v.setAttribute('muted', '');
      v.loop = true;
      v.playsInline = true;
      v.preload = 'none';
      v.setAttribute('aria-hidden', 'true');
      v.width = p.w;
      v.height = p.h;
      if (p.pixelated) v.className = 'px';
      a.append(v);
    } else {
      const i = document.createElement('img');
      if (p.pixelated) i.className = 'px';
      i.src = p.src;
      if (p.large && p.tw && p.lw) i.srcset = `${p.src} ${p.tw}w, ${p.large} ${p.lw}w`;
      i.alt = '';
      i.width = p.w;
      i.height = p.h;
      i.loading = 'lazy';
      i.decoding = 'async';
      i.dataset.still = p.src;
      if (p.hover?.type === 'gif') i.dataset.gif = p.hover.src;
      a.append(i);
    }
    return a;
  };

  // Every visit deals a fresh wall from the pool; the server-rendered one is the fallback (no script, no pool).
  // A resize only re-hangs the same draw. `?seed=` pins the draw.
  const seedOf = () => {
    const q = Number(new URLSearchParams(location.search).get('seed'));
    return Number.isFinite(q) && q > 0 ? q >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]!;
  };
  const deal = async () => {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch('/catalog/pool.json', { signal: ctl.signal });
      if (!res.ok) return;
      const pool = (await res.json()) as PoolItem[];
      const wall2 = drawWall(pool, seedOf());
      if (!wall2.length) return;
      tiles = wall2.map(tileOf);
      items = itemsOf(tiles);
      tiles.forEach(wire);
      wall!.replaceChildren(...tiles);
    } catch {
      // keep the server-rendered wall
    } finally {
      window.clearTimeout(timer);
    }
  };

  wall.classList.add('pending');
  void deal().then(() => {
    wall.classList.remove('pending');
    lastWidth = 0;
    layout();
  });
  let timer = 0;
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(layout, 120);
  };
  new ResizeObserver(later).observe(wall);
  window.addEventListener('resize', later);
}
