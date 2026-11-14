// Wspólny silnik: dane, kanał synchronizacji, kolejki pytań.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const CONFIG_KEY = 'floor:config';
export const SEEN_PREFIX = 'floor:seen:';
export const LIVE_PREFIX = 'floor:live:';

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total >= 60) return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  return String(total);
}

export function fmtSeconds(ms) {
  return String(Math.max(0, Math.ceil(ms / 1000)));
}

export function storeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function storeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getConfig() {
  return storeGet(CONFIG_KEY, null);
}

export function toast(text, isError = false, ms = 2800) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.toggle('err', isError);
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------------- kanał między oknami ---------------- */
export class Bus {
  constructor(gameId, handler) {
    this.gid = gameId;
    this.handler = handler;
    this.id = Math.random().toString(36).slice(2, 10);
    this.name = 'the-floor-' + gameId;
    this.bc = null;
    this.onStorage = null;
    if ('BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(this.name);
      this.bc.onmessage = (event) => {
        const data = event.data;
        if (data && data.from !== this.id) handler(data);
      };
    } else {
      this.onStorage = (event) => {
        if (event.key !== this.name || !event.newValue) return;
        try {
          const data = JSON.parse(event.newValue);
          if (data.from !== this.id) handler(data);
        } catch {}
      };
      window.addEventListener('storage', this.onStorage);
    }
  }

  send(t, payload = {}) {
    const msg = { t, ...payload, from: this.id, at: Date.now() };
    if (this.bc) {
      this.bc.postMessage(msg);
      return;
    }
    try {
      localStorage.setItem(this.name, JSON.stringify({ ...msg, n: Math.random() }));
    } catch {}
  }

  close() {
    if (this.bc) this.bc.close();
    if (this.onStorage) window.removeEventListener('storage', this.onStorage);
  }
}

/* ---------------- dane kategorii ---------------- */
export async function loadIndex() {
  const res = await fetch('data/packs/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Nie udało się wczytać bazy kategorii (' + res.status + ')');
  const data = await res.json();
  return data.packs || [];
}

const packCache = new Map();

export async function loadPack(cat) {
  if (packCache.has(cat.id)) return packCache.get(cat.id);
  let pack;
  if (cat.live) {
    pack = await loadLivePack(cat);
  } else {
    const res = await fetch('data/packs/' + encodeURIComponent(cat.id) + '.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error('Brak danych kategorii ' + cat.name);
    pack = await res.json();
  }
  if (!pack.items || !pack.items.length) throw new Error('Kategoria ' + cat.name + ' jest pusta');
  packCache.set(cat.id, pack);
  return pack;
}

function cleanTitle(title) {
  return title.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

function titleOk(title) {
  return (
    title.length >= 2 &&
    title.length <= 70 &&
    !/^lista\b/i.test(title) &&
    !/\(ujednoznacznienie\)/i.test(title) &&
    !/^\d{1,4}$/.test(title) &&
    !/^(Galeria|Kategoria|Szablon|Plik|Wikiprojekt):/i.test(title)
  );
}

const WIKI_API = 'https://pl.wikipedia.org/w/api.php';

async function wikiJson(params) {
  const url = new URL(WIKI_API);
  for (const [k, v] of Object.entries({ format: 'json', origin: '*', ...params })) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (res.status === 429) throw new Error('Wikipedia chwilowo ogranicza zapytania. Spróbuj za minutę.');
  if (!res.ok) throw new Error('Wikipedia odpowiedziała błędem ' + res.status);
  return res.json();
}

/* Pobiera kategorię z Wikipedii na żywo (dla kategorii spoza bazy). */
export async function loadLivePack(cat) {
  const cacheKey = LIVE_PREFIX + cat.id;
  const cached = storeGet(cacheKey);
  if (cached && cached.items?.length >= 5 && Date.now() - cached.at < 12 * 3600 * 1000) {
    return { ...cat, items: cached.items, live: true };
  }
  const items = [];
  const seen = new Set();
  let cont = null;
  for (let round = 0; round < 3 && items.length < 120; round++) {
    const data = await wikiJson({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: cat.cat,
      gcmtype: 'page',
      gcmlimit: '50',
      ...(cont || {}),
      prop: 'pageimages',
      pilimit: '50',
      piprop: 'thumbnail',
      pithumbsize: '800',
    });
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      if (!page.thumbnail?.source) continue;
      if (!titleOk(page.title)) continue;
      const answer = cleanTitle(page.title);
      const key = answer.toLowerCase();
      if (!answer || seen.has(key)) continue;
      seen.add(key);
      items.push({ a: answer, img: page.thumbnail.source.split('?')[0] });
    }
    cont = data?.continue ? { gcmcontinue: data.continue.gcmcontinue } : null;
    if (!cont) break;
    await new Promise((r) => setTimeout(r, 350));
  }
  if (items.length < 5) throw new Error('Ta kategoria ma za mało zdjęć. Wybierz inną.');
  storeSet(cacheKey, { at: Date.now(), items });
  return { ...cat, items, live: true };
}

/* Wyszukiwanie kategorii w Wikipedii (ns 14). */
export async function searchWikiCategories(query) {
  const data = await wikiJson({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '14',
    srlimit: '8',
  });
  return (data?.query?.search || []).map((hit) => ({
    title: hit.title,
    name: hit.title.replace(/^Kategoria:/, ''),
    pageid: hit.pageid,
  }));
}

/* ---------------- kolejka pytań ---------------- */
export function seenSet(packId) {
  return new Set(storeGet(SEEN_PREFIX + packId, []));
}

export function markSeen(packId, answer) {
  const seen = seenSet(packId);
  seen.add(answer);
  storeSet(SEEN_PREFIX + packId, [...seen].slice(-1200));
}

export function resetSeen(packId) {
  storeSet(SEEN_PREFIX + packId, []);
}

export function makeQueue(pack) {
  const seen = seenSet(pack.id);
  let fresh = pack.items.filter((q) => !seen.has(q.a));
  if (fresh.length < 8) {
    resetSeen(pack.id);
    fresh = [...pack.items];
  }
  return { queue: shuffle(fresh), total: pack.items.length };
}
