// Buduje lokalną bazę pytań do gry z polskiej Wikipedii i Wikidata.
// Użycie: node tools/build-packs.mjs [--force] [--from=N] [--to=N]
// Wynik: data/packs/<id>.json + data/packs/index.json
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';

const WIKI = 'https://pl.wikipedia.org/w/api.php';
const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'TheFloorQuizBuilder/1.0 (offline quiz data)';
const OUT = 'data/packs';
const FORCE = process.argv.includes('--force');
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? Number(hit.split('=')[1]) : def;
};
const FROM = arg('from', 0);
const TO = arg('to', 999);

const wiki = (group, icon, id, name, prompt, cat) => ({ source: 'wiki', group, icon, id, name, prompt, cat });
const wd = (group, icon, id, name, prompt, sparql) => ({ source: 'wikidata', group, icon, id, name, prompt, sparql });
const K = (n) => 'Kategoria:' + n;

const sources = [
  wiki('Motoryzacja', '🚗', 'marki-samochodow', 'Marki samochodów', 'Jaka to marka samochodu?', K('Marki samochodów')),
  wiki('Motoryzacja', '🚘', 'samochody', 'Samochody', 'Jaki to samochód?', K('Samochody')),
  wiki('Motoryzacja', '🏍️', 'motocykle', 'Motocykle', 'Jaki to motocykl?', K('Motocykle')),
  wiki('Motoryzacja', '🚚', 'ciezarowki', 'Samochody ciężarowe', 'Jaka to ciężarówka?', K('Samochody ciężarowe')),
  wiki('Motoryzacja', '🚌', 'autobusy', 'Autobusy', 'Jaki to autobus?', K('Autobusy')),
  wiki('Motoryzacja', '🛻', 'samochody-terenowe', 'Samochody terenowe', 'Jaki to samochód terenowy?', K('Samochody terenowe')),
  wiki('Motoryzacja', '🏎️', 'samochody-wyscigowe', 'Samochody wyścigowe', 'Jaki to samochód wyścigowy?', K('Samochody wyścigowe')),
  wiki('Motoryzacja', '🏁', 'formula-1', 'Formuła 1', 'Jaki to bolid lub zespół F1?', K('Formuła 1')),

  wiki('Kuchnia', '🌶️', 'przyprawy', 'Przyprawy', 'Jaka to przyprawa?', K('Przyprawy')),
  wiki('Kuchnia', '🥕', 'warzywa', 'Warzywa', 'Jaka to roślina warzywna?', K('Warzywa')),
  wiki('Kuchnia', '🍄', 'grzyby-jadalne', 'Grzyby jadalne', 'Jaki to grzyb?', K('Grzyby jadalne')),
  wiki('Kuchnia', '☠️', 'grzyby-trujace', 'Grzyby trujące', 'Jaki to grzyb?', K('Grzyby trujące')),
  wiki('Kuchnia', '🍮', 'desery', 'Desery', 'Jaki to deser?', K('Desery')),
  wiki('Kuchnia', '🍲', 'zupy', 'Zupy', 'Jaka to zupa?', K('Zupy')),
  wiki('Kuchnia', '🍰', 'ciasta-deserowe', 'Ciasta deserowe', 'Jaki to wypiek?', K('Ciasta deserowe')),
  wiki('Kuchnia', '🥧', 'ciasta-wytrawne', 'Ciasta wytrawne', 'Jaki to wypiek?', K('Ciasta wytrawne')),
  wiki('Kuchnia', '🥨', 'przekaski', 'Przekąski', 'Jaka to przekąska?', K('Przekąski')),
  wiki('Kuchnia', '🍬', 'slodycze', 'Słodycze', 'Jaki to słodycz?', K('Słodycze')),
  wiki('Kuchnia', '🍹', 'koktajle', 'Koktajle', 'Jaki to koktajl?', K('Koktajle alkoholowe')),
  wiki('Kuchnia', '🥤', 'napoje-bezalkoholowe', 'Napoje bezalkoholowe', 'Jaki to napój?', K('Napoje bezalkoholowe')),
  wiki('Kuchnia', '🍵', 'herbaty', 'Herbaty', 'Jaka to herbata?', K('Herbaty')),
  wiki('Kuchnia', '🍷', 'wina', 'Wina', 'Jakie to wino?', K('Wina')),
  wiki('Kuchnia', '🍺', 'piwo', 'Piwo', 'Jaka to marka lub gatunek piwa?', K('Piwo')),
  wiki('Kuchnia', '🦐', 'owoce-morza', 'Owoce morza', 'Jaki to owoc morza?', K('Owoce morza')),
  wiki('Kuchnia', '🥓', 'wedliny', 'Wędliny', 'Jaka to wędlina?', K('Wędliny')),
  wiki('Kuchnia', '🥩', 'miesa', 'Mięsa', 'Jaki to mięso?', K('Mięsa')),
  wiki('Kuchnia', '🥟', 'pierogi', 'Pierogi', 'Jaki to rodzaj pierogów?', K('Pierogi')),
  wiki('Kuchnia', '🍎', 'owoce-jadalne', 'Owoce jadalne', 'Jaki to owoc?', K('Owoce jadalne')),

  wiki('Przyroda', '🐕', 'rasy-psow', 'Rasy psów', 'Jaka to rasa psa?', K('Rasy psów')),
  wiki('Przyroda', '🐈', 'rasy-kotow', 'Rasy kotów', 'Jaka to rasa kota?', K('Rasy kotów')),
  wiki('Przyroda', '🐎', 'rasy-koni', 'Rasy koni', 'Jaka to rasa konia?', K('Rasy koni')),
  wiki('Przyroda', '🕊️', 'rasy-golebi', 'Rasy gołębi', 'Jaka to rasa gołębia?', K('Rasy gołębi')),
  wiki('Przyroda', '🐠', 'ryby-akwariowe', 'Ryby akwariowe', 'Jaka to ryba akwariowa?', K('Ryby akwariowe')),
  wiki('Przyroda', '🦋', 'motyle', 'Motyle', 'Jaki to motyl?', K('Motyle')),
  wiki('Przyroda', '🐝', 'owady', 'Owady', 'Jaki to owad?', K('Owady')),
  wiki('Przyroda', '🦴', 'skamienialosci', 'Skamieniałości', 'Jaka to skamieniałość?', K('Skamieniałości')),
  wiki('Przyroda', '🌵', 'kaktusy', 'Kaktusy', 'Jaki to kaktus?', K('Kaktusy')),

  wiki('Geografia', '🕳️', 'jaskinie', 'Jaskinie', 'Jaka to jaskinia?', K('Jaskinie')),
  wiki('Geografia', '⛰️', 'gory', 'Góry', 'Jaka to góra lub szczyt?', K('Góry')),
  wiki('Geografia', '🏜️', 'pustynie', 'Pustynie', 'Jaka to pustynia?', K('Pustynie')),
  wiki('Geografia', '🏰', 'zamki', 'Zamki', 'Jaki to zamek?', K('Zamki')),
  wiki('Geografia', '🏖️', 'plaze', 'Plaże', 'Jaka to plaża?', K('Plaże')),
  wiki('Geografia', '🌲', 'parki-narodowe', 'Parki narodowe', 'Jaki to park narodowy?', K('Parki narodowe w Polsce')),

  wiki('Historia', '👑', 'wladcy-polski', 'Władcy Polski', 'Jaki to władca Polski?', K('Władcy Polski')),
  wiki('Historia', '🇺🇸', 'prezydenci-usa', 'Prezydenci USA', 'Jaki to prezydent USA?', K('Prezydenci Stanów Zjednoczonych')),
  wiki('Historia', '🏛️', 'cesarze-rzymscy', 'Cesarze rzymscy', 'Jaki to cesarz rzymski?', K('Cesarze rzymscy')),
  wiki('Historia', '🗿', 'pomniki', 'Pomniki', 'Jaki to pomnik?', K('Pomniki')),
  wiki('Historia', '🖼️', 'muzea', 'Muzea', 'Jaki to obraz lub eksponat?', K('Muzea')),

  wiki('Muzyka', '🎵', 'gatunki-muzyczne', 'Gatunki muzyczne', 'Jaki to gatunek muzyczny?', K('Gatunki muzyczne')),
  wiki('Muzyka', '💃', 'tance', 'Tańce', 'Jaki to taniec?', K('Tańce')),
  wiki('Muzyka', '🎼', 'kompozytorzy', 'Kompozytorzy', 'Jaki to kompozytor?', K('Kompozytorzy')),
  wiki('Muzyka', '🪄', 'dyrygenci', 'Dyrygenci', 'Jaki to dyrygent?', K('Dyrygenci')),

  wiki('Film i TV', '🎭', 'polscy-aktorzy', 'Polscy aktorzy', 'Jaki to aktor?', K('Polscy aktorzy')),
  wiki('Film i TV', '📺', 'teleturnieje', 'Teleturnieje', 'Jaki to teleturniej?', K('Teleturnieje')),

  wiki('Technika', '📱', 'smartfony', 'Smartfony', 'Jaki to smartfon?', K('Smartfony')),
  wiki('Technika', '💻', 'procesory', 'Procesory', 'Jaki to procesor?', K('Procesory')),
  wiki('Technika', '🖥️', 'karty-graficzne', 'Karty graficzne', 'Jaka to karta graficzna?', K('Karty graficzne')),
  wiki('Technika', '☎️', 'telefony', 'Telefony komórkowe', 'Jaki to telefon?', K('Telefony komórkowe')),
  wiki('Technika', '🚂', 'lokomotywy', 'Lokomotywy', 'Jaka to lokomotywa?', K('Lokomotywy')),
  wiki('Technika', '🚆', 'pociagi', 'Pociągi', 'Jaki to pociąg?', K('Pociągi')),
  wiki('Technika', '🚲', 'rowery', 'Rowery', 'Jaki to rower?', K('Rowery')),
  wiki('Technika', '⚙️', 'silniki', 'Silniki', 'Jaki to silnik?', K('Silniki')),
  wiki('Technika', '🤖', 'roboty', 'Roboty', 'Jaki to robot?', K('Roboty')),
  wiki('Technika', '🏗️', 'maszyny', 'Maszyny', 'Jaka to maszyna?', K('Maszyny')),

  wiki('Nauka', '🧪', 'pierwiastki', 'Pierwiastki chemiczne', 'Jaki to pierwiastek?', K('Pierwiastki chemiczne')),
  wiki('Nauka', '💎', 'mineraly', 'Minerały', 'Jaki to minerał?', K('Minerały')),
  wiki('Nauka', '🪨', 'skaly', 'Skały', 'Jaka to skała?', K('Skały')),

  wiki('Marki', '🛒', 'sieci-handlowe', 'Sieci handlowe', 'Jaka to sieć sklepów?', K('Sieci handlowe')),
  wiki('Marki', '👕', 'marki-odziezowe', 'Marki odzieżowe', 'Jaka to marka odzieży?', K('Marki odzieżowe')),
  wiki('Marki', '🧴', 'marki-kosmetykow', 'Marki kosmetyków', 'Jaka to marka kosmetyków?', K('Marki kosmetyków')),
  wiki('Marki', '🥤', 'marki-napojow', 'Marki napojów', 'Jaka to marka napoju?', K('Marki napojów')),
  wiki('Marki', '🍻', 'marki-piwa', 'Marki piwa', 'Jaka to marka piwa?', K('Marki piwa')),
  wiki('Marki', '🏨', 'hotele', 'Hotele', 'Jaki to hotel?', K('Hotele')),
  wiki('Marki', '🍔', 'restauracje', 'Restauracje', 'Jaka to restauracja?', K('Restauracje')),

  wiki('Zabawa', '🧸', 'zabawki', 'Zabawki', 'Jaka to zabawka?', K('Zabawki')),
  wiki('Zabawa', '🎲', 'gry-planszowe', 'Gry planszowe', 'Jaka to gra planszowa?', K('Gry planszowe')),

  wiki('Inne', '🪙', 'monety', 'Monety', 'Jaka to moneta?', K('Monety')),
  wiki('Inne', '📮', 'znaczki', 'Znaczki pocztowe', 'Jaki to znaczek?', K('Znaczki pocztowe')),
  wiki('Inne', '🎖️', 'odznaczenia', 'Odznaczenia', 'Jakie to odznaczenie?', K('Odznaczenia')),
  wiki('Inne', '⌚', 'zegarki', 'Zegarki', 'Jaki to zegarek?', K('Zegarki')),
  wiki('Inne', '🚪', 'drzwi', 'Drzwi i bramy', 'Jaki to zabytek?', K('Drzwi')),

  wd(
    'Marki',
    '🏷️',
    'loga-firm',
    'Logotypy firm i marek',
    'Czyj to logotyp?',
    `SELECT ?item ?itemLabel ?logo WHERE {
      ?item wdt:P31/wdt:P279* wd:Q431289 .
      ?item wdt:P154 ?logo .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
    } LIMIT 1000`
  ),
  wd(
    'Geografia',
    '🚩',
    'flagi-panstw',
    'Flagi państw',
    'Jakiego państwa to flaga?',
    `SELECT ?item ?itemLabel ?logo WHERE {
      ?item wdt:P31 wd:Q6256 .
      ?item wdt:P41 ?logo .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
    } LIMIT 300`
  ),
  wd(
    'Geografia',
    '🛡️',
    'herby-panstw',
    'Herby państw',
    'Jakiego państwa to herb?',
    `SELECT ?item ?itemLabel ?logo WHERE {
      ?item wdt:P31 wd:Q6256 .
      ?item wdt:P94 ?logo .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
    } LIMIT 300`
  ),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, init = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': UA, accept: 'application/sparql-results+json, application/json', ...(init.headers || {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        process.stdout.write(`(429, czekam) `);
        await sleep(2500 * (i + 1));
        continue;
      }
      throw new Error('HTTP ' + res.status);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1200 * (i + 1));
    }
  }
  throw new Error('limit');
}

const clean = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
const badTitle = (t) =>
  t.length < 2 ||
  t.length > 70 ||
  /^lista\b/i.test(t) ||
  /\(ujednoznacznienie\)/i.test(t) ||
  /^\d{1,4}$/.test(t) ||
  /^(Galeria|Kategoria|Szablon|Plik|Wikiprojekt):/i.test(t) ||
  /^(Zobacz|Historia|Przypisy)\b/i.test(t);

async function wikiPack(src, maxItems = 150) {
  const base = {
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'categorymembers',
    gcmtitle: src.cat,
    gcmtype: 'page',
    gcmlimit: '50',
    prop: 'pageimages',
    pilimit: '50',
    piprop: 'thumbnail',
    pithumbsize: '800',
  };
  const items = [];
  const seen = new Set();
  let cont = {};
  let pagesSeen = 0;
  for (let round = 0; round < 5 && items.length < maxItems; round++) {
    const url = new URL(WIKI);
    for (const [k, v] of Object.entries({ ...base, ...cont })) url.searchParams.set(k, v);
    const data = await fetchJson(url);
    const pages = Object.values(data?.query?.pages || {});
    pagesSeen += pages.length;
    for (const page of pages) {
      if (!page.thumbnail?.source) continue;
      const raw = page.title;
      if (badTitle(raw)) continue;
      const answer = clean(raw);
      const key = answer.toLowerCase();
      if (!answer || seen.has(key)) continue;
      seen.add(key);
      items.push({ a: answer, img: page.thumbnail.source.split('?')[0] });
    }
    cont = data?.continue ? { continue: data.continue.continue, ...data.continue } : null;
    delete cont?.continue;
    if (!cont) break;
    await sleep(500);
  }
  return { items: items.slice(0, maxItems), pagesSeen };
}

async function wdPack(src, maxItems = 900) {
  const url = new URL(WDQS);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', src.sparql);
  const data = await fetchJson(url);
  const seen = new Set();
  const items = [];
  for (const row of data?.results?.bindings || []) {
    if (items.length >= maxItems) break;
    const raw = row.logo?.value;
    const answer = (row.itemLabel?.value || '').trim();
    if (!raw || !answer || /^Q\d+$/.test(answer)) continue;
    const key = answer.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let img;
    try {
      const file = new URL(raw);
      file.protocol = 'https:';
      file.searchParams.set('width', '700');
      img = file.toString();
    } catch {
      continue;
    }
    items.push({ a: answer, img });
  }
  return { items };
}

await mkdir(OUT, { recursive: true });
const files = (await readdir(OUT)).filter((f) => f.endsWith('.json') && f !== 'index.json');

const slice = sources.slice(FROM, TO);
const skipped = [];
let built = 0;

for (let i = 0; i < slice.length; i++) {
  const src = slice[i];
  const n = FROM + i;
  const file = `${OUT}/${src.id}.json`;
  if (!FORCE && files.includes(src.id + '.json')) {
    try {
      const prev = JSON.parse(await readFile(file, 'utf8'));
      if (prev.items?.length >= 8) {
        console.log(`[${n}] ${src.group} / ${src.name}: pomijam (już jest ${prev.items.length})`);
        continue;
      }
    } catch {}
  }
  const label = `[${n}] ${src.group} / ${src.name}`;
  try {
    const { items, pagesSeen } = src.source === 'wiki' ? await wikiPack(src) : await wdPack(src);
    if (items.length < 8) {
      console.log(`${label}: POMINIĘTA (${items.length} z ${pagesSeen ?? '?'})`);
      skipped.push(`${src.name} (${items.length})`);
      continue;
    }
    const pack = {
      id: src.id,
      name: src.name,
      group: src.group,
      icon: src.icon,
      prompt: src.prompt,
      source: src.source === 'wiki' ? src.cat : 'Wikidata',
      items,
    };
    await writeFile(file, JSON.stringify(pack));
    console.log(`${label}: ${items.length} pytań${pagesSeen ? ` (z ${pagesSeen} stron)` : ''}`);
    built++;
  } catch (e) {
    console.log(`${label}: BŁĄD ${String(e).slice(0, 100)}`);
    skipped.push(`${src.name} (błąd)`);
  }
  await sleep(700);
}

// Przebuduj indeks na podstawie wszystkich plików.
const index = [];
for (const f of (await readdir(OUT)).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  try {
    const pack = JSON.parse(await readFile(`${OUT}/${f}`, 'utf8'));
    if (!pack.items?.length) continue;
    index.push({ id: pack.id, name: pack.name, group: pack.group, icon: pack.icon, prompt: pack.prompt, count: pack.items.length });
  } catch {}
}
const order = ['Motoryzacja', 'Kuchnia', 'Przyroda', 'Geografia', 'Historia', 'Muzyka', 'Film i TV', 'Technika', 'Nauka', 'Marki', 'Zabawa', 'Inne'];
index.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, 'pl'));
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/index.json`, JSON.stringify({ generated: new Date().toISOString(), packs: index }));

console.log(`\nZbudowano ${built} nowych. Razem ${index.length} kategorii, ${index.reduce((s, p) => s + p.count, 0)} pytań.`);
if (skipped.length) console.log('Pominięte: ' + skipped.join(', '));
