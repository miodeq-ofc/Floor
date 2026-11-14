// Uzupełnienie drzew o pospolite gatunki. Zdjęcia lądują lokalnie, żeby
// kafelek nie zniknął, gdy Wikimedia/Flickr nie odpowie w trakcie rundy.
import fs from 'node:fs/promises';
import path from 'node:path';
import { imageLooksUsable } from '../assets/js/common.js';

const UA = 'TheFloor/1.0 (quiz; local)';
const BAD = /(logo|icon|map|diagram|drawing|rysunek|illustration|flower|kwiat|fruit|owoc|leaf|liść|seed|nasion|bark|kora|plate|herbarium)/i;
const titles = [
  'Sosna górska',
  'Wierzba płacząca',
  'Jabłoń domowa',
  'Grusza polna',
  'Wiśnia ptasia',
  'Orzech laskowy',
  'Pigwa pospolita',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = 'assets/packs/drzewa';
await fs.mkdir(dir, { recursive: true });
const pack = JSON.parse(await fs.readFile('data/packs/drzewa.json', 'utf8'));
const have = new Set(pack.items.map((x) => x.a));

async function search(title) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 16000);
  try {
    const res = await fetch('https://api.openverse.org/v1/images/?q=' + encodeURIComponent(title + ' tree') + '&page_size=12', {
      headers: { 'user-agent': UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    for (const item of data.results || []) {
      const url = item.url || item.thumbnail || '';
      if (!/^https:\/\//i.test(url)) continue;
      if (BAD.test((item.title || '') + ' ' + url)) continue;
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
    if (!/image\//i.test(type) && !/\.(jpe?g|png|webp)/i.test(url)) return '';
    const ext = /png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg';
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

for (const title of titles) {
  if (have.has(title)) continue;
  const url = await search(title);
  if (!url) continue;
  const local = await download(title, url);
  if (!local || !imageLooksUsable({ id: 'drzewa' }, local)) continue;
  pack.items.push({ a: title, img: local });
  have.add(title);
  await sleep(150);
}
await fs.writeFile('data/packs/drzewa.json', JSON.stringify(pack, null, 2) + '\n');
console.log('drzewa', pack.items.length);
