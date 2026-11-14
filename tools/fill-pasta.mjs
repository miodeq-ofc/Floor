// Makaron: dobieramy zdjęcie konkretnego kształtu, a nie losową grafikę.
// Obrazki zapisujemy lokalnie, więc ekran nie czeka na sieć i nie pokazuje
// pustego pola, gdy Flickr/Wikimedia chwilowo nie odpowiada.
import fs from 'node:fs/promises';
import path from 'node:path';
import { imageLooksUsable } from '../assets/js/common.js';

const UA = 'TheFloor/1.0 (quiz; local)';
const BAD = /(logo|logotyp|icon|ikona|symbol|map|mapa|diagram|chart|drawing|rysunek|menu|packshot|label|etykieta|screenshot|poster|plakat)/i;
const titles = [
  'Spaghetti', 'Penne', 'Penne rigate', 'Rigatoni', 'Fusilli', 'Farfalle',
  'Tagliatelle', 'Pappardelle', 'Linguine', 'Fettuccine', 'Bucatini',
  'Vermicelli', 'Capellini', 'Lasagne', 'Cannelloni', 'Manicotti',
  'Tortellini', 'Tortelloni', 'Ravioli', 'Agnolotti', 'Cappelletti',
  'Conchiglie', 'Orecchiette', 'Cavatelli', 'Gemelli', 'Strozzapreti',
  'Garganelli', 'Trofie', 'Ziti', 'Mostaccioli', 'Radiatori', 'Rotini',
  'Rotelle', 'Ditalini', 'Anelli', 'Anellini', 'Lumache', 'Maltagliati',
  'Mezze penne', 'Pennette', 'Pipe rigate', 'Tortiglioni', 'Trenette',
  'Tagliolini', 'Spaghettini', 'Fedelini', 'Mafaldine', 'Paccheri',
  'Calamarata', 'Casarecce', 'Cellentani', 'Creste di gallo', 'Fregola',
  'Gnocchi', 'Gnocchetti', 'Malloreddus', 'Pici', 'Testaroli', 'Passatelli',
  'Quadrettini', 'Ricciolini', 'Stelline', 'Tempesta', 'Tripoline',
  'Trottole', 'Zitoni', 'Makaron jajeczny', 'Makaron ryżowy', 'Makaron soba',
  'Makaron udon', 'Makaron ramen', 'Makaron szklany', 'Makaron kukurydziany',
  'Makaron bezglutenowy', 'Makaron pełnoziarnisty', 'Makaron świderki',
  'Makaron muszelki', 'Makaron kokardki', 'Makaron rurki', 'Makaron wstążki',
  'Makaron kolanka', 'Makaron nitki', 'Makaron gniazda',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = 'assets/packs/makaron';
await fs.mkdir(dir, { recursive: true });

let old = { items: [] };
try {
  old = JSON.parse(await fs.readFile('data/packs/makaron.json', 'utf8'));
} catch {}
const oldMap = new Map((old.items || []).map((x) => [x.a, x.img]));
const seenTitles = new Set();
let cursor = 0;
const found = new Map();

async function search(title) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 16000);
  try {
    const url = 'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(title + ' pasta') + '&page_size=12';
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
    if (!res.ok) return '';
    const data = await res.json();
    for (const item of data.results || []) {
      const url = item.url || item.thumbnail || '';
      if (!/^https:\/\//i.test(url)) continue;
      const low = (item.title || '') + ' ' + url;
      if (BAD.test(low)) continue;
      if (!/\.(jpe?g|png|webp)(?:\?|$)/i.test(url) && !/upload\.wikimedia\.org|staticflickr/i.test(url)) continue;
      return url;
    }
  } catch {}
  finally {
    clearTimeout(timer);
  }
  return '';
}

async function download(title, url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    let ext = /png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg';
    if (!/image\//i.test(type) && !/\.(jpe?g|png|webp)/i.test(url)) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return '';
    const safe = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const dest = path.join(dir, safe + '.' + ext);
    await fs.writeFile(dest, buf);
    return dest;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function worker() {
  while (cursor < titles.length) {
    const title = titles[cursor++];
    if (seenTitles.has(title)) continue;
    seenTitles.add(title);
    const oldImg = oldMap.get(title);
    if (oldImg && imageLooksUsable({ id: 'makaron' }, oldImg)) {
      found.set(title, oldImg);
      continue;
    }
    const url = await search(title);
    if (!url) continue;
    const local = await download(title, url);
    if (local) found.set(title, local);
    await sleep(100);
  }
}

await Promise.all(Array.from({ length: 3 }, worker));
const items = titles.filter((title) => found.has(title)).map((title) => ({ a: title, img: found.get(title) }));
await fs.writeFile('data/packs/makaron.json', JSON.stringify({ items, name: 'Makaron', group: 'Kuchnia', icon: '🍝', prompt: 'Jaki to makaron?', source: 'Openverse / lokalne zdjęcia' }, null, 2) + '\n');
console.log('makaron', items.length);
