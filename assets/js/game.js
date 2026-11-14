// Wspólne helpery planszy i pojedynków.
export const COLORS = ['#f6c453', '#63a4ff', '#2fd67c', '#ff7a90', '#b18cff', '#ffa94d', '#4dd6c1', '#f06bd4'];

// Kategorie z pytaniami o konkretne modele sprzętu odpadają z planszy —
// w teleturnieju pytania są o rozpoznawalne rzeczy, nie o model telefonu.
export const EXCLUDED = new Set(['smartfony', 'telefony', 'procesory', 'karty-graficzne']);

// Docelowe, w miarę kwadratowe plansze. Jeżeli liczba pól nie dzieli się
// przez liczbę graczy, używamy najbliższego sensownego prostokąta.
export const GRIDS = {
  2: [4, 4], // 16 pól, po 8
  3: [5, 6], // 30 pól, po 10
  4: [6, 6], // 36 pól, po 9
  5: [6, 5], // 30 pól, po 6
  6: [6, 6], // 36 pól, po 6
  7: [7, 7], // 49 pól, po 7
  8: [8, 7], // 56 pól, po 7
};

export const SHORT_CATEGORY = {
  'Samochody wyścigowe': 'Wyścigowe',
  'Napoje bezalkoholowe': 'Napoje',
  'Marki samochodów': 'Marki aut',
  'Owoce jadalne': 'Owoce',
  'Marki kosmetyków': 'Kosmetyki',
  'Sieci handlowe': 'Sieci',
  'Gry planszowe': 'Planszówki',
  'Polscy aktorzy': 'Aktorzy',
  'Polscy politycy': 'Politycy',
  'Prezydenci USA': 'Prezydenci',
  'Władcy Polski': 'Władcy',
  'Rasy psów': 'Psy',
  'Rasy koni': 'Konie',
  'Gatunki muzyczne': 'Muzyka',
  'Zespoły muzyczne': 'Zespoły',
  'Instrumenty muzyczne': 'Instrumenty',
  'Mięsa i wędliny': 'Mięsa',
  'Ryby akwariowe': 'Ryby',
  'Samochody terenowe': 'Terenowe',
  'Samochody ciężarowe': 'Ciężarowe',
  'Aplikacje internetowe': 'Aplikacje',
  'Marki odzieżowe': 'Odzież',
  'Ciasta wytrawne': 'Wytrawne',
  'Pierwiastki chemiczne': 'Pierwiastki',
  'Logotypy znanych marek': 'Logotypy',
  'Zamki w Polsce': 'Zamki',
  'Zamki': 'Zamki',
  'Zabytki': 'Zabytki',
  'Zwierzęta': 'Zwierzęta',
  'Kwiaty': 'Kwiaty',
  'Drzewa': 'Drzewa',
  'Ptaki': 'Ptaki',
  'Owady': 'Owady',
  'Grzyby jadalne': 'Grzyby',
  'Przyprawy': 'Przyprawy',
  'Zupy': 'Zupy',
  'Ciasta deserowe': 'Ciasta',
  'Pieczywo': 'Pieczywo',
  'Sery': 'Sery',
  'Wina': 'Wina',
  'Piwo': 'Piwo',
  'Herbaty': 'Herbaty',
  'Kawa': 'Kawa',
  'Słodycze': 'Słodycze',
  'Zabawki': 'Zabawki',
  'Pociągi': 'Pociągi',
  'Rowery': 'Rowery',
  'Motocykle': 'Motocykle',
  'Samoloty': 'Samoloty',
  'Statki': 'Statki',
  'Kosmos': 'Kosmos',
  'Planety': 'Planety',
  'Kraje': 'Kraje',
  'Flagi państw': 'Flagi',
  'Herby państw': 'Herby',
  'Języki': 'Języki',
  'Waluty': 'Waluty',
  'Instrumenty': 'Instrumenty',
  'Tańce': 'Tańce',
  'Filmy': 'Filmy',
  'Seriale': 'Seriale',
  'Gry komputerowe': 'Gry',
  'Bohaterowie': 'Bohaterowie',
};

export function uid(prefix = 'p') {
  return prefix + Math.random().toString(36).slice(2, 8);
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s);
}

export function pickGrid(playerCount) {
  const pair = GRIDS[playerCount] || [7, 7];
  const [rows, cols] = pair;
  return { rows, cols, total: rows * cols, per: (rows * cols) / playerCount };
}

export function pluralPoles(n) {
  const abs = Math.abs(Number(n) || 0);
  if (abs === 1) return 'pole';
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'pola' : 'pól';
}

export function shortCategory(name) {
  if (!name) return '';
  if (SHORT_CATEGORY[name]) return SHORT_CATEGORY[name];
  const clean = String(name).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // Nie ucinamy nazw typu „Znaczki pocztowe”. Kafelek ma do 3 linii
  // i wyśrodkowany tekst, więc dłuższe kategorie po prostu się zawijają.
  return clean;
}

export function allCells(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ r, c });
  }
  return cells;
}

export function buildTiles(players, pool, rows, cols) {
  const total = rows * cols;
  if (!players.length) throw new Error('Brak graczy.');
  if (total % players.length !== 0) throw new Error('Plansza nie dzieli się równo między graczy.');
  if (pool.length < total) throw new Error('Za mało kategorii: potrzebujesz ' + total + ', masz ' + pool.length + '.');

  const cats = shuffle(pool).slice(0, total);
  const cells = allCells(rows, cols);
  const per = total / players.length;

  // Ważne: terytoria są losowe i mogą być rozproszone. Gracz może mieć pole
  // w lewym górnym rogu i drugie w prawym dolnym — jak w prawdziwym The Floor
  // z wieloma polami na osobę.
  const ownerSlots = [];
  players.forEach((player) => {
    for (let i = 0; i < per; i++) ownerSlots.push(player.id);
  });
  const shuffledSlots = shuffle(ownerSlots);

  return cells.map((cell, index) => ({
    r: cell.r,
    c: cell.c,
    cat: cats[index],
    owner: shuffledSlots[index],
  }));
}

export function keyOf(tile) {
  return tile.r + ':' + tile.c;
}

export function tileAt(tiles, r, c) {
  return tiles.find((t) => t.r === r && t.c === c) || null;
}

export function neighbors(r, c, rows, cols) {
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ].filter(([rr, cc]) => rr >= 0 && rr < rows && cc >= 0 && cc < cols);
}

export function territory(tiles, ownerId) {
  return tiles.filter((t) => t.owner === ownerId);
}

/** Pola gracza, z których można zaatakować — mają sąsiada przeciwnika. */
export function sourceOptions(tiles, ownerId, rows, cols) {
  return tiles.filter((tile) => {
    if (tile.owner !== ownerId) return false;
    return neighbors(tile.r, tile.c, rows, cols).some(([r, c]) => {
      const next = tileAt(tiles, r, c);
      return next && next.owner !== ownerId;
    });
  });
}

/** Sąsiedzi przeciwnika wybranego pola atakującego. */
export function targetsFrom(tiles, ownerId, sourceKey, rows, cols) {
  const source = tiles.find((t) => keyOf(t) === sourceKey);
  if (!source) return [];
  return neighbors(source.r, source.c, rows, cols)
    .map(([r, c]) => tileAt(tiles, r, c))
    .filter((tile) => tile && tile.owner !== ownerId);
}

/** Zgodność pól tego samego właściciela i kategorii — do efektu scalenia. */
export function sameCategoryNeighbor(tiles, tile, rows, cols) {
  return neighbors(tile.r, tile.c, rows, cols).some(([r, c]) => {
    const next = tileAt(tiles, r, c);
    return next && next.owner === tile.owner && next.cat?.id === tile.cat?.id;
  });
}

/**
 * Krawędzie, którymi pole łączy się z sąsiednim polem tego samego gracza
 * i tej samej kategorii. Służy do rysowania jednego kształtu (poligonu)
 * zamiast kilku osobnych kafelków.
 */
export function mergeInfo(tiles, tile, rows, cols) {
  const same = (dr, dc) => {
    const next = tileAt(tiles, tile.r + dr, tile.c + dc);
    return Boolean(next && next.owner === tile.owner && next.cat?.id === tile.cat?.id);
  };
  const up = tile.r > 0 && same(-1, 0);
  const down = tile.r < rows - 1 && same(1, 0);
  const left = tile.c > 0 && same(0, -1);
  const right = tile.c < cols - 1 && same(0, 1);
  return {
    up,
    down,
    left,
    right,
    merged: up || down || left || right,
    // Etykietę zostawiamy tylko na pierwszym polu grupy, żeby nie powtarzać
    // „Herbaty” w każdym kafelku jednego kształtu.
    continuation: up || left,
  };
}

export function frontier(tiles, ownerId) {
  const own = new Set(territory(tiles, ownerId).map(keyOf));
  const out = [];
  const seen = new Set();
  for (const tile of tiles) {
    if (tile.owner === ownerId) continue;
    const k = keyOf(tile);
    if (seen.has(k)) continue;
    const touches = [...own].some((ownKey) => {
      const [r, c] = ownKey.split(':').map(Number);
      return Math.abs(tile.r - r) + Math.abs(tile.c - c) === 1;
    });
    if (touches) {
      seen.add(k);
      out.push(tile);
    }
  }
  return out;
}

export function alive(players) {
  return players.filter((p) => p.alive !== false);
}

export function ownerIdOf(tiles, ownerId) {
  return tiles.some((t) => t.owner === ownerId);
}

export function categoryLabel(cat) {
  if (!cat) return '';
  return (cat.icon ? cat.icon + ' ' : '') + cat.name;
}

export function tileCounts(tiles) {
  return tiles.reduce((acc, t) => {
    acc[t.owner] = (acc[t.owner] || 0) + 1;
    return acc;
  }, {});
}
