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
    const res = await fetch('data/packs/' + encodeURIComponent(cat.id) + '.json', { cache: 'no-cache' });
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

export function makeQueue(pack, used = null) {
  const seen = seenSet(pack.id);
  const isUsed = (q) => seen.has(q.a) || (used && used.has(pack.id + '|' + q.a));
  let fresh = pack.items.filter((q) => !isUsed(q));
  // Jeśli localStorage pamięta poprzednią grę, nie resetuj całej puli w środku
  // bieżącej rozgrywki — najpierw wykorzystaj pytania nieużyte w tej grze.
  if (!fresh.length) fresh = pack.items.filter((q) => !used || !used.has(pack.id + '|' + q.a));
  if (!fresh.length) fresh = [...pack.items];
  return { queue: shuffle(fresh), total: pack.items.length };
}

const GENERIC_ANSWERS = new Set(
  [
    'owoce', 'owoce jadalne', 'warzywa', 'grzyby', 'grzyby jadalne', 'grzyby trujące',
    'desery', 'zupy', 'ciasta', 'ciasta deserowe', 'ciasta wytrawne', 'przekąski',
    'słodycze', 'koktajle', 'napoje', 'napoje bezalkoholowe', 'herbaty', 'wina', 'piwo',
    'owoce morza', 'wędliny', 'mięsa', 'mięso', 'pierogi', 'ryby', 'ryby akwariowe',
    'psy', 'rasy psów', 'koty', 'rasy kotów', 'konie', 'rasy koni', 'gołębie', 'rasy gołębi',
    'motyle', 'owady', 'kaktusy', 'jaskinie', 'góry', 'pustynie', 'zamki', 'plaże',
    'parki narodowe', 'władcy', 'władcy polski', 'prezydenci', 'prezydenci usa',
    'cesarze rzymscy', 'pomniki', 'muzea', 'gatunki muzyczne', 'tańce', 'kompozytorzy',
    'dyrygenci', 'aktorzy', 'polscy aktorzy', 'teleturnieje', 'smartfony', 'procesory',
    'karty graficzne', 'telefony', 'lokomotywy', 'pociągi', 'rowery', 'silniki', 'roboty',
    'maszyny', 'pierwiastki', 'pierwiastki chemiczne', 'minerały', 'skały', 'sieci',
    'marki odzieżowe', 'marki kosmetyków', 'marki napojów', 'marki piwa', 'hotele',
    'restauracje', 'zabawki', 'gry planszowe', 'monety', 'znaczki', 'znaczki pocztowe',
    'odznaczenia', 'zegarki', 'drzwi', 'drzwi i bramy', 'samochody', 'motocykle',
    'ciężarówki', 'samochody ciężarowe', 'autobusy', 'samochody terenowe',
    'samochody wyścigowe', 'formuła 1', 'samoloty', 'statki', 'budynki', 'drzewa',
    'kwiaty', 'zwierzęta', 'rośliny', 'marki samochodów', 'aplikacje',
    'aplikacje internetowe', 'logotypy', 'logotypy znanych marek', 'flagi',
    'flagi państw', 'herby', 'herby państw', 'skamieniałości', 'owoc', 'warzywo',
    'grzyb', 'deser', 'zupa', 'ciasto', 'przekąska', 'słodycz', 'koktajl', 'napój',
    'herbata', 'wino', 'owoc morza', 'wędlina', 'pieróg', 'pies', 'kot', 'koń',
    'gołąb', 'motyl', 'owad', 'kaktus', 'jaskinia', 'góra', 'pustynia', 'zamek',
    'plaża', 'park narodowy', 'władca', 'prezydent', 'cesarz', 'pomnik', 'muzeum',
    'gatunek', 'taniec', 'kompozytor', 'dyrygent', 'aktor', 'teleturniej', 'smartfon',
    'procesor', 'karta graficzna', 'telefon', 'lokomotywa', 'pociąg', 'rower', 'silnik',
    'robot', 'maszyna', 'pierwiastek', 'minerał', 'skała', 'sieć', 'marka odzieżowa',
    'marka kosmetyków', 'marka napoju', 'marka piwa', 'hotel', 'restauracja', 'zabawka',
    'gra planszowa', 'moneta', 'znaczek', 'odznaczenie', 'zegarek', 'drzwi', 'samochód',
    'motocykl', 'ciężarówka', 'autobus', 'samochód terenowy', 'samochód wyścigowy',
    'samolot', 'statek', 'budynek', 'drzewo', 'kwiat', 'zwierzę', 'roślina',
    'marka samochodu', 'aplikacja', 'logotyp', 'flaga', 'herb', 'skamieniałość',
  ].map((s) => s.toLowerCase()),
);

function moreTitleOk(cat, title) {
  const raw = String(title || '').trim();
  const answer = cleanTitle(raw);
  const low = answer.toLowerCase();
  if (!answer || answer.length < 2 || answer.length > 65) return false;
  if (GENERIC_ANSWERS.has(low) || low === String(cat?.name || '').toLowerCase()) return false;
  if (/^lista\b/i.test(raw) || /\(ujednoznacznienie\)/i.test(raw) || /^\d{1,4}$/.test(raw)) return false;
  if (/^(Galeria|Kategoria|Szablon|Plik|Wikiprojekt|Wikipedia|Portal):/i.test(raw)) return false;
  if (/\b(wykaz|spis|lista|galeria)\b/i.test(raw)) return false;
  return true;
}

function moreImageOk(cat, img) {
  if (!img) return false;
  if (cat?.id === 'aplikacje-internetowe' && /^https:\/\/cdn\.simpleicons\.org\//i.test(img)) return true;
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(img)) return false;
  let file = '';
  try {
    file = decodeURIComponent(new URL(img).pathname.split('/').pop() || '').toLowerCase();
  } catch {
    return false;
  }
  if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(file)) return false;
  const special = new Set(['loga-firm', 'flagi-panstw', 'herby-panstw', 'aplikacje-internetowe']).has(cat?.id);
  if (!special && /\.svg$/i.test(file)) return false;
  const documentImage =
    /(screenshot|zrzut|diagram|schemat|wykres|chart|mapa|map_|_map|plan\b|logo|logotyp|icon|ikona|cover|okładka|poster|plakat|sheet|score|partytura|nuty|rag|schallplatte|record|album|naczynia|kuchenne|menu|ulotka|reklama)/i.test(
      file,
    );
  if (!special && documentImage) return false;
  if (special && /(screenshot|diagram|schemat|wykres|chart|mapa|sheet|score|naczynia|kuchenne|poster|plakat)/i.test(file)) return false;
  return true;
}

function moreCategory(cat) {
  let source = String(cat?.source || '').replace(/\s*\(.*$/, '').trim();
  if (source.startsWith('Kategoria:')) return source;
  return 'Kategoria:' + String(cat?.name || '').trim();
}

function addMorePage(cat, page, known, knownImages, items) {
  if (!page || page.missing || !page.thumbnail?.source) return;
  if (!moreTitleOk(cat, page.title)) return;
  const answer = cleanTitle(page.title);
  const key = answer.toLowerCase();
  if (known.has(key)) return;
  const img = page.thumbnail.source.split('?')[0];
  if (knownImages.has(img) || !moreImageOk(cat, img)) return;
  known.add(key);
  knownImages.add(img);
  items.push({ a: answer, img });
}

async function restSearchMore(cat, target, known, knownImages, items) {
  const url = new URL('https://pl.wikipedia.org/w/rest.php/v1/search/page');
  url.searchParams.set('q', String(cat?.name || '').trim());
  url.searchParams.set('limit', '50');
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    for (const page of data?.pages || []) {
      if (items.length >= target) break;
      let img = page?.thumbnail?.url;
      if (!img) continue;
      img = img.startsWith('//') ? 'https:' + img : img;
      img = img.replace(/\/\d+px-/, '/800px-');
      addMorePage(
        cat,
        { title: page.title, thumbnail: { source: img } },
        known,
        knownImages,
        items,
      );
    }
  } catch {}
}

/** Doczytuje pytania z Wikipedii: kategoria + podkategorie + wyszukiwanie. */
export async function loadMorePack(cat, target = 50) {
  const source = moreCategory(cat);
  if (!source) return [];
  const known = new Set((cat.items || []).map((q) => String(q.a).toLowerCase()));
  const knownImages = new Set((cat.items || []).map((q) => q.img));
  const items = [];

  const queue = [{ title: source, depth: 0 }];
  const visited = new Set();
  let categoriesRead = 0;
  while (queue.length && items.length < target && categoriesRead < 10) {
    const { title, depth } = queue.shift();
    if (!title || visited.has(title)) continue;
    visited.add(title);
    categoriesRead += 1;
    try {
      const data = await wikiJson({
        action: 'query',
        generator: 'categorymembers',
        gcmtitle: title,
        gcmtype: 'page',
        gcmlimit: '500',
        prop: 'pageimages',
        pilimit: '500',
        piprop: 'thumbnail',
        pithumbsize: '1000',
      });
      for (const page of Object.values(data?.query?.pages || {})) {
        addMorePage(cat, page, known, knownImages, items);
        if (items.length >= target) break;
      }
    } catch (err) {
      if (String(err.message || err).includes('ogranicza')) break;
    }
    if (depth < 2 && categoriesRead < 10 && items.length < target) {
      try {
        const subs = await wikiJson({
          action: 'query',
          list: 'categorymembers',
          cmtitle: title,
          cmtype: 'subcat',
          cmlimit: '100',
        });
        for (const sub of subs?.query?.categorymembers || []) {
          if (sub.title && !visited.has(sub.title)) queue.push({ title: sub.title, depth: depth + 1 });
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (items.length < target) {
    // REST search ma osobny limit i działa nawet gdy action=query zwraca 429.
    await restSearchMore(cat, target, known, knownImages, items);
  }
  if (items.length < target) {
    try {
      const data = await wikiJson({
        action: 'query',
        generator: 'search',
        gsrsearch: String(cat?.name || '').trim(),
        gsrnamespace: '0',
        gsrlimit: '50',
        prop: 'pageimages',
        pilimit: '50',
        piprop: 'thumbnail',
        pithumbsize: '1000',
      });
      for (const page of Object.values(data?.query?.pages || {})) {
        addMorePage(cat, page, known, knownImages, items);
        if (items.length >= target) break;
      }
    } catch {}
  }
  return items;
}
