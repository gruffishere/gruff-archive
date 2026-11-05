export const name = 'jpeg-bomb';

export function randomParams(rng) {
  return {
    quality: 0.02 + rng() * 0.06,
    corruptionCount: 8 + Math.floor(rng() * 40),
    skipHeader: 400 + Math.floor(rng() * 300),
  };
}

export async function apply(imageData, params, t, rng) {
  const { width, height } = imageData;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/jpeg', params.quality);
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const corruptions = Math.floor(params.corruptionCount * (0.3 + t * 0.9));
  const safeStart = Math.min(params.skipHeader, bytes.length - 200);
  const safeEnd = bytes.length - 100;
  if (safeEnd > safeStart) {
    for (let i = 0; i < corruptions; i++) {
      const idx = safeStart + Math.floor(rng() * (safeEnd - safeStart));
      let val = Math.floor(rng() * 256);
      if (val === 0xff) val = 0x00;
      bytes[idx] = val;
    }
  }

  try {
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const img = await loadBlobImage(blob);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } catch (e) {
    return imageData;
  }
}

function loadBlobImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
