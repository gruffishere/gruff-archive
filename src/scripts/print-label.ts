import { fitInside, fitText, sizedSvg, splitLine, svgIntrinsic, type LabelLine } from '../lib/label';

const W = 1080;
const H = 1350;
const PAD = 72;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Loads the artwork and works out the size it is drawn at. SVGs often carry only a viewBox, so the browser
 *  reports no (or a default 300×150) natural size: read the document and size it explicitly instead. */
async function loadArt(src: string, maxW: number, maxH: number) {
  if (/\.svg(\?|$)/i.test(src)) {
    const text = await (await fetch(src)).text();
    const own = svgIntrinsic(text) ?? { w: 1, h: 1 };
    const { w, h } = fitInside(own.w, own.h, maxW, maxH);
    if (!(w > 0 && h > 0)) return null;
    const url = URL.createObjectURL(new Blob([sizedSvg(text, w, h)], { type: 'image/svg+xml' }));
    try {
      return { img: await loadImage(url), w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const img = await loadImage(src);
  const own = img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1, h: 1 };
  const { w, h } = fitInside(own.w, own.h, maxW, maxH);
  return w > 0 && h > 0 ? { img, w, h } : null;
}

export async function renderLabel(data: { lines: LabelLine[]; image: string | null }): Promise<HTMLCanvasElement> {
  // a font that fails to load must not stop the label: draw with whatever is available
  try {
    await Promise.all([
      document.fonts.load("300 22px 'DM Mono'"),
      document.fonts.load("400 30px 'DM Mono'"),
      document.fonts.load("56px 'Castoro'"),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall through to fallback fonts */
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const boxH = 820;
  const maxW = W - PAD * 2;
  let art: { img: HTMLImageElement; w: number; h: number } | null = null;
  if (data.image) {
    try {
      art = await loadArt(data.image, maxW, boxH);
    } catch {
      art = null; // missing or broken image: fall back to the placeholder
    }
  }
  if (art && data.image) {
    ctx.imageSmoothingEnabled = !data.image.endsWith('.svg');
    ctx.drawImage(art.img, (W - art.w) / 2, PAD + (boxH - art.h) / 2, art.w, art.h);
  } else {
    // quiet placeholder tile, mirroring the site
    const side = Math.min(W - PAD * 2, boxH);
    const x0 = (W - side) / 2;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x0, PAD + (boxH - side) / 2, side, side);
    ctx.font = "300 22px 'DM Mono'";
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.lines[0]?.text.toUpperCase() ?? '', W / 2, PAD + boxH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  let y = PAD + boxH + 64;
  for (const l of data.lines) {
    const size = l.style === 'title' ? 30 : 22;
    ctx.font = `${l.style === 'title' ? 400 : 300} ${size}px 'DM Mono'`;
    ctx.fillStyle = l.style === 'accession' || l.style === 'meta' ? '#777' : '#fff';
    const max = W - PAD * 2;
    const { head, value, keep } = splitLine(l);
    const m = (t: string) => ctx.measureText(t).width;
    let h = head;
    let v = value;
    if (m(h) + m(v) > max) {
      if (!v) h = fitText(h, max, m);
      else if (keep === 'value') {
        // truncate the label first, the value only if it alone overflows
        if (m(v) + m('…') > max) { h = ''; v = fitText(v, max, m); } else h = fitText(h, max - m(v), m);
      } else {
        v = fitText(v, Math.max(0, max - m(h)), m);
      }
    }
    ctx.fillText(h, PAD, y);
    if (v) ctx.fillText(v, PAD + m(h), y);
    y += size + 14;
  }
  ctx.font = "56px 'Castoro'";
  ctx.fillStyle = '#fff';
  ctx.filter = 'url(#ink)';
  ctx.textAlign = 'right';
  ctx.fillText('gruff', W - PAD, H - PAD);
  ctx.filter = 'none';
  return canvas;
}

const button = document.getElementById('print-label');
const raw = document.getElementById('label-data')?.textContent;
if (button && raw) {
  const data = JSON.parse(raw) as { lines: LabelLine[]; image: string | null; filename: string };
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    (button as HTMLButtonElement).disabled = true;
    try {
      const canvas = await renderLabel(data);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = data.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      /* nothing to download; the button re-enables below */
    } finally {
      busy = false;
      (button as HTMLButtonElement).disabled = false;
    }
  });
}
