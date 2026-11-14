// Poprawki jakości danych dla planszy:
// - usuwa pytania o konkretne modele telefonów / podzespoły,
// - przebudowuje rasy psów z filtrm rozpoznawalności (liczba wersji językowych),
// - przebudowuje logotypy na znane marki i odrzuca szerokie wordmarki,
// - porządkuje kategorię mięs do normalnych cuts i wędlin.
// Uruchomienie: node tools/refine-packs.mjs
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';

const OUT = 'data/packs';
const UA = 'TheFloorQuizBuilder/1.0 (https://github.com/miodeq-ofc/Floor)';
const WIKI = 'https://pl.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WDQS = 'https://query.wikidata.org/sparql';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/json, application/sparql-results+json' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (i + 1));
        continue;
      }
      throw new Error('HTTP ' + res.status);
    } catch (error) {
      if (i === tries - 1) throw error;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error('limit');
}

async function wiki(params) {
  const url = new URL(WIKI);
  for (const [key, value] of Object.entries({ format: 'json', origin: '*', ...params })) {
    url.searchParams.set(key, value);
  }
  return fetchJson(url);
}

const clean = (title) => title.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
const badDogTitle = (title) =>
  /^(Rasy psów|Wykaz ras psów agresywnych)$/i.test(title) ||
  /^(Lista|Grupy ras|Zobacz|Historia|Przypisy)\b/i.test(title);

async function dogPack() {
  const titles = [];
  let cont = null;
  for (let round = 0; round < 6; round++) {
    const data = await wiki({
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Kategoria:Rasy psów',
      cmtype: 'page',
      cmlimit: '500',
      ...(cont || {}),
    });
    titles.push(...(data?.query?.categorymembers || []).map((m) => m.title));
    cont = data?.continue?.cmcontinue ? { cmcontinue: data.continue.cmcontinue } : null;
    if (!cont) break;
    await sleep(250);
  }

  const pages = [];
  for (let i = 0; i < titles.length; i += 10) {
    const batch = titles.slice(i, i + 10);
    const data = await wiki({
      action: 'query',
      titles: batch.join('|'),
      prop: 'pageimages|langlinks',
      piprop: 'thumbnail',
      pithumbsize: '800',
      lllimit: '500',
      redirects: '1',
    });
    pages.push(...Object.values(data?.query?.pages || {}));
    await sleep(160);
  }

  const items = [];
  const seen = new Set();
  pages
    .map((page) => ({ page, links: page.langlinks?.length || 0 }))
    .filter(({ page, links }) => links >= 25 && page.thumbnail?.source && !page.missing && !badDogTitle(page.title))
    .sort((a, b) => b.links - a.links)
    .forEach(({ page }) => {
      const answer = clean(page.title);
      const key = answer.toLowerCase();
      if (!answer || seen.has(key)) return;
      seen.add(key);
      items.push({ a: answer, img: page.thumbnail.source.split('?')[0] });
    });

  return {
    id: 'rasy-psow',
    name: 'Rasy psów',
    group: 'Przyroda',
    icon: '🐕',
    prompt: 'Jaka to rasa psa?',
    source: 'Kategoria:Rasy psów (filtr rozpoznawalności)',
    items: items.slice(0, 150),
  };
}

async function logoPack() {
  const sparql = `SELECT ?item ?itemLabel ?logo ?links WHERE {
    ?item wdt:P31/wdt:P279* wd:Q431289 .
    ?item wdt:P154 ?logo .
    ?item wikibase:sitelinks ?links .
    FILTER(?links >= 20)
    ?item rdfs:label ?plLabel FILTER(LANG(?plLabel) = "pl")
    SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
  } ORDER BY DESC(?links) LIMIT 350`;
  const url = new URL(WDQS);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', sparql);
  const data = await fetchJson(url);
  const byItem = new Map();
  for (const row of data?.results?.bindings || []) {
    const item = row.item?.value;
    const label = (row.itemLabel?.value || '').trim();
    const logo = row.logo?.value;
    if (!item || !label || !logo || /^Q\d+$/.test(label)) continue;
    if (!byItem.has(item)) byItem.set(item, { label, logo, links: Number(row.links?.value) || 0 });
  }

  const seenLabels = new Set();
  const candidates = [];
  for (const entry of byItem.values()) {
    const key = entry.label.toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    candidates.push(entry);
  }

  const fileOf = (raw) => {
    try {
      const parsed = new URL(raw);
      return decodeURIComponent(parsed.pathname.split('/').pop() || '');
    } catch {
      return '';
    }
  };

  const info = new Map();
  for (let i = 0; i < candidates.length; i += 50) {
    const batch = candidates.slice(i, i + 50).map((c) => 'File:' + fileOf(c.logo));
    const url = new URL(COMMONS);
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', batch.join('|'));
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'size|url');
    url.searchParams.set('iiurlwidth', '800');
    const dims = await fetchJson(url);
    for (const page of Object.values(dims?.query?.pages || {})) {
      const ii = page.imageinfo?.[0];
      if (ii?.width && ii?.height) info.set(page.title, ii);
    }
    await sleep(220);
  }

  const items = [];
  for (const entry of candidates) {
    const file = fileOf(entry.logo);
    if (!/\.(svg|png)$/i.test(file)) continue;
    const ii = info.get('File:' + file);
    if (!ii) continue;
    const ratio = ii.width / ii.height;
    if (ratio < 0.6 || ratio > 1.6) continue;
    const img = ii.thumburl || ii.url;
    if (!img) continue;
    items.push({ a: entry.label, img });
    if (items.length >= 140) break;
  }

  return {
    id: 'loga-firm',
    name: 'Logotypy znanych marek',
    group: 'Marki',
    icon: '🏷️',
    prompt: 'Czyj to logotyp?',
    source: 'Wikidata P154 (znane marki, filtr proporcji)',
    items,
  };
}

const MEAT_LIST = [
  ['Boczek', 'Boczek'],
  ['Polędwica', 'Polędwica'],
  ['Polędwica wołowa', 'Polędwica wołowa'],
  ['Polędwiczka', 'Polędwiczka wieprzowa'],
  ['Schab', 'Schab'],
  ['Karkówka', 'Karkówka'],
  ['Łopatka', 'Łopatka (mięso)'],
  ['Szynka', 'Szynka'],
  ['Golonka', 'Golonka'],
  ['Żeberka', 'Żeberka'],
  ['Wieprzowina', 'Wieprzowina'],
  ['Wołowina', 'Wołowina'],
  ['Cielęcina', 'Cielęcina'],
  ['Baranina', 'Baranina'],
  ['Jagnięcina', 'Jagnięcina'],
  ['Dziczyzna', 'Dziczyzna'],
  ['Drób', 'Mięso drobiowe'],
  ['Mięso mielone', 'Mięso mielone'],
  ['Filet', 'Filet'],
  ['Stek', 'Stek'],
  ['Antrykot', 'Antrykot'],
  ['Mostek', 'Mostek (mięso)'],
  ['Kiełbasa', 'Kiełbasa'],
  ['Salami', 'Salami'],
  ['Bekon', 'Bekon'],
  ['Kabanos', 'Kabanos'],
  ['Kaszanka', 'Kaszanka'],
  ['Salceson', 'Salceson'],
  ['Parówki', 'Parówki'],
  ['Mortadela', 'Mortadela'],
  ['Prosciutto', 'Prosciutto'],
  ['Chorizo', 'Chorizo'],
  ['Tatar', 'Tatar'],
  ['Carpaccio', 'Carpaccio'],
  ['Wątróbka', 'Wątróbka'],
  ['Flaki', 'Flaki'],
];

async function meatPack(existing) {
  const existingByAnswer = new Map((existing?.items || []).map((item) => [item.a.toLowerCase(), item]));
  const found = new Map();
  for (const [answer, page] of MEAT_LIST) {
    const old = existingByAnswer.get(answer.toLowerCase());
    if (old?.img) found.set(answer, old);
  }
  const missing = MEAT_LIST.filter(([answer]) => !found.has(answer));
  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    const data = await wiki({
      action: 'query',
      titles: batch.map(([, page]) => page).join('|'),
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '800',
      redirects: '1',
    });
    const pages = Object.values(data?.query?.pages || {});
    for (const [answer, page] of batch) {
      const match =
        pages.find((p) => p.title.toLowerCase() === page.toLowerCase()) ||
        pages.find((p) => p.title.toLowerCase() === answer.toLowerCase());
      if (match?.thumbnail?.source) {
        found.set(answer, { a: answer, img: match.thumbnail.source.split('?')[0] });
      }
    }
    await sleep(200);
  }

  const items = [];
  const seenImages = new Set();
  for (const [answer] of MEAT_LIST) {
    const item = found.get(answer);
    if (!item) continue;
    if (seenImages.has(item.img)) continue;
    seenImages.add(item.img);
    items.push({ a: answer, img: item.img });
  }

  return {
    id: 'miesa',
    name: 'Mięsa i wędliny',
    group: 'Kuchnia',
    icon: '🥩',
    prompt: 'Jaki to rodzaj mięsa lub wędliny?',
    source: 'Wikipedia (kuratorowana lista)',
    items,
  };
}

const REMOVE = ['smartfony', 'telefony', 'procesory', 'karty-graficzne'];
const oldMeat = JSON.parse(await readFile(`${OUT}/miesa.json`, 'utf8').catch(() => '{}'));
const oldMeatPack = oldMeat?.items ? oldMeat : null;

const packs = [await dogPack(), await logoPack(), await meatPack(oldMeatPack)];

for (const pack of packs) {
  if (pack.items.length < 8) {
    console.log('POMINIĘTO (za mało pozycji): ' + pack.name + ' (' + pack.items.length + ')');
    continue;
  }
  await writeFile(`${OUT}/${pack.id}.json`, JSON.stringify(pack));
  console.log(pack.name + ': ' + pack.items.length + ' pytań');
}

for (const id of REMOVE) {
  try {
    await unlink(`${OUT}/${id}.json`);
    console.log('Usunięto kategorię: ' + id);
  } catch {}
}

const order = ['Motoryzacja', 'Kuchnia', 'Przyroda', 'Geografia', 'Historia', 'Muzyka', 'Film i TV', 'Technika', 'Nauka', 'Marki', 'Zabawa', 'Inne'];
const index = [];
for (const file of (await readdir(OUT)).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  try {
    const pack = JSON.parse(await readFile(`${OUT}/${file}`, 'utf8'));
    if (!pack.items?.length) continue;
    if (REMOVE.includes(pack.id)) continue;
    index.push({
      id: pack.id,
      name: pack.name,
      group: pack.group,
      icon: pack.icon,
      prompt: pack.prompt,
      count: pack.items.length,
    });
  } catch {}
}
index.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, 'pl'));
await writeFile(`${OUT}/index.json`, JSON.stringify({ generated: new Date().toISOString(), packs: index }));
console.log('\nRazem ' + index.length + ' kategorii, ' + index.reduce((sum, p) => sum + p.count, 0) + ' pytań.');
