// notes-page.ts — the artist's private ledger. The key stays in this browser only; notes are inserted as text, never HTML.
const KEY = 'gruff-notes-key';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const gate = $('gate') as HTMLFormElement;
const keyInput = $('key') as HTMLInputElement;
const err = $('err');
const statusEl = $('status');
const ledger = $('ledger');
const forget = $('forget');

const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const store = (k: string | null) => {
  try {
    if (k) localStorage.setItem(KEY, k);
    else localStorage.removeItem(KEY);
  } catch {
    // the key then has to be typed again next time
  }
};

interface Note { text?: string; name?: string; page?: string; at?: string; country?: string }
const fmt = (at?: string) => {
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 10).split('-').reverse().join('.')} ${d.toISOString().slice(11, 16)}` : '—';
};

const render = (notes: Note[]) => {
  ledger.replaceChildren(
    ...notes.map((n) => {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      const line = (s: string) => { const p = document.createElement('div'); p.textContent = s; return p; };
      meta.append(line(fmt(n.at)), line(String(n.name || '—')), line(`${n.page ?? ''}${n.country ? ` · ${n.country}` : ''}`));
      const body = document.createElement('p');
      body.className = 'body';
      body.textContent = String(n.text ?? '');
      li.append(meta, body);
      return li;
    }),
  );
  statusEl.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}, newest first.`;
};

const load = async (k: string, remember: boolean) => {
  err.textContent = '';
  try {
    const res = await fetch('/api/notes', { headers: { authorization: `Bearer ${k}` }, cache: 'no-store' });
    if (res.status === 401) throw new Error('that key does not match');
    if (res.status === 503) throw new Error('notes are not set up yet (see the deploy guide)');
    if (!res.ok) throw new Error('could not load right now');
    const { notes } = (await res.json()) as { notes: Note[] };
    if (remember) store(k);
    gate.hidden = true;
    forget.hidden = false;
    render(notes);
  } catch (e) {
    if (!remember && e instanceof Error && e.message.startsWith('that key')) store(null);
    gate.hidden = false;
    forget.hidden = true;
    err.textContent = e instanceof Error ? e.message : 'could not load right now';
  }
};

gate.addEventListener('submit', (e) => {
  e.preventDefault();
  const k = keyInput.value.trim();
  if (k) void load(k, true);
});
forget.addEventListener('click', () => {
  store(null);
  ledger.replaceChildren();
  keyInput.value = '';
  forget.hidden = true;
  gate.hidden = false;
  statusEl.textContent = 'notes left for gruff.';
});

const k = stored();
if (k) void load(k, false);
else gate.hidden = false;
