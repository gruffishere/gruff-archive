// note.ts — the "leave gruff a note" card. Shows once ~4 s after load; sends nothing until the visitor presses send.
const DELAY_MS = 4000;
const DONE = 'gruff-note-done'; // localStorage: dismissed or sent, never again
const SEEN = 'gruff-note-seen'; // sessionStorage: shown already in this session

const read = (store: 'localStorage' | 'sessionStorage', k: string) => {
  try {
    return window[store].getItem(k);
  } catch {
    return null;
  }
};
const write = (store: 'localStorage' | 'sessionStorage', k: string) => {
  try {
    window[store].setItem(k, '1');
  } catch {
    // storage can be blocked; the card then just may return on a later page
  }
};

const path = location.pathname;
const skip = path.startsWith('/notes') || path.startsWith('/exp/');
const card = document.getElementById('note');

if (card && !skip && !read('localStorage', DONE) && !read('sessionStorage', SEEN)) {
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
    write('localStorage', DONE);
    card.classList.remove('in');
    window.setTimeout(() => { card.hidden = true; }, reduced ? 0 : 500);
  };

  const show = () => {
    write('sessionStorage', SEEN);
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
      write('localStorage', DONE);
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
