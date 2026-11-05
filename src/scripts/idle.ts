// idle.ts — after 60 s without input the page fades (CSS handles the slow transition).
const IDLE_MS = 60_000;
let timer: number | undefined;
const wake = () => {
  document.body.classList.remove('fading');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => document.body.classList.add('fading'), IDLE_MS);
};
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) window.addEventListener(ev, wake, { passive: true });
  wake();
  // Pointer and key events inside an artwork iframe never reach this page, so a visitor playing with a live piece
  // would fade after 60 s. Hold the fade off while the pointer is over an iframe or focus has moved into one.
  let inside = 0;
  const hold = () => {
    inside++;
    window.clearTimeout(timer);
    document.body.classList.remove('fading');
  };
  const release = () => {
    inside = Math.max(0, inside - 1);
    if (inside === 0) wake();
  };
  for (const f of document.querySelectorAll('iframe')) {
    f.addEventListener('mouseenter', hold);
    f.addEventListener('mouseleave', release);
  }
  window.addEventListener('blur', () => {
    if (document.activeElement instanceof HTMLIFrameElement) wake();
  });
}
