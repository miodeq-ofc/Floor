// Wspólny silnik: dane, kanał synchronizacji, kolejki pytań.
import { normalizeImageUrl } from './images.js';

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

// Kategorie, w których zdjęcie musi pokazywać produkt/obiekt, a nie siedzibę
// firmy, sklep, wnętrze albo dokument. To najczęstszy powód „pustych” lub
// niepasujących obrazków w materiale pobranym automatycznie z Wikipedii.
const IMAGE_RULES = {
  'marki-napojow': /(headquarter|headquarters|hq[a-z]|office|store|shop|factory|building|distribution|shelf|mollinsburn|sugarland|warehouse|market|restaurant|street|avenue|advertisement)/i,
  'napoje-bezalkoholowe': /(shelf|shop|store|factory|building|headquarter|hq[a-z]|market|restaurant|\bbar\b|collecting|birch|tree|forest|plantation|walmart|wallmart|cafe|coffeehouse|kiosk)/i,
  'samochody': /(museum|factory|interior|navigation|\boil\b|industry|assembly|plant|headquarter|hq[a-z]|engine|showroom|dealership|street_food|car_wash|wash|detailing|parking|dashboard|electronics|radio|display|screen|bots?|robot)/i,
  'marki-samochodow': /(logo|badge|emblem|factory|headquarter|hq[a-z]|office|store|dealer|museum|gallery|american-motors|multia_log|facility|plant)/i,
  'herbaty': /(teahouse|tea_house|ceremony|chashitsu|boston|advertisement|botanical|sasanqua|sinensis|museum|shop|plantation|matchsafe|monk)/i,
  'owoce-jadalne': /(factory|processing|seafood|pasta|market|shop|plantation)/i,
  'owoce-morza': /(pasta|restaurant|market|shop)/i,
  'piwo': /(browar|brewery|factory|building|award|museum|drone|dron|headquarter|hq[a-z])/i,
  'marki-kosmetykow': /(shop|store|interior|building|headquarter|hq[a-z]|shelf)/i,
  'restauracje': /(ghost|wirtualna|street_food|menu|billboard|advertisement)/i,
  'zupy': /(restaurant|street_food|shop|market|menu)/i,
  'przekaski': /(street_food|shop|market|restaurant|menu)/i,
  'ciasta-deserowe': /(shop|store|restaurant|market|menu)/i,
  'ciasta-wytrawne': /(shop|store|restaurant|market|menu)/i,
  'desery': /(shop|store|restaurant|market|menu)/i,
  'samochody-wyscigowe': /(headquarter|hq[a-z]|museum|gallery|speed_tape|factory|showroom)/i,
};

// Odpowiedzi, które nie są rzeczami z kategorii (np. „Face lifting”
// w pytaniu „Jaki to samochód?”), odpadają jeszcze przed losowaniem.
const ANSWER_RULES = {
  'samochody': /(face ?lifting|tuning|samochodzik|elektronika|muzeum|auto detailing|g-power|navigation|radio navigation|przemysł|dynamiczna wymiana oleju|historia samochodu|oklejanie)/i,
  'samochody-wyscigowe': /^(speed tape|formuła 1|scg)$/i,
  'napoje-bezalkoholowe': /^(napój bezalkoholowy|napój|fusy)$/i,
  'herbaty': /^(kamelia|herbatka bostońska|japońska ceremonia picia herbaty|chashitsu)$/i,
};

const GENERIC_DOCUMENT_IMAGE = /(screenshot|zrzut|diagram|schemat|wykres|chart|mapa|map_|_map|map-|plan\b|logo|logotyp|wordmark|icon|ikona|cover|okładka|poster|plakat|sheet|score|partytura|nuty|menu|ulotka|reklama|advertisement)/i;
const IMAGE_SPECIAL_PACKS = new Set(['loga-firm', 'flagi-panstw', 'herby-panstw', 'aplikacje-internetowe']);

function imageFile(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || '').toLowerCase();
  } catch {
    return '';
  }
}

function answerLooksUsable(cat, answer) {
  const value = String(answer || '').trim();
  if (!value) return false;
  const rule = ANSWER_RULES[cat?.id];
  return !rule || !rule.test(value);
}

export function imageLooksUsable(cat, img) {
  if (!img) return false;
  img = normalizeImageUrl(img);
  const special = IMAGE_SPECIAL_PACKS.has(cat?.id);
  if (special && /^https:\/\/cdn\.simpleicons\.org\//i.test(img)) return true;
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(img) && !(special && /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(img))) {
    return false;
  }
  const file = imageFile(img);
  if (!file || !/\.(jpe?g|png|webp|gif|svg)(?:\.|$)/i.test(file)) return false;
  if (!special && /\.svg(?:\.|$)/i.test(file)) return false;
  if (!special && GENERIC_DOCUMENT_IMAGE.test(file)) return false;
  const rule = IMAGE_RULES[cat?.id];
  if (rule && rule.test(file)) return false;
  return true;
}

function sanitizePack(cat, pack) {
  if (!pack?.items?.length) return pack;
  const seen = new Set();
  const images = new Set();
  pack.items = pack.items.filter((q) => {
    if (!q?.a || !q.img || !answerLooksUsable(cat, q.a)) return false;
    q.img = normalizeImageUrl(q.img);
    const key = String(q.a).toLowerCase();
    if (seen.has(key) || images.has(q.img) || !imageLooksUsable(cat, q.img)) return false;
    seen.add(key);
    images.add(q.img);
    return true;
  });
  return pack;
}

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
  pack = sanitizePack(cat, pack);
  if (!pack.items || !pack.items.length) throw new Error('Kategoria ' + cat.name + ' nie ma zdjęć, które pasują do tematu');
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
  // Kategorie Wikipedii często mają same podkategorie. loadMorePack umie
  // zejść poziom niżej i dociągnąć strony także wtedy, gdy bezpośrednia
  // kategoria jest prawie pusta.
  let items = [];
  try {
    items = await loadMorePack({ ...cat, items: [] }, 36);
  } catch {
    items = [];
  }
  if (!items.length) {
    // Awaryjnie: pojedyncze zapytanie o strony kategorii (bez podkategorii).
    const data = await wikiJson({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: cat.cat,
      gcmtype: 'page',
      gcmlimit: '50',
      prop: 'pageimages',
      pilimit: '50',
      piprop: 'thumbnail',
      pithumbsize: '800',
    });
    for (const page of Object.values(data?.query?.pages || {})) {
      if (!page.thumbnail?.source || !titleOk(page.title)) continue;
      const answer = cleanTitle(page.title);
      if (!answer || items.some((x) => x.a.toLowerCase() === answer.toLowerCase())) continue;
      items.push({ a: answer, img: page.thumbnail.source.split('?')[0] });
    }
  }
  items = sanitizePack(cat, { items }).items;
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
  return imageLooksUsable(cat, img);
}

function moreCategory(cat) {
  let source = String(cat?.source || cat?.cat || '').replace(/\s*\(.*$/, '').trim();
  if (source.startsWith('Kategoria:')) return source;
  return 'Kategoria:' + String(cat?.name || '').trim();
}

function addMorePage(cat, page, known, knownImages, items) {
  if (!page || page.missing || !page.thumbnail?.source) return;
  if (!moreTitleOk(cat, page.title) || !answerLooksUsable(cat, cleanTitle(page.title))) return;
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
