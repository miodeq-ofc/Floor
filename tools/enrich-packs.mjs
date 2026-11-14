// Automatyczne uzupełnianie paczek pytań z Wikipedii.
// Dla każdej kategorii: bezpośrednie strony + podkategorie (2 poziomy),
// a gdy nadal brakuje — wyszukiwanie Wikipedii. Wszystko jest filtrowane
// (duplikaty, listy, złe typy zdjęć) i zapisywane w data/packs/*.json.
//
// Użycie:
//   node tools/enrich-packs.mjs [--target=100] [--from=0] [--to=999]
//
// Skrypt nie usuwa istniejących pytań — tylko dokłada nowe, więc kuratorowane
// pozycje zostają na początku paczki.

import { readdir, readFile, writeFile } from 'node:fs/promises';

const OUT = 'data/packs';
const WIKI = 'https://pl.wikipedia.org/w/api.php';
const UA = 'TheFloorQuizBuilder/1.0 (automatic category enrichment)';
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? Number(hit.split('=')[1]) : def;
};
const TARGET = Math.max(20, arg('target', 100));
const FROM = arg('from', 0);
const TO = arg('to', 999);
const REST_CACHE_ARG = process.argv.find((a) => a.startsWith('--rest-cache='));
const REST_CACHE = REST_CACHE_ARG ? REST_CACHE_ARG.split('=')[1] : '';
const MAX_CATS = 4;
const MAX_PAGES_PER_CAT = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SVG_OK = new Set(['loga-firm', 'flagi-panstw', 'herby-panstw', 'aplikacje-internetowe']);
// Popularne aplikacje mają ręcznie wybrany, aktualny zestaw — automat
// dopisywałby do nich przypadkowe biblioteki i frameworki z Wikipedii.
const CURATED = new Set(['aplikacje-internetowe']);
const GENERIC = new Set(
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
    'aplikacje internetowe', 'logotypy', 'logotypy znanych marek', 'flagi', 'flagi państw',
    'herby', 'herby państw', 'skamieniałości',
    'owoc', 'warzywo', 'grzyb', 'deser', 'zupa', 'ciasto', 'przekąska', 'słodycz',
    'koktajl', 'napój', 'herbata', 'wino', 'piwo', 'owoc morza', 'wędlina', 'mięso',
    'pieróg', 'pies', 'kot', 'koń', 'gołąb', 'motyl', 'owad', 'kaktus', 'jaskinia',
    'góra', 'pustynia', 'zamek', 'plaża', 'park narodowy', 'władca', 'prezydent',
    'cesarz', 'pomnik', 'muzeum', 'gatunek', 'taniec', 'kompozytor', 'dyrygent', 'aktor',
    'teleturniej', 'smartfon', 'procesor', 'karta graficzna', 'telefon', 'lokomotywa',
    'pociąg', 'rower', 'silnik', 'robot', 'maszyna', 'pierwiastek', 'minerał', 'skała',
    'sieć', 'marka odzieżowa', 'marka kosmetyków', 'marka napoju', 'marka piwa', 'hotel',
    'restauracja', 'zabawka', 'gra planszowa', 'moneta', 'znaczek', 'odznaczenie',
    'zegarek', 'drzwi', 'samochód', 'motocykl', 'ciężarówka', 'autobus',
    'samochód terenowy', 'samochód wyścigowy', 'samolot', 'statek', 'budynek', 'drzewo',
    'kwiat', 'zwierzę', 'roślina', 'marka samochodu', 'aplikacja', 'logotyp', 'flaga',
    'herb', 'skamieniałość', 'flaga państwowa', 'herb państwowy', 'godło państwowe',
  ].map((s) => s.toLowerCase()),
);

const clean = (title) =>
  String(title)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

function titleOk(pack, title) {
  const raw = String(title || '').trim();
  const answer = clean(raw);
  const low = answer.toLowerCase();
  if (!answer || answer.length < 2 || answer.length > 65) return false;
  if (GENERIC.has(low) || low === String(pack.name || '').toLowerCase()) return false;
  if (/^lista\b/i.test(raw)) return false;
  if (/\(ujednoznacznienie\)/i.test(raw)) return false;
  if (/^\d{1,4}$/.test(raw)) return false;
  if (/^(Galeria|Kategoria|Szablon|Plik|Wikiprojekt|Wikipedia|Portal):/i.test(raw)) return false;
  if (/^(Zobacz|Historia|Przypisy|Bibliografia|Linki zewnętrzne)\b/i.test(raw)) return false;
  if (/\b(wykaz|spis|lista|galeria)\b/i.test(raw)) return false;
  return true;
}

function imageOk(pack, img) {
  if (!img) return false;
  if (pack.id === 'aplikacje-internetowe' && /^https:\/\/cdn\.simpleicons\.org\//i.test(img)) return true;
  const special = SVG_OK.has(pack.id);
  const commonsFile = /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(img);
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(img) && !(special && commonsFile)) return false;
  let file = '';
  try {
    file = decodeURIComponent(new URL(img).pathname.split('/').pop() || '').toLowerCase();
  } catch {
    return false;
  }
  if (!file || !/\.(jpe?g|png|webp|gif|svg)$/i.test(file)) return false;
  if (!special && /\.svg$/i.test(file)) return false;
  const documentImage =
    /(screenshot|zrzut|diagram|schemat|wykres|chart|mapa|map_|_map|map-|plan\b|logo|logotyp|wordmark|icon|ikona|cover|okładka|poster|plakat|sheet|score|partytura|nuty|rag|schallplatte|record|album|naczynia|kuchenne|menu|ulotka|reklama)/i.test(
      file,
    );
  // Logotypy, flagi, herby i ikony aplikacji mają własne, jasne karty —
  // tam „logo”/„icon” jest poprawną treścią, a nie przypadkowym dokumentem.
  if (!special && documentImage) return false;
  if (special && /(screenshot|zrzut|diagram|schemat|wykres|chart|mapa|sheet|score|naczynia|kuchenne|poster|plakat)/i.test(file)) return false;
  if (pack.id === 'marki-samochodow' && /(logo|badge|emblem|znak|brand)/i.test(file)) return false;
  return true;
}

function categoryOf(pack) {
  let source = String(pack.source || '').trim();
  source = source.replace(/\s*\(.*$/, '').trim();
  if (source.startsWith('Kategoria:')) return source;
  return 'Kategoria:' + String(pack.name || '').trim();
}

async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * (i + 1));
        continue;
      }
      throw new Error('HTTP ' + res.status);
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(800 * (i + 1));
    }
  }
  throw new Error('limit');
}

async function api(params) {
  const url = new URL(WIKI);
  for (const [key, value] of Object.entries({ format: 'json', origin: '*', ...params })) {
    url.searchParams.set(key, value);
  }
  return fetchJson(url);
}

function addPage(candidates, pack, page, seenAnswers, seenImages) {
  if (!page || page.missing || !page.thumbnail?.source) return;
  if (page.description && /(lista|list of|ujednoznacznienie|disambiguation)/i.test(page.description)) return;
  if (!titleOk(pack, page.title)) return;
  const answer = clean(page.title);
  const key = answer.toLowerCase();
  if (seenAnswers.has(key)) return;
  const img = page.thumbnail.source.split('?')[0];
  if (seenImages.has(img) || !imageOk(pack, img)) return;
  seenAnswers.add(key);
  seenImages.add(img);
  candidates.push({ a: answer, img });
}

async function categoryCandidates(pack, max) {
  const candidates = [];
  const seenAnswers = new Set((pack.items || []).map((x) => String(x.a).toLowerCase()));
  const seenImages = new Set((pack.items || []).map((x) => x.img));
  const queue = [{ title: categoryOf(pack), depth: 0 }];
  const visited = new Set();
  let categoriesRead = 0;

  while (queue.length && candidates.length < max && categoriesRead < MAX_CATS) {
    const { title, depth } = queue.shift();
    if (!title || visited.has(title)) continue;
    visited.add(title);
    categoriesRead += 1;

    try {
      const data = await api({
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
        addPage(candidates, pack, page, seenAnswers, seenImages);
        if (candidates.length >= max) break;
      }
    } catch (err) {
      console.log(`  ! ${title}: ${String(err).slice(0, 90)}`);
    }

    if (depth < 2 && categoriesRead < MAX_CATS) {
      try {
        const subs = await api({
          action: 'query',
          list: 'categorymembers',
          cmtitle: title,
          cmtype: 'subcat',
          cmlimit: '100',
        });
        for (const sub of subs?.query?.categorymembers || []) {
          if (sub.title && !visited.has(sub.title)) queue.push({ title: sub.title, depth: depth + 1 });
        }
        await sleep(90);
      } catch {}
    }
    await sleep(90);
  }
  return candidates;
}

async function restSearchCandidates(pack, max) {
  const candidates = [];
  const seenAnswers = new Set((pack.items || []).map((x) => String(x.a).toLowerCase()));
  const seenImages = new Set((pack.items || []).map((x) => x.img));
  const url = new URL('https://pl.wikipedia.org/w/rest.php/v1/search/page');
  url.searchParams.set('q', pack.name);
  url.searchParams.set('limit', '50');
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    for (const page of data?.pages || []) {
      if (candidates.length >= max) break;
      const raw = page?.thumbnail?.url;
      if (!raw) continue;
      let img = raw.startsWith('//') ? 'https:' + raw : raw;
      img = img.replace(/\/\d+px-/, '/800px-').split('?')[0];
      addPage(
        candidates,
        pack,
        { title: page.title, thumbnail: { source: img } },
        seenAnswers,
        seenImages,
      );
    }
  } catch (err) {
    console.log(`  ! REST search ${pack.name}: ${String(err).slice(0, 90)}`);
  }
  return candidates;
}

async function cachedCandidates(pack, max) {
  const candidates = [];
  const seenAnswers = new Set((pack.items || []).map((x) => String(x.a).toLowerCase()));
  const seenImages = new Set((pack.items || []).map((x) => x.img));
  const pages = REST_CACHE ? await readFile(REST_CACHE, 'utf8').then((s) => JSON.parse(s)[pack.id] || []).catch(() => []) : [];
  for (const page of pages) {
    if (candidates.length >= max) break;
    const raw = page?.thumbnail?.url;
    if (!raw) continue;
    let img = raw.startsWith('//') ? 'https:' + raw : raw;
    img = img.replace(/\/\d+px-/, '/800px-').split('?')[0];
    addPage(
      candidates,
      pack,
      { title: page.title, description: page.description, thumbnail: { source: img } },
      seenAnswers,
      seenImages,
    );
  }
  return candidates;
}

async function searchCandidates(pack, max) {
  // REST search nie jest objęty tym samym limitem 429 co action=query.
  const cached = await cachedCandidates(pack, max);
  if (cached.length) return cached;
  const rest = await restSearchCandidates(pack, max);
  if (rest.length >= max) return rest;
  const candidates = [...rest];
  const seenAnswers = new Set((pack.items || []).map((x) => String(x.a).toLowerCase()));
  const seenImages = new Set((pack.items || []).map((x) => x.img));
  const query = [pack.name, pack.category, 'Polska']
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(' ');
  for (const offset of [0, 50]) {
    if (candidates.length >= max) break;
    try {
      const data = await api({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: '0',
        gsrlimit: '50',
        gsroffset: offset,
        prop: 'pageimages',
        pilimit: '50',
        piprop: 'thumbnail',
        pithumbsize: '1000',
      });
      for (const page of Object.values(data?.query?.pages || {})) {
        addPage(candidates, pack, page, seenAnswers, seenImages);
      }
    } catch (err) {
      console.log(`  ! search ${pack.name}: ${String(err).slice(0, 90)}`);
      break;
    }
    await sleep(120);
  }
  return candidates;
}

await readdir(OUT).catch(() => []); // ensure directory exists
const files = (await readdir(OUT)).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const slice = files.slice(FROM, TO);
const report = [];
let addedTotal = 0;
let processed = 0;

for (const file of slice) {
  const path = `${OUT}/${file}`;
  let pack;
  try {
    pack = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    continue;
  }
  if (!pack.items?.length) continue;
  processed += 1;
  if (CURATED.has(pack.id)) {
    report.push({ id: pack.id, name: pack.name, before: pack.items.length, after: pack.items.length, added: 0, removed: 0, target: TARGET, status: 'curated' });
    console.log(`[${processed}/${slice.length}] ${pack.name}: kuratorowana, ${pack.items.length} pytań`);
    continue;
  }

  // Automatyczna walidacja istniejących danych: usuwamy ogólniki, listy,
  // duplikaty i zdjęcia, które są dokumentem/okładką/plakatem zamiast obiektu.
  const validItems = [];
  const validAnswers = new Set();
  const validImages = new Set();
  for (const item of pack.items) {
    if (!item?.a || !item.img) continue;
    const answer = clean(item.a);
    const key = answer.toLowerCase();
    if (!titleOk(pack, item.a) || !imageOk(pack, item.img)) continue;
    if (validAnswers.has(key) || validImages.has(item.img)) continue;
    validAnswers.add(key);
    validImages.add(item.img);
    validItems.push({ a: answer, img: item.img });
  }
  const removed = pack.items.length - validItems.length;
  pack.items = validItems;
  const before = pack.items.length;
  const need = Math.max(0, TARGET - before);
  if (!need) {
    if (removed) await writeFile(path, JSON.stringify(pack));
    report.push({ id: pack.id, name: pack.name, before, after: before, added: 0, removed, target: TARGET, status: 'ok' });
    continue;
  }
  console.log(`\n[${processed}/${slice.length}] ${pack.name}: ${before} → cel ${TARGET}`);
  const extra = REST_CACHE ? await cachedCandidates(pack, need) : await categoryCandidates(pack, need);
  if (!REST_CACHE && extra.length < need) {
    for (const item of await searchCandidates(pack, need - extra.length)) {
      if (extra.length >= need) break;
      if (!extra.some((x) => x.a.toLowerCase() === item.a.toLowerCase())) extra.push(item);
    }
  }
  if (extra.length) {
    pack.items.push(...extra);
    await writeFile(path, JSON.stringify(pack));
    addedTotal += extra.length;
    console.log(`  + ${extra.length} (razem ${pack.items.length})`);
  } else {
    console.log('  + 0 (brak nowych z kategorii i wyszukiwania)');
  }
  report.push({
    id: pack.id,
    name: pack.name,
    before,
    after: pack.items.length,
    added: extra.length,
    removed,
    target: TARGET,
    status: pack.items.length >= TARGET ? 'ok' : 'malo',
  });
}

const all = [];
for (const file of (await readdir(OUT)).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  try {
    const pack = JSON.parse(await readFile(`${OUT}/${file}`, 'utf8'));
    if (pack.items?.length) {
      all.push({
        id: pack.id,
        name: pack.name,
        group: pack.group,
        icon: pack.icon,
        prompt: pack.prompt,
        count: pack.items.length,
      });
    }
  } catch {}
}
const order = ['Motoryzacja', 'Kuchnia', 'Przyroda', 'Geografia', 'Historia', 'Muzyka', 'Film i TV', 'Technika', 'Nauka', 'Marki', 'Zabawa', 'Inne'];
all.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, 'pl'));
await writeFile(`${OUT}/index.json`, JSON.stringify({ generated: new Date().toISOString(), packs: all }));
await writeFile(`${OUT}/quality-report.json`, JSON.stringify({ generated: new Date().toISOString(), target: TARGET, added: addedTotal, packs: report }, null, 2));

console.log(`\nDodano ${addedTotal} pytań. Razem ${all.length} kategorii, ${all.reduce((s, p) => s + p.count, 0)} pytań.`);
const low = report.filter((x) => x.after < TARGET);
if (low.length) console.log('Nadal poniżej celu: ' + low.map((x) => `${x.name} (${x.after})`).join(', '));
