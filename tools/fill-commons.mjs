// Uzupełnia zdjęcia przez Commons, nie przez przeciążone API Wikipedii.
// Nazwy są ręcznie wybrane; wynik wyszukiwania jest filtrowany, a nie brany
// bez sprawdzenia.
import fs from 'node:fs/promises';
import { imageLooksUsable } from '../assets/js/common.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'TheFloor/1.0 (quiz; local)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = /(logo|logotyp|icon|ikona|symbol|coat|herb|crest|flag|flaga|map|mapa|distribution|range|locator|diagram|chart|wykres|plan\b|illustration|illustrac|drawing|rysunek|köhler|sturm|plate|tablica|leaf|liść|leaves|flower|kwiat|fruit|owoc|seed|nasion|cone|szysz|bark|kora|gall|insect|owad|portrait|portret|screenshot|zrzut|table|tabela|menu|packshot|box|cover|poster|plakat|label|etykieta|dealer|dealership|showroom|salon|starmotors|conference|tradeshow)/i;
const PHOTO = /\.(jpe?g|png|webp)$/i;

async function api(params, tries = 4) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', redirects: '1', ...params })) {
    url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 18000);
    let res;
    let text;
    try {
      res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
      text = await res.text();
    } catch {
      clearTimeout(timer);
      await sleep(1200 + attempt * 1000);
      continue;
    }
    clearTimeout(timer);
    if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
    if (res.status === 429) {
      await sleep(2500 + attempt * 2000);
      continue;
    }
    return {};
  }
  return {};
}

function clean(url) {
  return String(url || '').split('?')[0].replace(/^https?:\/\/thumb\.wikimedia\.org\//i, 'https://upload.wikimedia.org/');
}

function fileOf(url) {
  return decodeURIComponent(String(url || '').split('?')[0].split('/').pop() || '');
}

function slug(title) {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Obrazy trzymamy w repo. Dzięki temu brak internetu nie zamienia pytania
// w pusty kafelek, a Wikimedia nie jest pytana w trakcie rundy.
async function downloadLocal(id, title, url) {
  if (!url || url.startsWith('assets/')) return url;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return url;
    const type = res.headers.get('content-type') || '';
    if (!/image\//i.test(type) && !PHOTO.test(fileOf(url))) return url;
    const ext = /png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 2000) return url;
    const dir = 'assets/packs/' + id;
    await fs.mkdir(dir, { recursive: true });
    const file = dir + '/' + slug(title) + '.' + ext;
    await fs.writeFile(file, buffer);
    return file;
  } catch {
    return url;
  }
}

async function searchPhoto(title, kind) {
  const suffix = kind === 'pasta' ? 'pasta' : kind === 'park' ? 'park landscape' : kind === 'car' ? 'car automobile' : 'tree';
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: title + ' ' + suffix,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '1000',
  });
  const pages = Object.values(data?.query?.pages || {});
  for (const page of pages) {
    const url = clean(page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || '');
    const file = fileOf(url);
    if (!PHOTO.test(file) || BAD.test(file)) continue;
    // Herby i mapy parków bardzo często są zapisane jako .png bez słowa
    // „logo” w nazwie — dla krajobrazów wystarczy JPEG.
    if (kind === 'park' && /\.png$/i.test(file)) continue;
    return url;
  }
  return '';
}

async function fill(id, name, icon, prompt, group, titles, kind) {
  const path = 'data/packs/' + id + '.json';
  let old = {};
  try {
    old = JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {}
  const oldMap = new Map((old.items || []).map((x) => [x.a, x.img]));
  const known = new Map();
  // Zachowujemy także pozycje spoza nowej listy, jeśli mają sensowne zdjęcie.
  for (const [answer, image] of oldMap) {
    if (imageLooksUsable({ id }, image)) known.set(answer, image);
  }
  let cursor = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < titles.length) {
      const title = titles[cursor++];
      const existing = oldMap.get(title);
      if (existing && imageLooksUsable({ id }, existing)) {
        known.set(title, existing);
        continue;
      }
      try {
        const image = await searchPhoto(title, kind);
        if (image && imageLooksUsable({ id }, image)) {
          const local = await downloadLocal(id, title, image);
          if (local) known.set(title, local);
        }
      } catch {}
      await sleep(180);
    }
  });
  await Promise.all(workers);
  const items = [...known.entries()].map(([a, img]) => ({ a, img }));
  const seen = new Set();
  const unique = items.filter((x) => {
    const key = x.a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!unique.length) throw new Error(id + ': brak zdjęć');
  await fs.writeFile(path, JSON.stringify({ items: unique, name, group, icon, prompt, source: 'Commons — ręczna lista, zdjęcia lokalne' }, null, 2) + '\n');
  console.log(id, unique.length);
  return unique.length;
}

const pasta = [
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
  'Cavatappi', 'Gigli', 'Gramigna', 'Sagnarelli', 'Stringozzi', 'Cencioni',
  'Nodi marini', 'Serpentini', 'Spaccatelle', 'Penne lisce', 'Mezze rigatoni',
  'Fusilli bucati', 'Risoni', 'Maccheroni', 'Cavatappi',
];

const cars = [
  'Volkswagen', 'Skoda', 'Ford', 'Opel', 'Renault', 'Fiat', 'Peugeot',
  'Citroën', 'BMW', 'Audi', 'Kia', 'Hyundai', 'Dacia', 'SEAT', 'Volvo',
  'Honda', 'Mazda', 'Suzuki', 'Tesla', 'Cupra', 'Jeep', 'Mitsubishi',
  'Lexus', 'Mini', 'Land Rover', 'Porsche', 'Alfa Romeo', 'Aston Martin',
  'Toyota', 'Mercedes-Benz', 'Nissan', 'Chevrolet', 'Dodge', 'Chrysler',
  'Cadillac', 'Jaguar', 'Ferrari', 'Lamborghini', 'Maserati', 'Bentley',
  'Rolls-Royce', 'Bugatti', 'Subaru', 'Infiniti', 'Acura', 'Genesis',
  'Lancia', 'Smart', 'Saab', 'Rover', 'MG', 'Polestar', 'Rivian', 'Tata',
  'Mahindra', 'Proton', 'Holden', 'Pontiac', 'Buick', 'GMC', 'Oldsmobile',
  'Plymouth', 'Trabant', 'Wartburg', 'FSO', 'Warszawa', 'Syrena', 'Żuk',
  'Tarpan', 'Honker', 'Iveco', 'Scania', 'MAN', 'DAF', 'Kamaz', 'Isuzu',
  'Daihatsu', 'Lada', 'Moskwicz', 'GAZ', 'UAZ', 'Zastava', 'Yugo',
  'Ferrari', 'Lamborghini', 'Maserati', 'Abarth', 'Alpine', 'DS Automobiles',
  'Vauxhall', 'Lotus', 'Morgan', 'Caterham', 'MG', 'Saab', 'Rover',
  'SsangYong', 'BYD', 'Polestar',
];

const parks = [
  'Białowieski Park Narodowy', 'Biebrzański Park Narodowy',
  'Bieszczadzki Park Narodowy', 'Babiogórski Park Narodowy',
  'Gorczański Park Narodowy', 'Kampinoski Park Narodowy',
  'Karkonoski Park Narodowy', 'Magurski Park Narodowy',
  'Narwiański Park Narodowy', 'Ojcowski Park Narodowy',
  'Pieniński Park Narodowy', 'Poleski Park Narodowy',
  'Roztoczański Park Narodowy', 'Słowiński Park Narodowy',
  'Świętokrzyski Park Narodowy', 'Tatrzański Park Narodowy',
  'Park Narodowy Ujście Warty', 'Wielkopolski Park Narodowy',
  'Wigierski Park Narodowy', 'Woliński Park Narodowy',
  'Drawieński Park Narodowy', 'Park Narodowy Gór Stołowych',
  'Park Narodowy Yellowstone', 'Park Narodowy Yosemite',
  'Park Narodowy Wielkiego Kanionu', 'Park Narodowy Serengeti',
  'Park Narodowy Krugera', 'Park Narodowy Banff', 'Park Narodowy Jasper',
  'Park Narodowy Glacier', 'Park Narodowy Gór Skalistych',
  'Park Narodowy Zion', 'Park Narodowy Bryce Canyon', 'Park Narodowy Arches',
  'Park Narodowy Everglades', 'Park Narodowy Redwood',
  'Park Narodowy Doliny Śmierci', 'Park Narodowy Joshua Tree',
  'Park Narodowy Acadia', 'Park Narodowy Olympic',
  'Park Narodowy Mount Rainier', 'Park Narodowy Great Smoky Mountains',
  'Park Narodowy Grand Teton', 'Park Narodowy Mesa Verde',
  'Park Narodowy Carlsbad Caverns', 'Park Narodowy Badlands',
  'Park Narodowy Skamieniałego Lasu', 'Park Narodowy Haleakalā',
  'Park Narodowy Wulkany Hawaiʻi', 'Park Narodowy Torres del Paine',
  'Park Narodowy Los Glaciares', 'Park Narodowy Iguazú',
  'Park Narodowy Jezior Plitwickich', 'Park Narodowy Krka',
  'Park Narodowy Paklenica', 'Park Narodowy Dolomiti Bellunesi',
  'Park Narodowy Gran Paradiso', 'Park Narodowy Abruzzo',
  'Park Narodowy Ordesa y Monte Perdido', 'Szwajcarski Park Narodowy',
  'Park Narodowy Berchtesgaden', 'Park Narodowy Saskiej Szwajcarii',
  'Park Narodowy Lasu Bawarskiego', 'Park Narodowy Hortobágy',
  'Park Narodowy Picos de Europa', 'Park Narodowy Doñana',
  'Park Narodowy Teide', 'Park Narodowy Peneda-Gerês',
  'Park Narodowy Göreme', 'Park Narodowy Zhangjiajie',
  'Park Narodowy Jiuzhaigou', 'Park Narodowy Huangshan',
  'Park Narodowy Fuji-Hakone-Izu', 'Park Narodowy Nikko',
  'Park Narodowy Komodo', 'Park Narodowy Lorentz',
  'Park Narodowy Kakadu', 'Park Narodowy Uluru-Kata Tjuta',
  'Park Narodowy Fiordland', 'Park Narodowy Tongariro',
  'Park Narodowy Abel Tasman', 'Park Narodowy Kilimandżaro',
  'Park Narodowy Amboseli', 'Park Narodowy Nairobi',
  'Park Narodowy Etosha', 'Park Narodowy Chobe',
  'Park Narodowy Okavango', 'Park Narodowy Virunga',
  'Park Narodowy Bwindi', 'Park Narodowy Þingvellir',
  'Park Narodowy Jotunheimen', 'Park Narodowy Rondane',
  'Park Narodowy Sarek', 'Park Narodowy Abisko',
];

(async () => {
  const only = process.argv[2] || 'all';
  if (only === 'all' || only === 'makaron') await fill('makaron', 'Makaron', '🍝', 'Jaki to makaron?', 'Kuchnia', pasta, 'pasta');
  if (only === 'all' || only === 'marki') await fill('marki-samochodow', 'Marki samochodów', '🚗', 'Jaka to marka samochodu?', 'Motoryzacja', cars, 'car');
  if (only === 'all' || only === 'parki') await fill('parki-narodowe', 'Parki narodowe', '🌲', 'Jaki to park narodowy?', 'Geografia', parks, 'park');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
