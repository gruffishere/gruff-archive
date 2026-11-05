export function createRNG(seed) {
  let a = seed | 0;
  let b = (seed * 1.6180339887) | 0;
  let c = (seed * 2.7182818284) | 0;
  let d = (seed * 3.1415926535) | 0;

  function sfc32() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  for (let i = 0; i < 20; i++) sfc32();
  return sfc32;
}

export function randomSeed() {
  return Math.floor(Math.random() * 4294967296);
}
