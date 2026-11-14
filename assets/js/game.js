// Wspólne helpery planszy i pojedynków.
export const COLORS = ['#f6c453', '#63a4ff', '#2fd67c', '#ff7a90', '#b18cff', '#ffa94d', '#4dd6c1', '#f06bd4'];

// Kategorie z pytaniami o konkretne modele sprzętu odpadają z planszy —
// w teleturnieju pytania są o rozpoznawalne rzeczy, nie o model telefonu.
export const EXCLUDED = new Set(['smartfony', 'telefony', 'procesory', 'karty-graficzne']);

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
  let best = null;
  for (let rows = 4; rows <= 9; rows++) {
    for (let cols = 4; cols <= 10; cols++) {
      const total = rows * cols;
      if (total % playerCount !== 0) continue;
      const per = total / playerCount;
      if (per < 4 || per > 16) continue;
      const score =
        Math.abs(rows - 7) +
        Math.abs(cols - 7) +
        Math.abs(total - 49) * 0.12 +
        (rows > cols ? 0.4 : 0);
      if (!best || score < best.score) best = { rows, cols, total, per, score };
    }
  }
  return best || { rows: 7, cols: 7, total: 49, per: Math.floor(49 / playerCount) };
}

export function snakeCells(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const colsOrder = r % 2 === 0 ? [...Array(cols).keys()] : [...Array(cols).keys()].reverse();
    for (const c of colsOrder) cells.push({ r, c });
  }
  return cells;
}

export function buildTiles(players, pool, rows, cols) {
  const total = rows * cols;
  if (!players.length) throw new Error('Brak graczy.');
  if (total % players.length !== 0) throw new Error('Plansza nie dzieli się równo między graczy.');
  if (pool.length < total) throw new Error('Za mało kategorii: potrzebujesz ' + total + ', masz ' + pool.length + '.');
  const cats = shuffle(pool).slice(0, total);
  const cells = snakeCells(rows, cols);
  const per = total / players.length;
  const assignedPlayers = shuffle(players);
  const tiles = cells.map((cell, index) => ({
    r: cell.r,
    c: cell.c,
    cat: cats[index],
    owner: assignedPlayers[Math.floor(index / per)].id,
  }));
  return tiles;
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
