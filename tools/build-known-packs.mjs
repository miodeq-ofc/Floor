// Buduje kilka dużych, polskich kategorii ze zwykłych list Wikipedia.
// Nie kopiujemy całych kategorii: bierzemy tylko rozpoznawalne nazwy,
// a odpowiedzią jest polska nazwa, nie łacińska nazwa taksonu.
import fs from 'node:fs/promises';

const API = 'https://pl.wikipedia.org/w/api.php';
const OUT = 'data/packs';
const UA = 'TheFloor/1.0 (educational quiz; contact: local)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function raw(page) {
  const url = 'https://pl.wikipedia.org/w/index.php?title=' + encodeURIComponent(page) + '&action=raw';
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error('raw ' + page + ': ' + res.status);
  return res.text();
}

async function api(params) {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ format: 'json', formatversion: '2', redirects: '1', ...params })) {
    url.searchParams.set(key, value);
  }
  for (let attempt = 0; attempt < 7; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    const text = await res.text();
    if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
    if (res.status === 429 || /too many requests/i.test(text)) {
      await sleep(15000 + attempt * 10000);
      continue;
    }
    throw new Error('api ' + res.status + ': ' + text.slice(0, 100));
  }
  throw new Error('api: limit zapytań');
}

function cleanName(value) {
  return String(value || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/†/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageOk(name) {
  let path = String(name || '').split('?')[0];
  try {
    path = new URL(path).pathname;
  } catch {}
  const file = decodeURIComponent(path.split('/').pop() || '').toLowerCase();
  if (!file || !/\.(jpe?g|png|webp)$/i.test(file)) return false;
  return !/(map|mapa|distribution|range|locator|coat|herb|flag|flaga|logo|icon|diagram|chart|wykres|plan\b)/i.test(file);
}

async function imagesFor(titles) {
  const found = new Map();
  const unique = [...new Set(titles.map(cleanName).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 45) {
    const batch = unique.slice(i, i + 45);
    const data = await api({
      action: 'query',
      titles: batch.join('|'),
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '1000',
    });
    const pages = new Map(Object.values(data?.query?.pages || {}).map((page) => [page.title, page]));
    const normalized = new Map((data?.query?.normalized || []).map((x) => [x.from, x.to]));
    const redirected = new Map((data?.query?.redirects || []).map((x) => [x.from, x.to]));
    for (const requested of batch) {
      let title = normalized.get(requested) || requested;
      title = redirected.get(title) || title;
      const page = pages.get(title);
      if (!page?.thumbnail?.source || !imageOk(page.thumbnail.source)) continue;
      found.set(requested, page.thumbnail.source.split('?')[0]);
    }
    console.log('obrazy', Math.min(i + 45, unique.length), '/', unique.length, 'znalezione', found.size);
    await sleep(2500);
  }
  return found;
}

function packFrom(items) {
  const seen = new Set();
  const images = new Set();
  const out = [];
  for (const item of items) {
    const answer = cleanName(item.a);
    const img = String(item.img || '').trim();
    if (!answer || !img || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(img)) continue;
    const key = answer.toLowerCase();
    if (seen.has(key) || images.has(img)) continue;
    seen.add(key);
    images.add(img);
    out.push({ a: answer, img });
  }
  return { items: out };
}

async function save(id, name, icon, prompt, group, items) {
  const pack = packFrom(items);
  if (pack.items.length < 20) throw new Error(id + ': tylko ' + pack.items.length + ' pozycji');
  await fs.writeFile(`${OUT}/${id}.json`, JSON.stringify(pack, null, 2) + '\n');
  console.log(id, pack.items.length, pack.items.slice(0, 8).map((x) => x.a).join(', '));
  return { id, name, icon, prompt, group, count: pack.items.length };
}

async function fromPageList(page, filter = () => true) {
  const text = await raw(page);
  const names = [...text.matchAll(/'''\[\[([^\]|]+)(?:\|[^\]]*)?\]\]'''/g)]
    .map((m) => cleanName(m[1]))
    .filter((name) => name && !/[()]/.test(name) && !/wymar|†/i.test(name))
    .filter(filter);
  const images = await imagesFor(names);
  return names.map((name) => ({ a: name, img: images.get(name) })).filter((x) => x.img);
}

const commonMammals = [
  'Wilk', 'Lis rudy', 'Niedźwiedź brunatny', 'Niedźwiedź polarny', 'Panda wielka', 'Koala',
  'Żubr europejski', 'Łoś', 'Jeleń szlachetny', 'Sarna', 'Daniel zwyczajny', 'Dzik',
  'Muflon śródziemnomorski', 'Kozica', 'Renifer', 'Bizon amerykański', 'Bawół afrykański',
  'Żyrafa', 'Zebra', 'Nosorożec biały', 'Hipopotam nilowy', 'Lew', 'Tygrys', 'Lampart',
  'Jaguar', 'Gepard', 'Puma', 'Ryś', 'Żbik', 'Hiena cętkowana', 'Kojot', 'Szakal złocisty',
  'Borsuk', 'Wydra europejska', 'Bóbr europejski', 'Kuna leśna', 'Tchórz', 'Gronostaj',
  'Łasica', 'Wiewiórka pospolita', 'Szympans', 'Goryl', 'Orangutan', 'Bonobo', 'Mandryl',
  'Lemur katta', 'Gibon', 'Kangur', 'Wombat', 'Diabeł tasmański', 'Leniwiec', 'Mrówkojad',
  'Pancernik', 'Kapibara', 'Świnka morska', 'Chomik', 'Mysz domowa', 'Szczur wędrowny',
  'Królik europejski', 'Zając szarak', 'Jeżozwierz', 'Skunks', 'Szop pracz', 'Panda mała',
  'Surykatka', 'Mangusta', 'Łuskowiec', 'Foka szara', 'Mors', 'Delfin zwyczajny', 'Orka',
  'Wieloryb błękitny', 'Kaszalot', 'Manat', 'Jeż zachodni', 'Kret europejski', 'Ryjówka aksamitna',
  'Borsuk europejski', 'Norka amerykańska', 'Piżmak amerykański', 'Nutria amerykańska',
  'Jeleń wschodni', 'Koziorożec alpejski', 'Owca domowa', 'Koza domowa', 'Krowa', 'Świnia domowa',
  'Koń domowy', 'Osioł', 'Wielbłąd dwugarbny', 'Lama', 'Alpaka', 'Jaki', 'Niedźwiedź malajski',
  'Wydra morska', 'Słoń afrykański', 'Słoń indyjski', 'Tapir', 'Goryl górski',
];

const gady = [
  'Żmija zygzakowata', 'Zaskroniec zwyczajny', 'Padalec zwyczajny', 'Jaszczurka zwinka',
  'Jaszczurka żyworodna', 'Jaszczurka zielona', 'Krokodyl nilowy', 'Krokodyl błotny',
  'Aligator amerykański', 'Kajman okularowy', 'Gawial gangesowy', 'Waran z Komodo',
  'Waran nilowy', 'Legwan zielony', 'Kameleon pospolity', 'Kameleon jemeński',
  'Gekon orzęsiony', 'Gekon lamparci', 'Agama brodata', 'Żółw błotny', 'Żółw grecki',
  'Żółw olbrzymi', 'Żółw skórzasty', 'Żółw zielony', 'Karetta', 'Wąż zbożowy',
  'Pyton tygrysi', 'Pyton siatkowy', 'Anakonda zielona', 'Boa dusiciel', 'Kobra królewska',
  'Kobra indyjska', 'Mamba czarna', 'Żmija gabońska', 'Grzechotnik diamentowy',
  'Żółw czerwonolicy', 'Żółw żółtobrzuchy', 'Gekon płaczący', 'Scynk olbrzymi',
  'Jaszczurka perłowa',   'Waran paskowany', 'Krokodyl kubański', 'Aligator chiński',
  'Żółw gwiaździsty', 'Żółw egipski', 'Pyton królewski',
  'Jaszczurka murowa', 'Jaszczurka algirska', 'Jaszczurka sycylijska', 'Jaszczurka smugowa',
  'Wąż Eskulapa', 'Wąż trawiasty', 'Wąż chiński', 'Wąż ogrodowy', 'Wąż tygrysi',
  'Krokodyl różański', 'Krokodyl amerykański', 'Kajman karłowaty', 'Kajman szerokopyski',
  'Waran szary', 'Waran papuaski', 'Waran kolczasty', 'Legwan morski', 'Legwan nosorogi',
  'Kameleon lamparci', 'Kameleon wielkogłowy', 'Gekon wielkopalcy', 'Gekon tygrysi',
  'Agama żaglowa', 'Żółw słoniowy', 'Żółw promienisty', 'Żółw lamparci',
  'Anakonda żółta', 'Boa tęczowy', 'Mamba zielona', 'Grzechotnik teksaski',
  'Żółw jaszczurowaty', 'Żółw piżmowy', 'Żółw cętkowany', 'Żółw sundajski',
  'Jaszczurka długoogonowa', 'Jaszczurka bluszczowa', 'Jaszczurka piaskowa',
  'Waran błotny', 'Waran indyjski', 'Krokodyl gawialowy', 'Aligator amerykański',
];

const drzewa = [
  'Dąb szypułkowy', 'Dąb bezszypułkowy', 'Buk zwyczajny', 'Brzoza brodawkowata',
  'Brzoza omszona', 'Sosna zwyczajna', 'Świerk pospolity', 'Jodła pospolita',
  'Modrzew europejski', 'Klon zwyczajny', 'Klon jawor', 'Klon polny', 'Jesion wyniosły',
  'Lipa drobnolistna', 'Lipa szerokolistna', 'Wiąz szypułkowy', 'Wiąz górski',
  'Olcha czarna', 'Olsza szara', 'Grab zwyczajny', 'Topola biała', 'Topola czarna',
  'Wierzba biała', 'Wierzba krucha', 'Kasztanowiec zwyczajny', 'Robinia akacjowa',
  'Platan klonolistny', 'Cis pospolity', 'Jałowiec pospolity', 'Daglezja zielona',
  'Orzech włoski', 'Jabłoń domowa', 'Grusza pospolita', 'Wiśnia pospolita',
  'Czereśnia', 'Śliwa domowa', 'Morela', 'Brzoskwinia', 'Migdałowiec',
  'Magnolia gwiaździsta', 'Tulipanowiec amerykański', 'Ambrowec amerykański',
  'Miłorząb dwuklapowy', 'Sekwoja wieczniezielona', 'Baobab afrykański',
  'Eukaliptus', 'Katalpa bignoniowa', 'Perukowiec podolski', 'Sumak octowiec',
  'Głóg jednoszyjkowy', 'Jarząb pospolity', 'Brzoskwinia zwyczajna', 'Morwa biała',
  'Dąb czerwony', 'Klon srebrzysty', 'Klon japoński', 'Jesion pensylwański',
  'Lipa amerykańska', 'Wiąz amerykański', 'Topola osika', 'Wierzba iwa',
  'Brzoza karłowata', 'Sosna czarna', 'Sosna limba', 'Sosna wejmutka',
  'Świerk kłujący', 'Świerk serbski', 'Jodła koreańska', 'Jodła balsamiczna',
  'Modrzew japoński', 'Żywotnik zachodni', 'Cyprys wieczniezielony', 'Cyprysik Lawsona',
  'Choina kanadyjska', 'Metasekwoja chińska', 'Sekwojadendron', 'Platan wschodni',
  'Kasztanowiec czerwony', 'Orzech czarny', 'Orzesznik', 'Jabłoń dzika',
  'Grusza polna', 'Wiśnia ptasia', 'Śliwa tarnina', 'Leszczyna pospolita',
  'Dereń jadalny', 'Rokitnik zwyczajny', 'Bez czarny', 'Kalina koralowa',
];

const makaron = [
  'Spaghetti', 'Penne', 'Fusilli', 'Farfalle', 'Tagliatelle', 'Rigatoni',
  'Lasagne', 'Cannelloni', 'Tortellini', 'Ravioli', 'Makaron jajeczny',
  'Makaron ryżowy', 'Makaron soba', 'Makaron udon', 'Makaron ramen',
  'Makaron ryżowy', 'Papardelle', 'Linguine', 'Conchiglie', 'Orecchiette',
  'Gnocchi', 'Cappelletti', 'Agnolotti', 'Cavatelli', 'Fettuccine',
  'Bucatini', 'Vermicelli', 'Orzo', 'Risoni', 'Strozzapreti', 'Garganelli',
  'Trofie', 'Ziti', 'Mostaccioli', 'Radiatori', 'Gemelli', 'Casarecce',
  'Paccheri', 'Mafaldine', 'Ruote', 'Fregola', 'Sagnarelli', 'Stringozzi',
  'Pici', 'Testaroli', 'Cencioni', 'Lorighittas', 'Filindeu', 'Malloreddus',
  'Cappelletti', 'Anelli', 'Anellini', 'Cavatappi', 'Cellentani', 'Ditalini',
  'Fregola', 'Gigli', 'Gnocchetti', 'Gramigna', 'Lumache', 'Maltagliati',
  'Manicotti', 'Mezze penne', 'Mezzi rigatoni', 'Mafaldine', 'Nodi marini',
  'Paccheri', 'Passatelli', 'Penne rigate', 'Pennette', 'Pipe rigate',
  'Quadrettini', 'Ricciolini', 'Rotelle', 'Rotini', 'Sagnarelli', 'Serpentini',
  'Spaccatelle', 'Stelline', 'Strozzapreti', 'Tagliolini', 'Tempesta',
  'Tortiglioni', 'Trenette', 'Tripoline', 'Trottole', 'Ziti', 'Zitoni',
];

const knownCities = [
  'Warszawa', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz',
  'Lublin', 'Białystok', 'Katowice', 'Gdynia', 'Częstochowa', 'Radom', 'Toruń',
  'Sosnowiec', 'Rzeszów', 'Kielce', 'Gliwice', 'Olsztyn', 'Zabrze', 'Bielsko-Biała',
  'Bytom', 'Zielona Góra', 'Rybnik', 'Ruda Śląska', 'Opole', 'Tychy',
  'Gorzów Wielkopolski', 'Dąbrowa Górnicza', 'Elbląg', 'Płock', 'Wałbrzych',
  'Włocławek', 'Tarnów', 'Chorzów', 'Koszalin', 'Kalisz', 'Legnica', 'Grudziądz',
  'Jaworzno', 'Słupsk', 'Jastrzębie-Zdrój', 'Nowy Sącz', 'Jelenia Góra', 'Siedlce',
  'Mysłowice', 'Konin', 'Piła', 'Piotrków Trybunalski', 'Inowrocław', 'Lubin',
  'Ostrów Wielkopolski', 'Suwałki', 'Stargard', 'Gniezno', 'Ostrowiec Świętokrzyski',
  'Siemianowice Śląskie', 'Głogów', 'Pabianice', 'Leszno', 'Zamość', 'Przemyśl',
  'Chełm', 'Tomaszów Mazowiecki', 'Stalowa Wola', 'Kędzierzyn-Koźle', 'Tczew',
  'Biała Podlaska', 'Bełchatów', 'Świdnica', 'Będzin', 'Zgierz', 'Piekary Śląskie',
  'Racibórz', 'Legionowo', 'Ostrołęka', 'Świętochłowice', 'Wejherowo', 'Zawiercie',
  'Skierniewice', 'Starachowice', 'Wodzisław Śląski', 'Puławy', 'Starogard Gdański',
  'Tarnobrzeg', 'Kołobrzeg', 'Krosno', 'Radomsko', 'Otwock', 'Skarżysko-Kamienna',
  'Ciechanów', 'Kutno', 'Nysa', 'Sieradz', 'Zduńska Wola', 'Świnoujście',
  'Żyrardów', 'Bolesławiec', 'Nowa Sól', 'Knurów', 'Oświęcim', 'Krotoszyn',
  'Jarosław', 'Zakopane', 'Sanok', 'Łuków', 'Chojnice', 'Mielec', 'Malbork',
  'Września', 'Kętrzyn', 'Szczytno', 'Olecko', 'Ełk', 'Giżycko', 'Augustów',
  'Rzym', 'Paryż', 'Londyn', 'Madryt', 'Berlin', 'Wiedeń', 'Praga', 'Budapeszt',
  'Amsterdam', 'Bruksela', 'Lizbona', 'Ateny', 'Sztokholm', 'Oslo', 'Kopenhaga',
  'Helsinki', 'Dublin', 'Moskwa', 'Kijów', 'Stambuł', 'Nowy Jork', 'Los Angeles',
  'Chicago', 'Toronto', 'Meksyk', 'Rio de Janeiro', 'Buenos Aires', 'Tokio', 'Pekin',
  'Szanghaj', 'Seul', 'Bangkok', 'Singapur', 'Sydney', 'Melbourne', 'Kair', 'Dubaj',
  'Jerozolima', 'Wenecja', 'Florencja', 'Barcelona', 'Monachium', 'Hamburg', 'Zurych', 'Genewa',
];

(async () => {
  const results = [];
  const ssakiImages = await imagesFor(commonMammals);
  results.push(await save('ssaki', 'Ssaki', '🦌', 'Jaki to ssak?', 'Przyroda', commonMammals.map((a) => ({ a, img: ssakiImages.get(a) }))));

  const gadyImages = await imagesFor(gady);
  results.push(await save('gady', 'Gady', '🦎', 'Jaki to gad?', 'Przyroda', gady.map((a) => ({ a, img: gadyImages.get(a) }))));

  const drzewaImages = await imagesFor(drzewa);
  results.push(await save('drzewa', 'Drzewa', '🌳', 'Jakie to drzewo?', 'Przyroda', drzewa.map((a) => ({ a, img: drzewaImages.get(a) }))));

  const makaronImages = await imagesFor(makaron);
  results.push(await save('makaron', 'Makaron', '🍝', 'Jaki to makaron?', 'Kuchnia', makaron.map((a) => ({ a, img: makaronImages.get(a) }))));

  const miastaImages = await imagesFor(knownCities);
  results.push(await save('miasta', 'Miasta', '🏙️', 'Jakie to miasto?', 'Geografia', knownCities.map((a) => ({ a, img: miastaImages.get(a) }))));

  await fs.writeFile('tools/known-packs.json', JSON.stringify(results, null, 2) + '\n');
  console.log('gotowe', results.map((x) => x.id + ':' + x.count).join(' '));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
