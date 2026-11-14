// Jednorazowe, kontrolowane uzupełnienie najsłabszych paczek.
// Nie kopiujemy całych kategorii Wikipedii: bierzemy ręcznie wybrane,
// rozpoznawalne nazwy i przypisujemy im zdjęcie z artykułu.
import fs from 'node:fs/promises';

const API = 'https://pl.wikipedia.org/w/api.php';
const UA = 'TheFloor/1.0 (quiz; local)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const trees = [
  'Dąb szypułkowy', 'Dąb bezszypułkowy', 'Dąb czerwony', 'Buk zwyczajny',
  'Brzoza brodawkowata', 'Brzoza omszona', 'Sosna zwyczajna', 'Sosna czarna',
  'Sosna limba', 'Sosna wejmutka', 'Świerk pospolity', 'Świerk kłujący',
  'Świerk serbski', 'Jodła pospolita', 'Modrzew europejski', 'Klon zwyczajny',
  'Klon jawor', 'Klon polny', 'Klon srebrzysty', 'Jesion wyniosły',
  'Lipa drobnolistna', 'Lipa szerokolistna', 'Wiąz szypułkowy', 'Wiąz górski',
  'Olsza czarna', 'Olsza szara', 'Grab zwyczajny', 'Topola biała',
  'Topola czarna', 'Topola osika', 'Wierzba biała', 'Wierzba krucha',
  'Wierzba iwa', 'Kasztanowiec zwyczajny', 'Robinia akacjowa',
  'Platan klonolistny', 'Platan wschodni', 'Cis pospolity', 'Jałowiec pospolity',
  'Daglezja zielona', 'Orzech włoski', 'Orzech czarny', 'Jabłoń domowa',
  'Grusza pospolita', 'Wiśnia pospolita', 'Czereśnia', 'Śliwa domowa',
  'Morela', 'Brzoskwinia', 'Migdałowiec', 'Jarząb pospolity',
  'Głóg jednoszyjkowy', 'Leszczyna pospolita', 'Morwa biała', 'Dereń jadalny',
  'Rokitnik zwyczajny', 'Bez czarny', 'Kalina koralowa', 'Czeremcha amerykańska',
  'Grusza polna', 'Jabłoń dzika', 'Śliwa tarnina', 'Brzoza karłowata',
  'Jodła koreańska', 'Modrzew japoński', 'Żywotnik zachodni',
  'Cyprysik Lawsona', 'Choina kanadyjska', 'Metasekwoja chińska',
  'Kasztanowiec czerwony', 'Orzesznik', 'Leszczyna turecka', 'Dąb omszony',
  'Klon japoński', 'Jesion pensylwański', 'Lipa amerykańska', 'Wiąz amerykański',
  'Tulipanowiec amerykański', 'Perukowiec podolski', 'Sumak octowiec',
  'Katalpa bignoniowa', 'Miłorząb dwuklapowy', 'Sekwoja wieczniezielona',
  'Baobab afrykański', 'Eukaliptus',
];

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
  'Makaron bezglutenowy', 'Makaron pełnoziarnisty', 'Makaron dwukolorowy',
  'Makaron świderki', 'Makaron muszelki', 'Makaron kokardki', 'Makaron rurki',
  'Makaron wstążki', 'Makaron kolanka', 'Makaron nitki', 'Makaron gniazda',
];

const cars = [
  'Volkswagen', 'Skoda', 'Ford', 'Opel', 'Renault', 'Fiat', 'Peugeot',
  'Citroën', 'BMW', 'Audi', 'Kia', 'Hyundai', 'Dacia', 'SEAT', 'Volvo',
  'Honda', 'Mazda', 'Suzuki', 'Tesla', 'Cupra', 'Jeep', 'Mitsubishi',
  'Lexus', 'Mini', 'Land Rover', 'Porsche', 'Alfa Romeo', 'Aston Martin',
  'Toyota', 'Mercedes-Benz', 'Nissan', 'Chevrolet', 'Dodge', 'Chrysler',
  'Cadillac', 'Jaguar', 'Ferrari', 'Lamborghini', 'Maserati', 'Bentley',
  'Rolls-Royce', 'Bugatti', 'Subaru', 'Infiniti', 'Acura', 'Genesis',
  'Lancia', 'Smart', 'Saab', 'Rover', 'MG', 'Chery', 'BYD', 'Polestar',
  'Lucid Motors', 'Rivian', 'Tata Motors', 'Mahindra', 'Proton', 'Holden',
  'Pontiac', 'Buick', 'GMC', 'Oldsmobile', 'Plymouth', 'Trabant', 'Wartburg',
  'FSO', 'Warszawa', 'Syrena', 'Żuk', 'Tarpan', 'Honker', 'Iveco', 'Scania',
  'MAN', 'DAF', 'Kamaz', 'Isuzu', 'Daihatsu', 'SsangYong', 'Lada', 'Moskwicz',
  'GAZ', 'UAZ', 'Zastava', 'Yugo',
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

const BAD = /(logo|logotyp|icon|ikona|symbol|coat|herb|crest|flag|flaga|map|mapa|distribution|range|locator|diagram|chart|wykres|plan\b|illustration|illustrac|drawing|rysunek|köhler|sturm|plate|tablica|leaf|liść|leaves|flower|kwiat|fruit|owoc|seed|nasion|cone|szysz|bark|kora|gall|insect|owad|portrait|portret|screenshot|zrzut|table|tabela)/i;
const PHOTO = /\.(jpe?g|png|webp)$/i;

async function api(params, tries = 5) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', redirects: '1', ...params })) {
    url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    const text = await res.text();
    if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
    if (res.status === 429) {
      await sleep(7000 + attempt * 5000);
      continue;
    }
    throw new Error('API ' + res.status + ': ' + text.slice(0, 80));
  }
  throw new Error('API limit');
}

function cleanFile(url) {
  return String(url || '').split('?')[0].replace(/^https?:\/\/thumb\.wikimedia\.org\//i, 'https://upload.wikimedia.org/');
}

function usableFile(url, kind) {
  const file = decodeURIComponent(String(url || '').split('?')[0].split('/').pop() || '');
  if (!PHOTO.test(file) || BAD.test(file)) return false;
  if (kind === 'park' && /(park.*logo|logo.*park|godło|godlo)/i.test(file)) return false;
  return true;
}

async function pageImageBatch(titles) {
  const found = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const data = await api({
      action: 'query', titles: batch.join('|'), prop: 'pageimages',
      piprop: 'thumbnail', pithumbsize: '1000',
    });
    const normalized = new Map((data?.query?.normalized || []).map((x) => [x.from, x.to]));
    const redirects = new Map((data?.query?.redirects || []).map((x) => [x.from, x.to]));
    const pages = new Map(Object.values(data?.query?.pages || {}).map((p) => [p.title, p]));
    for (const original of batch) {
      let title = normalized.get(original) || original;
      title = redirects.get(title) || title;
      const page = pages.get(title);
      if (page?.thumbnail?.source) found.set(original, cleanFile(page.thumbnail.source));
    }
    console.log('pageimages', Math.min(i + 40, titles.length), '/', titles.length);
    await sleep(1200);
  }
  return found;
}

async function mediaPhoto(title, kind) {
  const suffix = kind === 'pasta' ? 'makaron' : kind === 'car' ? 'samochód' : kind === 'park' ? 'park krajobraz' : 'drzewo';
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: title + ' ' + suffix,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '1000',
  });
  const pages = Object.values(data?.query?.pages || {});
  for (const page of pages) {
    const url = cleanFile(page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || '');
    if (url && usableFile(url, kind)) return url;
  }
  return '';
}

async function photosFor(titles, kind) {
  const primary = await pageImageBatch(titles);
  const out = new Map();
  for (const title of titles) {
    const image = primary.get(title);
    if (image && usableFile(image, kind)) out.set(title, image);
  }
  const missing = titles.filter((title) => !out.has(title));
  console.log('brakuje zdjęć', kind, missing.length, 'uzupełniam');
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (cursor < missing.length) {
      const title = missing[cursor++];
      try {
        const image = await mediaPhoto(title, kind);
        if (image) out.set(title, image);
      } catch {}
    }
  });
  await Promise.all(workers);
  return out;
}

function pack(items) {
  const seen = new Set();
  const images = new Set();
  return {
    items: items.filter((item) => {
      if (!item?.a || !item?.img) return false;
      const key = item.a.toLowerCase();
      if (seen.has(key) || images.has(item.img)) return false;
      seen.add(key);
      images.add(item.img);
      return true;
    }),
  };
}

async function save(id, name, icon, prompt, group, titles, kind) {
  const images = await photosFor(titles, kind);
  const items = titles
    .filter((title) => images.has(title))
    .map((title) => ({ a: title, img: images.get(title) }));
  const data = pack(items);
  if (data.items.length < 20) throw new Error(id + ': tylko ' + data.items.length + ' zdjęć');
  await fs.writeFile('data/packs/' + id + '.json', JSON.stringify({ ...data, name, group, icon, prompt, source: 'ręcznie wybrana lista' }, null, 2) + '\n');
  console.log(id, data.items.length);
  return data.items.length;
}

(async () => {
  const only = process.argv[2] || 'all';
  if (only === 'all' || only === 'drzewa') await save('drzewa', 'Drzewa', '🌳', 'Jakie to drzewo?', 'Przyroda', trees, 'tree');
  if (only === 'all' || only === 'makaron') await save('makaron', 'Makaron', '🍝', 'Jaki to makaron?', 'Kuchnia', pasta, 'pasta');
  if (only === 'all' || only === 'marki') await save('marki-samochodow', 'Marki samochodów', '🚗', 'Jaka to marka samochodu?', 'Motoryzacja', cars, 'car');
  if (only === 'all' || only === 'parki') await save('parki-narodowe', 'Parki narodowe', '🌲', 'Jaki to park narodowy?', 'Geografia', parks, 'park');
  console.log('gotowe');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
