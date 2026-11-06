// note.ts — the "leave gruff a note" card. The artist wants it on every page load (2026-11-07): ~4 s after any page
// opens or refreshes it slides in, whether or not the visitor closed or sent one before. Nothing is sent until send.
const DELAY_MS = 4000;
// Test-only switch: the e2e suite sets this so the card never covers what a test clicks. No visitor ever sets it.
const OFF = 'gruff-note-off';

const off = () => {
  try {
    return window.localStorage.getItem(OFF) === '1';
  } catch {
    return false;
  }
};

const path = location.pathname;
const skip = path.startsWith('/notes') || path.startsWith('/exp/');
const card = document.getElementById('note');

if (card && !skip && !off()) {
  const form = document.getElementById('note-form') as HTMLFormElement;
  const text = document.getElementById('note-text') as HTMLTextAreaElement;
  const name = document.getElementById('note-name') as HTMLInputElement;
  const hp = document.getElementById('note-hp') as HTMLInputElement;
  const count = document.getElementById('note-count') as HTMLElement;
  const err = document.getElementById('note-err') as HTMLElement;
  const send = document.getElementById('note-send') as HTMLButtonElement;
  const thanks = document.getElementById('note-thanks') as HTMLElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer: number | undefined;

  const hide = () => {
    window.clearTimeout(timer);
    card.classList.remove('in');
    window.setTimeout(() => { card.hidden = true; }, reduced ? 0 : 500);
  };

  const show = () => {
    card.hidden = false;
    if (reduced) card.classList.add('still');
    // two frames so the transition starts from the hidden state
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
  };

  text.addEventListener('input', () => {
    const left = 500 - text.value.length;
    count.textContent = left <= 80 ? `${left}` : '';
    err.textContent = '';
  });
  document.getElementById('note-close')!.addEventListener('click', hide);
  card.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!text.value.trim()) { text.focus(); return; }
    send.disabled = true;
    err.textContent = '';
    try {
      const res = await fetch('/api/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.value.trim(), name: name.value.trim(), hp: hp.value, page: path }),
      });
      if (res.status !== 201) throw new Error(String(res.status));
      form.hidden = true;
      thanks.hidden = false;
      timer = window.setTimeout(hide, 4000);
    } catch {
      err.textContent = 'could not send right now';
      send.disabled = false;
    }
  });

  timer = window.setTimeout(show, DELAY_MS);
}
