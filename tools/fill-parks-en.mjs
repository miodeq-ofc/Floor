// Parki: odpowiedzi po polsku, zdjecia z angielskich artykulu (tam infobox
// zwykle jest krajobrazem, nie herbem). Tylko znane parki i lokalne kopie.
import fs from 'node:fs/promises';
import path from 'node:path';

const UA = 'TheFloor/1.0 (quiz; local)';
const API = 'https://en.wikipedia.org/w/api.php';
const BAD = /(logo|logotyp|icon|ikona|coat|herb|crest|flag|flaga|map|mapa|distribution|range|locator|diagram|chart|wykres|plan\b|illustration|drawing|rysunek|plate|leaf|liść|flower|kwiat|fruit|owoc|seed|nasion|bark|kora|gall|insect|owad|portrait|portret|screenshot|table|tabela|menu|packshot|cover|poster|plakat|label|etykieta|dealer|showroom)/i;
const PHOTO = /\.(jpe?g|png|webp)$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fileOf = (url) => decodeURIComponent(String(url || '').split('?')[0].split('/').pop() || '');

const entries = [
  ['Park Narodowy Canyonlands', 'Canyonlands National Park'],
  ['Park Narodowy Capitol Reef', 'Capitol Reef National Park'],
  ['Park Narodowy Sekwoi', 'Sequoia National Park'],
  ['Park Narodowy Kings Canyon', 'Kings Canyon National Park'],
  ['Park Narodowy Olympic', 'Olympic National Park'],
  ['Park Narodowy North Cascades', 'North Cascades National Park'],
  ['Park Narodowy Shenandoah', 'Shenandoah National Park'],
  ['Park Narodowy Great Smoky Mountains', 'Great Smoky Mountains National Park'],
  ['Park Narodowy Biscayne', 'Biscayne National Park'],
  ['Park Narodowy Big Bend', 'Big Bend National Park'],
  ['Park Narodowy White Sands', 'White Sands National Park'],
  ['Park Narodowy Wind Cave', 'Wind Cave National Park'],
  ['Park Narodowy Theodore Roosevelt', 'Theodore Roosevelt National Park'],
  ['Park Narodowy Voyageurs', 'Voyageurs National Park'],
  ['Park Narodowy Isle Royale', 'Isle Royale National Park'],
  ['Park Narodowy Mammoth Cave', 'Mammoth Cave National Park'],
  ['Park Narodowy Hot Springs', 'Hot Springs National Park'],
  ['Park Narodowy Congaree', 'Congaree National Park'],
  ['Park Narodowy Yoho', 'Yoho National Park'],
  ['Park Narodowy Kootenay', 'Kootenay National Park'],
  ['Park Narodowy Elk Island', 'Elk Island National Park'],
  ['Park Narodowy Kilimandżaro', 'Kilimanjaro National Park'],
  ['Park Narodowy Amboseli', 'Amboseli National Park'],
  ['Park Narodowy Nairobi', 'Nairobi National Park'],
  ['Park Narodowy Tsavo', 'Tsavo East National Park'],
  ['Park Narodowy Chobe', 'Chobe National Park'],
  ['Park Narodowy Okavango', 'Okavango Delta'],
  ['Park Narodowy Virunga', 'Virunga National Park'],
  ['Park Narodowy Bwindi', 'Bwindi Impenetrable National Park'],
  ['Park Narodowy Torres del Paine', 'Torres del Paine National Park'],
  ['Park Narodowy Iguazú', 'Iguazú National Park'],
  ['Park Narodowy Pantanal', 'Pantanal'],
  ['Park Narodowy Jezior Plitwickich', 'Plitvice Lakes National Park'],
  ['Park Narodowy Durmitor', 'Durmitor National Park'],
  ['Park Narodowy Dolomitów', 'Dolomiti Bellunesi National Park'],
  ['Park Narodowy Gran Paradiso', 'Gran Paradiso National Park'],
  ['Park Narodowy Abruzzo', 'Abruzzo, Lazio and Molise National Park'],
  ['Park Narodowy Ordesa y Monte Perdido', 'Ordesa y Monte Perdido National Park'],
  ['Park Narodowy Picos de Europa', 'Picos de Europa National Park'],
  ['Park Narodowy Doñana', 'Doñana National Park'],
  ['Park Narodowy Teide', 'Teide National Park'],
  ['Park Narodowy Peneda-Gerês', 'Peneda-Gerês National Park'],
  ['Park Narodowy Berchtesgaden', 'Berchtesgaden National Park'],
  ['Park Narodowy Lasu Bawarskiego', 'Bavarian Forest National Park'],
  ['Park Narodowy Göreme', 'Göreme Historical National Park'],
  ['Park Narodowy Zhangjiajie', 'Zhangjiajie National Forest Park'],
  ['Park Narodowy Jiuzhaigou', 'Jiuzhaigou Valley'],
  ['Park Narodowy Huangshan', 'Huangshan'],
  ['Park Narodowy Fuji-Hakone-Izu', 'Fuji-Hakone-Izu National Park'],
  ['Park Narodowy Nikko', 'Nikkō National Park'],
  ['Park Narodowy Komodo', 'Komodo National Park'],
  ['Park Narodowy Lorentz', 'Lorentz National Park'],
  ['Park Narodowy Kakadu', 'Kakadu National Park'],
  ['Park Narodowy Uluru-Kata Tjuta', 'Uluru-Kata Tjuta National Park'],
  ['Park Narodowy Fiordland', 'Fiordland National Park'],
  ['Park Narodowy Tongariro', 'Tongariro National Park'],
  ['Park Narodowy Abel Tasman', 'Abel Tasman National Park'],
  ['Park Narodowy Þingvellir', 'Þingvellir National Park'],
  ['Park Narodowy Jotunheimen', 'Jotunheimen National Park'],
  ['Park Narodowy Sarek', 'Sarek National Park'],
  ['Park Narodowy Abisko', 'Abisko National Park'],
];

async function api(params, tries = 4) {
  const u = new URL(API);
  Object.entries({ format: 'json', formatversion: '2', redirects: '1', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 18000);
    try {
      const res = await fetch(u, { headers: { 'user-agent': UA }, signal: ctrl.signal });
      const text = await res.text();
      clearTimeout(timer);
      if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
      if (res.status === 429) await sleep(4000 + i * 2500);
    } catch {
      clearTimeout(timer);
      await sleep(1200 + i * 900);
    }
  }
  return {};
}

function usable(url) {
  const f = fileOf(url);
  return PHOTO.test(f) && !BAD.test(f) && !/\.png$/i.test(f);
}

async function pageImages(titles) {
  const found = new Map();
  for (let i = 0; i < titles.length; i += 45) {
    const batch = titles.slice(i, i + 45);
    const data = await api({ action: 'query', titles: batch.join('|'), prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '1200' });
    const normalized = new Map((data?.query?.normalized || []).map((x) => [x.from, x.to]));
    const redirects = new Map((data?.query?.redirects || []).map((x) => [x.from, x.to]));
    const pages = new Map(Object.values(data?.query?.pages || {}).map((p) => [p.title, p]));
    for (const title of batch) {
      let key = normalized.get(title) || title;
      key = redirects.get(key) || key;
      const url = pages.get(key)?.thumbnail?.source?.split('?')[0];
      if (url && usable(url)) found.set(title, url);
    }
    await sleep(800);
  }
  return found;
}

async function download(id, answer, url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!/image\//i.test(type)) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000) return '';
    const dir = 'assets/packs/' + id;
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, slug(answer) + '.jpg');
    await fs.writeFile(dest, buf);
    return dest;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

const packPath = 'data/packs/parki-narodowe.json';
const pack = JSON.parse(await fs.readFile(packPath, 'utf8'));
const have = new Set(pack.items.map((x) => x.a));
const pending = entries.filter(([answer]) => !have.has(answer));
const images = await pageImages(pending.map(([, english]) => english));
for (const [answer, english] of pending) {
  const source = images.get(english);
  if (!source) continue;
  const local = await download('parki-narodowe', answer, source);
  if (!local) continue;
  pack.items.push({ a: answer, img: local });
  have.add(answer);
  if (pack.items.length >= 100) break;
}
await fs.writeFile(packPath, JSON.stringify({ ...pack, source: 'rozpoznawalne parki; lokalne zdjęcia z artykułów' }, null, 2) + '\n');
console.log('parki', pack.items.length, 'nowe', pack.items.length - 35);
