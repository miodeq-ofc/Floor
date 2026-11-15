import { $, Bus, loadIndex, loadPack, makeQueue, markSeen, toast, answerKey } from './common.js';
import { preloadImages, setImageWithFallback } from './images.js';
import {
  COLORS,
  EXCLUDED,
  uid,
  shuffle,
  pickGrid,
  buildTiles,
  sourceOptions,
  targetsFrom,
  territory,
  tileAt,
  keyOf,
  tileCounts,
  alive,
  fmtClock,
  shortCategory,
  sameCategoryNeighbor,
  categoryGroup,
  captureDuelTerritory,
  mergeInfo,
  pluralPoles,
} from './game.js';

const LOGO_PACKS = new Set(['loga-firm', 'aplikacje-internetowe', 'flagi-panstw', 'herby-panstw']);
const BLUR_PACKS = new Set(['loga-firm', 'marki-napojow', 'piwo']);

const SETTINGS_KEY = 'floor:settings';
const H = {
  phase: 'setup',
  packs: [],
  selected: new Set(),
  players: [],
  count: 4,
  names: [],
  rows: 7,
  cols: 7,
  tiles: [],
  selectedKey: null,
  turnSeconds: 45,
  logoBlur: true,
  challengerId: null,
  targets: [],
  duel: null,
  result: null,
  winnerId: null,
  turnIndex: -1,
  sourceKey: null,
  conquest: null,
  used: new Set(),
  introUntil: 0,
  lastSent: 0,
  boardSeen: 0,
  busy: false,
  overlayKey: '',
  token: 0,
  poolQuery: '',
  namesTimer: 0,
};

const els = {};
let bus = null;
let boardWindow = null;

/* ---------------- start ---------------- */
function boot() {
  cacheEls();
  loadSettings();
  bind();
  startClockLoop();
  bus = new Bus('main', onBus);
  renderPlayers();
  renderPool();
  renderSetup();
  renderAll();
  loadIndex()
    .then((packs) => {
      H.packs = packs.filter((p) => !EXCLUDED.has(p.id));
      H.selected = new Set(H.packs.map((p) => p.id));
      renderPool();
      updateSetupValidation();
      sendState();
    })
    .catch((error) => {
      toast(error.message, true, 6000);
      $('#pool').textContent = 'Nie udało się wczytać bazy kategorii. Otwórz grę przez HTTP.';
    });
}

function cacheEls() {
  els.setupView = $('#setup-view');
  els.gameView = $('#game-view');
  els.setupFloor = $('#setup-floor');
  els.floorPlaceholder = $('#floor-placeholder');
  els.setupLegend = $('#setup-legend');
  els.gridInfo = $('#grid-info');
  els.playerNames = $('#player-names');
  els.pool = $('#pool');
  els.poolSearch = $('#pool-search');
  els.poolCount = $('#pool-count');
  els.start = $('#start-game');
  els.shuffle = $('#shuffle-board');
  els.note = $('#setup-note');
  els.editor = $('#tile-editor');
  els.editorTitle = $('#editor-title');
  els.editorOwner = $('#editor-owner');
  els.editorSearch = $('#editor-search');
  els.editorResults = $('#editor-results');
  els.gameFloor = $('#game-floor');
  els.gameLegend = $('#game-legend');
  els.floorStatus = $('#floor-status');
  els.duelHead = $('#duel-head');
  els.clockA = $('#clock-a');
  els.clockB = $('#clock-b');
  els.actionContent = $('#action-content');
  els.actionCard = $('#action-card');
  els.duelCard = $('#duel-card');
  els.duelCat = $('#duel-cat');
  els.duelImg = $('#duel-img');
  els.duelBg = $('#duel-host-bg');
  els.duelText = $('#duel-host-text');
  els.duelLoading = $('#duel-loading');
  els.duelAnswer = $('#duel-answer');
  els.duelMeta = $('#duel-meta');
  els.controls = $('#duel-controls');
  els.btnOk = $('#btn-ok');
  els.btnPass = $('#btn-pass');
  els.duelPrompt = $('#duel-host-prompt');
  els.duelHint = $('#duel-host-hint');
  els.overlay = $('#overlay');
  els.overlayCard = $('#overlay-card');
  els.phaseKicker = $('#phase-kicker');
  els.phaseTitle = $('#phase-title');
  els.connDot = $('#conn-dot');
  els.connText = $('#conn-text');
}

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {}
  H.count = Math.min(8, Math.max(2, Number(saved.count) || 4));
  H.turnSeconds = [30, 45, 60, 75].includes(Number(saved.turnSeconds)) ? Number(saved.turnSeconds) : 45;
  H.logoBlur = saved.logoBlur !== false;
  H.names = Array.from({ length: 8 }, (_, i) => (Array.isArray(saved.names) && saved.names[i]) || 'Gracz ' + (i + 1));
  buildPlayers();
  $('#blur-logos').checked = H.logoBlur;
  document.querySelectorAll('#count-seg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.count) === H.count)));
  document.querySelectorAll('#clock-seg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sec) === H.turnSeconds)));
}

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ count: H.count, turnSeconds: H.turnSeconds, logoBlur: H.logoBlur, names: H.names })
    );
  } catch {}
}

function buildPlayers() {
  H.players = Array.from({ length: H.count }, (_, i) => ({
    id: 'p' + i,
    name: H.names[i] || 'Gracz ' + (i + 1),
    color: COLORS[i % COLORS.length],
    alive: true,
  }));
}

/* ---------------- bind ---------------- */
function bind() {
  // Bezpośredni kanał dla okna boardu otwartego z tego przycisku.
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.t !== 'hello') return;
    H.boardSeen = Date.now();
    sendState();
  });
  $('#count-seg').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-count]');
    if (!btn) return;
    const next = Number(btn.dataset.count);
    if (next === H.count) return;
    H.count = next;
    document.querySelectorAll('#count-seg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.count) === H.count)));
    buildPlayers();
    H.tiles = [];
    H.selectedKey = null;
    renderPlayers();
    renderSetup();
    renderAll();
    updateSetupValidation();
    sendState();
    saveSettings();
  });

  $('#clock-seg').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-sec]');
    if (!btn) return;
    H.turnSeconds = Number(btn.dataset.sec);
    document.querySelectorAll('#clock-seg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sec) === H.turnSeconds)));
    saveSettings();
  });

  $('#blur-logos').addEventListener('change', (event) => {
    H.logoBlur = event.target.checked;
    saveSettings();
    sendState();
  });

  els.poolSearch.addEventListener('input', () => {
    H.poolQuery = els.poolSearch.value.trim();
    renderPool();
  });

  $('#pool-all').addEventListener('click', () => {
    H.selected = new Set(H.packs.map((p) => p.id));
    renderPool();
    updateSetupValidation();
  });
  $('#pool-none').addEventListener('click', () => {
    H.selected.clear();
    renderPool();
    updateSetupValidation();
  });

  els.shuffle.addEventListener('click', shuffleBoard);
  els.start.addEventListener('click', startGame);
  $('#open-board').addEventListener('click', openBoard);
  $('#fullscreen').addEventListener('click', toggleFullscreen);
  $('#editor-close').addEventListener('click', () => {
    H.selectedKey = null;
    renderSetup();
  });
  els.editorOwner.addEventListener('change', () => {
    const tile = selectedTile();
    if (!tile) return;
    tile.owner = els.editorOwner.value;
    renderSetup();
    renderGame();
    sendState();
    updateSetupValidation();
  });
  els.editorSearch.addEventListener('input', renderEditorResults);
  els.setupFloor.addEventListener('click', (event) => {
    const cell = event.target.closest('.floor-tile');
    if (!cell) return;
    H.selectedKey = cell.dataset.key;
    renderSetup();
  });
  els.gameFloor.addEventListener('click', (event) => {
    if (H.phase !== 'board') return;
    const cell = event.target.closest('.floor-tile');
    if (!cell) return;
    const key = cell.dataset.key;
    const tile = H.tiles.find((t) => keyOf(t) === key);
    if (!tile) return;

    if (tile.owner === H.challengerId) {
      const options = sourceOptions(H.tiles, H.challengerId, H.rows, H.cols);
      if (!options.some((t) => keyOf(t) === key)) {
        toast('To pole nie sąsiaduje z żadnym polem przeciwnika.', true);
        return;
      }
      H.sourceKey = key;
      H.targets = targetsFrom(H.tiles, H.challengerId, key, H.rows, H.cols).map(keyOf);
      renderAll();
      sendState();
      return;
    }

    if (!H.sourceKey) {
      toast('Najpierw wybierz swoje pole, z którego atakujesz.', true);
      return;
    }
    if (!H.targets.includes(key)) {
      toast('To pole nie sąsiaduje z wybranym polem atakującym.', true);
      return;
    }
    const source = H.tiles.find((t) => keyOf(t) === H.sourceKey);
    if (source) startDuel(source, tile);
  });
  els.btnOk.addEventListener('click', correct);
  els.btnPass.addEventListener('click', pass);
  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.target.matches('input, textarea, select')) return;
    const key = event.key.toLowerCase();
    if (H.phase === 'duel' && (key === 'd' || key === 'enter' || key === 'arrowright')) {
      event.preventDefault();
      correct();
    } else if (H.phase === 'duel' && (key === 'p' || key === 'arrowleft' || key === ' ')) {
      event.preventDefault();
      pass();
    }
  });
  window.addEventListener('beforeunload', () => bus?.close());
}

/* ---------------- setup ---------------- */
function renderPlayers() {
  els.playerNames.innerHTML = '';
  for (let i = 0; i < H.count; i++) {
    const row = document.createElement('label');
    row.className = 'player-name-row';
    const dot = document.createElement('span');
    dot.className = 'player-dot';
    dot.style.background = COLORS[i % COLORS.length];
    const input = document.createElement('input');
    input.className = 'input';
    input.maxLength = 18;
    input.value = H.names[i] || 'Gracz ' + (i + 1);
    input.dataset.index = String(i);
    input.addEventListener('input', () => {
      H.names[i] = input.value;
      H.players[i].name = input.value.trim() || 'Gracz ' + (i + 1);
      saveSettings();
      clearTimeout(H.namesTimer);
      H.namesTimer = setTimeout(() => {
        renderSetupLegend();
        renderGameLegend();
        renderPlayerList();
        sendState();
      }, 220);
    });
    row.append(dot, input);
    els.playerNames.appendChild(row);
  }
}

function renderPool() {
  if (!H.packs.length) return;
  const query = H.poolQuery.toLowerCase();
  const list = H.packs.filter((p) => !query || (p.name + ' ' + p.group).toLowerCase().includes(query));
  els.pool.innerHTML = '';
  list.forEach((pack) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pool-chip';
    btn.setAttribute('aria-pressed', String(H.selected.has(pack.id)));
    btn.dataset.id = pack.id;
    const icon = document.createElement('span');
    icon.className = 'pool-emoji';
    icon.textContent = pack.icon || '🎯';
    const body = document.createElement('span');
    body.className = 'pool-body';
    const name = document.createElement('span');
    name.className = 'pool-name';
    name.textContent = pack.name;
    const meta = document.createElement('span');
    meta.className = 'pool-meta';
    meta.textContent = pack.live ? pack.group + ' · z Wikipedii na żywo' : pack.group + ' · ' + pack.count + ' pytań';
    body.append(name, meta);
    btn.append(icon, body);
    btn.addEventListener('click', () => {
      if (H.selected.has(pack.id)) H.selected.delete(pack.id);
      else H.selected.add(pack.id);
      btn.setAttribute('aria-pressed', String(H.selected.has(pack.id)));
      updateSetupValidation();
    });
    els.pool.appendChild(btn);
  });
  if (!list.length) {
    els.pool.textContent = 'Brak kategorii dla „' + H.poolQuery + '”.';
  }
  updatePoolCount();
}

function requiredCats() {
  return pickGrid(H.count).total;
}

function updatePoolCount() {
  els.poolCount.textContent = 'wybrano ' + H.selected.size + ' · potrzeba ' + requiredCats();
}

function renderSetup() {
  const has = H.tiles.length > 0;
  els.floorPlaceholder.hidden = has;
  els.setupFloor.hidden = !has;
  if (!has) {
    els.setupFloor.innerHTML = '';
    els.setupLegend.innerHTML = '';
    els.gridInfo.textContent = 'jeszcze nie wylosowana';
    els.editor.hidden = true;
    return;
  }
  els.setupFloor.style.setProperty('--cols', String(H.cols));
  els.setupFloor.style.setProperty('--rows', String(H.rows));
  els.setupFloor.innerHTML = '';
  H.tiles.forEach((tile) => {
    els.setupFloor.appendChild(makeTile(tile, { setup: true }));
  });
  const counts = H.players.map((p) => territory(H.tiles, p.id).length);
  const equal = counts.every((n) => n === counts[0]);
  els.gridInfo.textContent = H.cols + ' × ' + H.rows + ' · ' + (equal ? counts[0] + ' ' + pluralPoles(counts[0]) + ' na gracza' : H.tiles.length + ' ' + pluralPoles(H.tiles.length));
  renderSetupLegend();
  renderEditor();
  updatePoolCount();
  updateSetupValidation();
}

function makeTile(tile, opts = {}) {
  const player = H.players.find((p) => p.id === tile.owner);
  const key = keyOf(tile);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'floor-tile';
  btn.dataset.key = key;
  btn.style.setProperty('--pc', player?.color || '#667');
  btn.title = tile.cat.name + ' · ' + (player?.name || '');
  const cat = document.createElement('span');
  cat.className = 'tile-cat';
  cat.textContent = shortCategory(tile.cat.name);
  const dot = document.createElement('span');
  dot.className = 'tile-dot';
  btn.append(cat, dot);

  if (opts.setup) {
    if (H.selectedKey === key) btn.classList.add('selected');
    return btn;
  }

  if (sameCategoryNeighbor(H.tiles, tile, H.rows, H.cols)) btn.classList.add('same-cat');
  const merge = mergeInfo(H.tiles, tile, H.rows, H.cols);
  if (merge.merged) {
    btn.classList.add('merged');
    if (merge.up) btn.classList.add('merge-up');
    if (merge.down) btn.classList.add('merge-down');
    if (merge.left) btn.classList.add('merge-left');
    if (merge.right) btn.classList.add('merge-right');
  }
  if (merge.continuation) btn.classList.add('merge-cont');

  const groups = groupState();
  markGroup(btn, tile, key, groups.options, 'group-option');
  markGroup(btn, tile, key, groups.source, 'group-source');
  markGroup(btn, tile, key, groups.targets, 'group-target');

  if (H.phase === 'board') {
    const ownSources = sourceOptions(H.tiles, H.challengerId, H.rows, H.cols);
    if (tile.owner === H.challengerId && ownSources.some((t) => keyOf(t) === key)) {
      btn.classList.add('source-option');
    }
    if (H.sourceKey === key) btn.classList.add('source');
    if (H.targets.includes(key)) {
      btn.classList.add('target');
      const attack = document.createElement('span');
      attack.className = 'tile-attack';
      attack.textContent = '!';
      btn.appendChild(attack);
    }
  }

  if (H.duel) {
    const isA = tile.owner === H.duel.challengerId;
    const isB = tile.owner === H.duel.defenderId;
    if (isA) btn.classList.add('challenger');
    if (isB) btn.classList.add('defender');
    if (!isA && !isB) btn.classList.add('dim');
    if (key === H.duel.tileKey) btn.classList.add('duel-tile');
  }

  if (H.conquest) {
    if (H.conquest.cells.includes(key)) btn.classList.add('conquered');
    if (tile.owner === H.conquest.winnerId) btn.classList.add('winner');
  }

  if (H.phase === 'gameOver' && tile.owner === H.winnerId) btn.classList.add('winner');
  return btn;
}

/** Zbiory pól należących do całych grup: opcje ataku, wybrane źródło,
 *  cele i uczestnicy pojedynku. Dzięki temu obwódka obejmuje cały kształt,
 *  a nie tylko kafelek, w który kliknięto. */
function groupState() {
  const out = { options: new Set(), source: new Set(), targets: new Set() };
  const addGroup = (set, tile) => {
    if (!tile) return;
    categoryGroup(H.tiles, tile, H.rows, H.cols).forEach((item) => set.add(keyOf(item)));
  };
  if (H.phase === 'board') {
    sourceOptions(H.tiles, H.challengerId, H.rows, H.cols).forEach((tile) => addGroup(out.options, tile));
    addGroup(out.source, H.tiles.find((tile) => keyOf(tile) === H.sourceKey));
    H.targets.forEach((key) => addGroup(out.targets, H.tiles.find((tile) => keyOf(tile) === key)));
  }
  if (H.duel) {
    addGroup(out.source, H.tiles.find((tile) => keyOf(tile) === H.duel.sourceKey));
    addGroup(out.targets, H.tiles.find((tile) => keyOf(tile) === H.duel.tileKey));
  }
  return out;
}

function markGroup(node, tile, key, set, className) {
  if (!set.has(key)) return;
  node.classList.add(className);
  const edge = mergeInfo(H.tiles, tile, H.rows, H.cols);
  if (!edge.up) node.classList.add('g-edge-top');
  if (!edge.down) node.classList.add('g-edge-bottom');
  if (!edge.left) node.classList.add('g-edge-left');
  if (!edge.right) node.classList.add('g-edge-right');
}

function renderSetupLegend() {
  els.setupLegend.innerHTML = '';
  H.players.forEach((player) => {
    const count = territory(H.tiles, player.id).length;
    const chip = document.createElement('span');
    chip.className = 'legend-chip';
    chip.style.setProperty('--pc', player.color);
    chip.textContent = player.name + ' · ' + count + ' ' + pluralPoles(count);
    els.setupLegend.appendChild(chip);
  });
}

function renderEditor() {
  const tile = selectedTile();
  if (!tile) {
    els.editor.hidden = true;
    return;
  }
  els.editor.hidden = false;
  els.editorTitle.textContent = 'Pole ' + (tile.r + 1) + ',' + (tile.c + 1) + ' · ' + tile.cat.name;
  els.editorOwner.innerHTML = '';
  H.players.forEach((player) => {
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = player.name;
    option.selected = player.id === tile.owner;
    els.editorOwner.appendChild(option);
  });
  renderEditorResults();
}

function renderEditorResults() {
  const tile = selectedTile();
  if (!tile) return;
  const query = els.editorSearch.value.trim().toLowerCase();
  const results = H.packs
    .filter((p) => !query || (p.name + ' ' + p.group).toLowerCase().includes(query))
    .slice(0, 10);
  els.editorResults.innerHTML = '';
  results.forEach((pack) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-result';
    btn.setAttribute('aria-pressed', String(pack.id === tile.cat.id));
    const name = document.createElement('span');
    name.textContent = (pack.icon || '🎯') + ' ' + pack.name;
    const meta = document.createElement('small');
    meta.textContent = pack.live ? pack.group + ' · z Wikipedii' : pack.group + ' · ' + pack.count;
    btn.append(name, meta);
    btn.addEventListener('click', () => {
      tile.cat = { ...pack };
      renderSetup();
      sendState();
    });
    els.editorResults.appendChild(btn);
  });
}

function selectedTile() {
  if (!H.selectedKey) return null;
  return H.tiles.find((t) => keyOf(t) === H.selectedKey) || null;
}

function updateSetupValidation() {
  if (!H.packs.length) return;
  const need = requiredCats();
  const poolOk = H.selected.size >= need;
  const hasTiles = H.tiles.length > 0;
  const allOwned = hasTiles && H.players.every((p) => territory(H.tiles, p.id).length > 0);
  els.shuffle.disabled = !poolOk;
  els.start.disabled = !hasTiles || !allOwned;
  if (!poolOk) {
    els.note.textContent = 'Za mało kategorii w puli: potrzebujesz ' + need + ', masz ' + H.selected.size + '.';
    els.note.classList.add('warn');
  } else if (!hasTiles) {
    els.note.textContent = 'Kliknij „Losuj planszę”. Dobiorę wymiary tak, żeby każde pole podzieliło się równo.';
    els.note.classList.remove('warn');
  } else if (!allOwned) {
    els.note.textContent = 'Każdy gracz musi mieć co najmniej jedno pole. Popraw przypisanie w edytorze.';
    els.note.classList.add('warn');
  } else {
    els.note.textContent = 'Gotowe. Możesz jeszcze kliknąć pole i zmienić właściciela lub kategorię.';
    els.note.classList.remove('warn');
  }
  updatePoolCount();
}

function shuffleBoard() {
  const grid = pickGrid(H.count);
  if (H.selected.size < grid.total) {
    toast('Za mało kategorii w puli: potrzebujesz ' + grid.total + ', masz ' + H.selected.size + '.', true);
    return;
  }
  H.rows = grid.rows;
  H.cols = grid.cols;
  H.players.forEach((p) => (p.alive = true));
  H.selectedKey = null;
  try {
    H.tiles = buildTiles(
      H.players,
      H.packs.filter((p) => H.selected.has(p.id)),
      H.rows,
      H.cols
    );
  } catch (error) {
    toast(error.message, true);
    return;
  }
  renderSetup();
  renderAll();
  sendState();
  // Rozgrzewamy kategorie już po losowaniu planszy, a nie dopiero w chwili
  // startu. Gracz ma wtedy czas ustawić imiona, zanim zacznie się pojedynek.
  void warmupGameImages();
  toast('Losowanie gotowe: ' + H.cols + ' × ' + H.rows + ', po ' + grid.per + ' ' + pluralPoles(grid.per) + ' na gracza.');
}

function startGame() {
  if (!H.tiles.length) {
    toast('Najpierw wylosuj planszę.', true);
    return;
  }
  const missing = H.players.find((p) => territory(H.tiles, p.id).length === 0);
  if (missing) {
    toast('Gracz „' + missing.name + '” nie ma żadnego pola.', true);
    return;
  }
  H.phase = 'board';
  H.result = null;
  H.winnerId = null;
  H.duel = null;
  H.selectedKey = null;
  H.challengerId = null;
  H.sourceKey = null;
  H.targets = [];
  H.conquest = null;
  H.used = new Set();
  H.overlayKey = '';
  H.turnIndex = Math.floor(Math.random() * H.players.length) - 1;
  nextTurn();
}

let warmupToken = 0;
async function warmupGameImages() {
  const token = ++warmupToken;
  const seen = new Set();
  const cats = H.tiles.map((tile) => tile.cat).filter((cat) => cat && !seen.has(cat.id) && seen.add(cat.id));
  for (const cat of cats) {
    if (token !== warmupToken) return;
    try {
      const pack = await loadPack(cat);
      if (token !== warmupToken) return;
      await preloadImages(pack.items.map((q) => q.img), {
        limit: 120,
        concurrency: 2,
        delay: 90,
      });
    } catch {
      // Kategoria z problemem sieciowym nie może zatrzymać gry.
    }
  }
}

/* ---------------- game / duel ---------------- */
function nextTurn() {
  if (H.phase === 'gameOver') return;
  if (alive(H.players).length <= 1) {
    finishGame();
    return;
  }
  const start = Number.isInteger(H.turnIndex) ? H.turnIndex : -1;
  for (let step = 1; step <= H.players.length; step++) {
    const idx = (start + step) % H.players.length;
    const player = H.players[idx];
    if (player.alive === false) continue;
    const sources = sourceOptions(H.tiles, player.id, H.rows, H.cols);
    if (!sources.length) continue;
    H.turnIndex = idx;
    H.challengerId = player.id;
    H.sourceKey = null;
    H.targets = [];
    H.phase = 'board';
    H.duel = null;
    H.result = null;
    H.conquest = null;
    H.introUntil = 0;
    H.overlayKey = '';
    renderAll();
    sendState();
    return;
  }
  finishGame();
}

async function startDuel(sourceTile, targetTile) {
  if (H.phase !== 'board' || !H.challengerId) return;
  if (!sourceTile || !targetTile) return;
  if (sourceTile.owner !== H.challengerId) return;
  if (targetTile.owner === H.challengerId) return;
  if (Math.abs(sourceTile.r - targetTile.r) + Math.abs(sourceTile.c - targetTile.c) !== 1) return;

  const token = ++H.token;
  const challenger = H.players.find((p) => p.id === H.challengerId);
  const defender = H.players.find((p) => p.id === targetTile.owner);
  if (!challenger || !defender) return;

  // Odliczanie zaczyna się od razu po wybraniu pola. Wczytywanie paczki
  // może jeszcze chwilę trwać, ale gracze nie patrzą wtedy na sam napis
  // „Przygotowuję pytanie…” — widzą już pojedynek i 3-2-1.
  H.phase = 'duelIntro';
  H.introUntil = Date.now() + 3000;
  H.targets = [];
  H.duel = {
    tileKey: keyOf(targetTile),
    sourceKey: keyOf(sourceTile),
    challengerId: challenger.id,
    defenderId: defender.id,
    // Pytania są z kategorii pola, z którego atakuje pretendent.
    category: { ...sourceTile.cat },
    sourceCat: { ...sourceTile.cat },
    // Kategoria atakowanego pola jest nagrodą: po pojedynku przyjmują ją
    // oba pola — atakujące i atakowane.
    targetCat: { ...targetTile.cat },
    clocks: { [challenger.id]: H.turnSeconds * 1000, [defender.id]: H.turnSeconds * 1000 },
    active: challenger.id,
    deadline: null,
    q: null,
    queue: [],
    queuePos: 0,
    pack: null,
    qNumber: 0,
    missing: 0,
    reveal: null,
  };
  renderAll();
  sendState();
  setTimeout(() => {
    if (token === H.token && H.phase === 'duelIntro') beginDuel();
  }, 3000);

  try {
    const pack = await loadPack(sourceTile.cat);
    if (token !== H.token) return;
    H.duel.pack = pack;
    const next = makeQueue(pack, H.used);
    if (token !== H.token) return;
    H.duel.queue = next.queue;
    H.duel.queuePos = 0;
    // Wczytujemy zdjęcia całej kolejki pojedynku w tle. Odliczanie już
    // trwa, więc nie blokujemy nim ekranu graczy.
    preloadImages(next.queue.map((item) => item.img), {
      limit: Math.min(80, next.queue.length),
      concurrency: 3,
      delay: 70,
    });
    renderAll();
    sendState();
    // Jeżeli wczytywanie trwało dłużej niż 3 sekundy, startujemy od razu;
    // w przeciwnym razie zrobi to wcześniej ustawiony timer odliczania.
    if (H.phase === 'duelIntro' && Date.now() >= H.introUntil) beginDuel();
  } catch (error) {
    if (token !== H.token) return;
    H.phase = 'board';
    H.duel = null;
    H.sourceKey = null;
    H.targets = [];
    renderAll();
    sendState();
    toast('Nie udało się wczytać kategorii: ' + error.message, true);
  }
}

async function beginDuel() {
  if (!H.duel || H.phase !== 'duelIntro') return;
  // Timer może minąć przed końcem pobierania paczki. Wtedy poczekamy na
  // wywołanie z startDuel po załadowaniu kolejki, zamiast zaczynać bez pytań.
  if (!H.duel.pack || !H.duel.queue?.length) return;
  H.phase = 'duel';
  H.introUntil = 0;
  await advanceQuestion();
  if (!H.duel) return;
  H.duel.deadline = Date.now() + H.duel.clocks[H.duel.active];
  H.busy = false;
  renderAll();
  sendState();
}

async function advanceQuestion() {
  if (!H.duel?.pack) return;
  // Paczki są lokalne i sprawdzone. Nie dociągamy już niczego z Wikipedii
  // w środku pojedynku, bo to właśnie powodowało powtórki i 10-sekundowe
  // oczekiwanie na zdjęcie.
  if (H.duel.queuePos >= H.duel.queue.length) {
    const next = makeQueue(H.duel.pack, H.used);
    H.duel.queue = next.queue;
    H.duel.queuePos = 0;
  }
  const pack = H.duel.pack;
  const q = H.duel.queue[H.duel.queuePos++] || null;
  H.duel.q = q;
  if (!q) return;
  H.duel.qNumber += 1;
  H.used.add(pack.id + '|' + answerKey(q.a));
  markSeen(pack.id, q.a);
  preloadImages([q.img, H.duel.queue[H.duel.queuePos]?.img].filter(Boolean));
}

function preloadNext() {
  const next = H.duel?.queue[H.duel.queuePos];
  if (next?.img) preloadImages([next.img]);
}

function correct() {
  if (H.phase !== 'duel' || H.busy || !H.duel?.q || H.duel.reveal) return;
  const d = H.duel;
  const left = d.deadline ? d.deadline - Date.now() : d.clocks[d.active];
  if (left <= 0) {
    endDuel(d.active);
    return;
  }
  d.clocks[d.active] = left;
  d.deadline = null;
  d.reveal = { answer: d.q.a, type: 'correct', until: Date.now() + 3000, key: Date.now() };
  H.busy = true;
  renderAll();
  sendState();

  const revealKey = d.reveal.key;
  const other = d.active === d.challengerId ? d.defenderId : d.challengerId;
  setTimeout(async () => {
    if (H.phase !== 'duel' || !H.duel || H.duel.reveal?.key !== revealKey) return;
    H.duel.reveal = null;
    H.duel.active = other;
    // Dopiero teraz zaczyna lecieć zegar przeciwnika.
    H.duel.deadline = Date.now() + H.duel.clocks[other];
    await advanceQuestion();
    H.busy = false;
    renderAll();
    sendState();
  }, 3000);
}

function pass() {
  if (H.phase !== 'duel' || H.busy || !H.duel?.q || H.duel.reveal) return;
  const d = H.duel;
  const left = d.deadline ? d.deadline - Date.now() : d.clocks[d.active];
  if (left <= 0) {
    endDuel(d.active);
    return;
  }
  // PASS nie zabiera czasu. Zegar działa dalej bez przerwy i bez kary.
  d.clocks[d.active] = left;
  d.reveal = { answer: d.q.a, type: 'pass', until: Date.now() + 3000, key: Date.now() };
  H.busy = true;
  renderAll();
  sendState();

  const revealKey = d.reveal.key;
  setTimeout(async () => {
    if (H.phase !== 'duel' || !H.duel || H.duel.reveal?.key !== revealKey) return;
    H.duel.reveal = null;
    await advanceQuestion();
    H.busy = false;
    renderAll();
    sendState();
  }, 3000);
}

function endDuel(loserId) {
  if (!H.duel || !['duel', 'duelIntro', 'duelLoading'].includes(H.phase)) return;
  const d = H.duel;
  const loser = H.players.find((p) => p.id === loserId);
  const winner = H.players.find((p) => p.id === (loserId === d.challengerId ? d.defenderId : d.challengerId));
  if (!loser || !winner) return;

  // Pojedynek toczy się w kategorii pola atakującego, ale nagrodą jest
  // kategoria pola atakowanego. Po zakończeniu oba pola (atakujące oraz
  // atakowane) przyjmują kategorię atakowanego i należą do zwycięzcy.
  const sourceTile = H.tiles.find((tile) => keyOf(tile) === d.sourceKey) || null;
  const targetTile = H.tiles.find((tile) => keyOf(tile) === d.tileKey) || null;
  if (!sourceTile || !targetTile) return;
  const prizeCategory = { ...(d.targetCat || d.category) };
  // Przejmujemy całe scalone grupy, nie pojedyncze kafelki. Inaczej duże
  // pole zostawało częściowo u starego gracza i pojawiało się „dodatkowe”
  // pole bez nazwy. Grupy liczymy przed zmianą kategorii.
  const result = captureDuelTerritory(
    H.tiles,
    d.sourceKey,
    d.tileKey,
    winner.id,
    prizeCategory,
    H.rows,
    H.cols,
  );
  if (!result) return;
  const { sourceGroup, targetGroup, captured } = result;
  const remaining = territory(H.tiles, loser.id).length;
  loser.alive = remaining > 0;
  // Pretendent zdobywa grupę atakowaną; obrońca, który wygrał, zdobywa
  // grupę, z której pretendent atakował.
  const gained = winner.id === d.challengerId ? targetGroup.length : sourceGroup.length;
  H.result = null;
  H.challengerId = winner.id;
  H.duel = null;
  H.sourceKey = null;
  H.targets = [];
  H.busy = false;
  H.phase = 'conquest';
  H.conquest = {
    winnerId: winner.id,
    loserId: loser.id,
    gained,
    category: { ...prizeCategory },
    cells: captured.map(keyOf),
    at: Date.now(),
    until: Date.now() + 2600,
  };
  H.overlayKey = '';
  renderAll();
  sendState();

  const at = H.conquest.at;
  setTimeout(() => {
    if (H.phase !== 'conquest' || H.conquest?.at !== at) return;
    H.conquest = null;
    H.overlayKey = '';
    const owners = new Set(H.tiles.map((tile) => tile.owner));
    if (alive(H.players).length <= 1 || owners.size <= 1) finishGame();
    else {
      H.phase = 'board';
      nextTurn();
    }
  }, 2600);
}

function finishGame() {
  const remaining = alive(H.players);
  H.phase = 'gameOver';
  H.winnerId = remaining[0]?.id || H.players[0]?.id;
  H.result = null;
  H.duel = null;
  H.conquest = null;
  H.sourceKey = null;
  H.targets = [];
  renderAll();
  sendState();
}

/* ---------------- UI render ---------------- */
function renderAll() {
  const inSetup = H.phase === 'setup';
  els.setupView.hidden = !inSetup;
  els.gameView.hidden = inSetup;
  els.controls.hidden = H.phase !== 'duel';
  els.duelHead.hidden = !H.duel;
  els.duelCard.hidden = !H.duel;
  // W pojedynku panel z instrukcją zajmował pół ekranu i wypychał
  // odpowiedź poza widok. Zostaje tylko karta pytania i duża odpowiedź.
  els.actionCard.hidden = ['duelLoading', 'duelIntro', 'duel', 'conquest'].includes(H.phase);
  renderHeader();
  if (inSetup) {
    renderSetup();
  } else {
    renderGame();
  }
  renderOverlay();
}

function renderHeader() {
  const labels = {
    setup: ['KONFIGURACJA', 'Ustaw grę'],
    board: ['RUNDA POJEDYNKÓW', 'Wybór pola'],
    duelLoading: ['POJEDYNEK', 'Przygotowanie'],
    duelIntro: ['POJEDYNEK', 'Za chwilę'],
    duel: ['POJEDYNEK', 'Walka na zegary'],
    conquest: ['POJEDYNEK', 'Przejęcie terenu'],
    gameOver: ['KONIEC GRY', 'Zwycięzca'],
  };
  const pair = labels[H.phase] || labels.setup;
  els.phaseKicker.textContent = pair[0];
  els.phaseTitle.textContent = pair[1];
}

function renderGame() {
  els.gameFloor.style.setProperty('--cols', String(H.cols));
  els.gameFloor.style.setProperty('--rows', String(H.rows));
  els.gameFloor.innerHTML = '';
  if (!H.tiles.length) return;
  H.tiles.forEach((tile) => els.gameFloor.appendChild(makeTile(tile)));
  renderGameLegend();
  renderStatus();
  renderAction();
  renderDuelCard();
  renderClocks(true);
}

function renderGameLegend() {
  if (!els.gameLegend) return;
  els.gameLegend.innerHTML = '';
  const counts = tileCounts(H.tiles);
  H.players.forEach((player) => {
    if (player.alive === false) return;
    const chip = document.createElement('span');
    chip.className = 'legend-chip';
    chip.style.setProperty('--pc', player.color);
    chip.textContent = player.name + ' · ' + (counts[player.id] || 0) + ' ' + pluralPoles(counts[player.id] || 0);
    els.gameLegend.appendChild(chip);
  });
}

function renderStatus() {
  if (H.phase === 'duel' || H.phase === 'duelIntro' || H.phase === 'duelLoading') {
    const ch = H.players.find((p) => p.id === H.duel?.challengerId);
    const de = H.players.find((p) => p.id === H.duel?.defenderId);
    els.floorStatus.textContent = ch && de ? ch.name + ' vs ' + de.name + ' · ' + (H.duel?.category?.name || '') : 'Pojedynek';
  } else if (H.phase === 'board') {
    const ch = H.players.find((p) => p.id === H.challengerId);
    const source = H.tiles.find((t) => keyOf(t) === H.sourceKey);
    els.floorStatus.textContent = !ch
      ? 'Tura'
      : source
        ? 'Tura: ' + ch.name + ' · atak z „' + source.cat.name + '”'
        : 'Tura: ' + ch.name + ' — wybierz swoje pole';
  } else if (H.phase === 'conquest' && H.conquest) {
    const w = H.players.find((p) => p.id === H.conquest.winnerId);
    els.floorStatus.textContent = (w?.name || '') + ' przejmuje ' + H.conquest.gained + ' ' + pluralPoles(H.conquest.gained) + ' · ' + H.conquest.category.name;
  } else if (H.phase === 'gameOver') {
    const w = H.players.find((p) => p.id === H.winnerId);
    els.floorStatus.textContent = w ? 'Wygrywa ' + w.name : 'Koniec gry';
  } else {
    els.floorStatus.textContent = '—';
  }
}

function renderAction() {
  const box = els.actionContent;
  box.innerHTML = '';

  if (H.phase === 'board') {
    const ch = H.players.find((p) => p.id === H.challengerId);
    if (!ch) {
      box.append(el('div', 'eyebrow', 'Tura'), el('h3', 'action-title', 'Wybierz gracza'));
      renderPlayerList();
      return;
    }
    const source = H.tiles.find((t) => keyOf(t) === H.sourceKey);
    box.append(
      el('div', 'eyebrow', 'Tura ' + (H.turnIndex + 1)),
      el('h3', 'action-title', ch.name),
      el(
        'p',
        'action-text',
        source
          ? 'Atakujesz z pola o kategorii „' + source.cat.name + '”. Kliknij podświetlone sąsiednie pole przeciwnika.'
          : 'Kliknij jedno ze swoich podświetlonych pól, z którego chcesz zaatakować. Potem wybierz sąsiednie pole przeciwnika (góra, dół, lewo, prawo).'
      )
    );
    if (source) {
      const hint = el('div', 'duel-hint');
      hint.textContent = 'Pytania są z kategorii pola, z którego atakujesz. Po pojedynku oba pola przyjmą kategorię atakowanego pola, a zwycięzca będzie miał oba.';
      box.appendChild(hint);
      const change = el('button', 'btn wide', 'Zmień pole atakujące');
      change.addEventListener('click', () => {
        H.sourceKey = null;
        H.targets = [];
        renderAll();
        sendState();
      });
      box.appendChild(change);
    }
    renderPlayerList();
    return;
  }

  if (H.phase === 'duelLoading' || H.phase === 'duelIntro' || H.phase === 'duel') {
    const d = H.duel;
    const ch = H.players.find((p) => p.id === d?.challengerId);
    const de = H.players.find((p) => p.id === d?.defenderId);
    box.append(
      el('div', 'eyebrow', 'Pojedynek'),
      el('h3', 'action-title', (ch?.name || '?') + ' vs ' + (de?.name || '?')),
      el(
        'p',
        'action-text',
        'Pytania: ' + (d?.category?.name || '—') + '. Nagroda dla zwycięzcy: ' + (d?.targetCat?.name || '—') + '. DOBRZE zatrzymuje twój zegar na 3 s i przekazuje pytanie. PASS nie zabiera czasu — zegar leci dalej. Pojedynek kończy się dopiero, gdy czyjś zegar dobiegnie zera.'
      )
    );
    const note = el('div', 'duel-hint');
    note.textContent = 'Odpowiadasz DOBRZE albo PASS. Pojedynek kończy się tylko wtedy, gdy komuś skończy się czas — wtedy drugi gracz wygrywa.';
    box.appendChild(note);
    renderPlayerList();
    return;
  }

  if (H.phase === 'conquest' && H.conquest) {
    const winner = H.players.find((p) => p.id === H.conquest.winnerId);
    const loser = H.players.find((p) => p.id === H.conquest.loserId);
    box.append(
      el('div', 'eyebrow', 'Teren zdobyty'),
      el('h3', 'action-title', (winner?.name || '') + ' bierze ' + H.conquest.gained + ' ' + pluralPoles(H.conquest.gained)),
      el(
        'p',
        'action-text',
        'Kategoria „' + H.conquest.category.name + '” przechodzi na oba pola: atakujące i atakowane. ' + (loser?.name || '') + ' zachowuje resztę terytorium — gra toczy się dalej.'
      )
    );
    const note = el('div', 'duel-hint');
    note.textContent = 'Za chwilę tura następnego gracza. Nikt nie dostaje dodatkowego ataku.';
    box.appendChild(note);
    renderPlayerList();
    return;
  }

  if (H.phase === 'gameOver') {
    const winner = H.players.find((p) => p.id === H.winnerId);
    box.append(
      el('div', 'eyebrow', 'Koniec gry'),
      el('h3', 'action-title', (winner?.name || '') + ' ma całą planszę'),
      el('p', 'action-text', 'Wszystkie pola należą do zwycięzcy. To koniec rozgrywki.')
    );
    renderPlayerList();
  }
}

function renderPlayerList() {
  if (!H.players.length) return;
  const counts = tileCounts(H.tiles);
  const wrap = el('div', 'player-mini-list');
  H.players.forEach((player) => {
    const row = el('div', 'player-mini' + (player.alive === false ? ' out' : '') + (player.id === H.challengerId ? ' active' : ''));
    row.style.setProperty('--pc', player.color);
    row.append(
      el('span', 'mini-dot'),
      el('span', 'mini-name', player.name),
      el('span', 'mini-tiles', (counts[player.id] || 0) + ' ' + pluralPoles(counts[player.id] || 0))
    );
    wrap.appendChild(row);
  });
  els.actionContent.appendChild(wrap);
}

function renderDuelCard() {
  if (!H.duel) return;
  const d = H.duel;
  els.duelCat.textContent = 'Pytania: ' + d.category.name + '  ·  Nagroda: ' + (d.targetCat?.name || d.category.name);
  if (els.duelPrompt) els.duelPrompt.textContent = d.category.prompt || 'Co to jest?';
  const q = d.q;
  if (!q) {
    els.duelImg.hidden = true;
    els.duelLoading.hidden = false;
    els.duelHint.hidden = true;
    if (els.duelBg) els.duelBg.hidden = true;
    if (els.duelText) els.duelText.hidden = true;
    els.duelAnswer.textContent = '—';
    return;
  }
  if (els.duelHint) {
    els.duelHint.textContent = q.hint || '';
    els.duelHint.hidden = !q.hint;
  }
  const textMode = !q.img && Boolean(q.clue || q.text);
  if (els.duelText) {
    els.duelText.textContent = textMode ? q.clue || q.text : '';
    els.duelText.hidden = !textMode;
  }
  if (textMode) {
    els.duelImg.hidden = true;
    els.duelLoading.hidden = true;
    if (els.duelBg) els.duelBg.hidden = true;
  } else if (els.duelImg.dataset.key !== q.img) {
    els.duelImg.dataset.key = q.img;
    els.duelImg.hidden = true;
    els.duelLoading.hidden = false;
    els.duelLoading.textContent = 'Przygotowuję zdjęcie…';
    const key = q.img;
    setImageWithFallback(els.duelImg, q.img, (ok) => {
      if (els.duelImg.dataset.key !== key) return;
      els.duelLoading.hidden = true;
      els.duelImg.hidden = !ok;
      if (!ok) {
        // Nie pokazujemy komunikatu „zdjęcie niedostępne”. Jeżeli po
        // ponowieniach nie ma obrazka, pomijamy pytanie i gramy dalej.
        const duel = H.duel;
        if (!duel) return;
        duel.missing = (duel.missing || 0) + 1;
        if (duel.missing <= 3) {
          setTimeout(async () => {
            if (H.phase !== 'duel' || H.duel !== duel) return;
            await advanceQuestion();
            if (H.duel !== duel) return;
            renderAll();
            sendState();
          }, 250);
        }
      }
    });
  }
  els.duelImg.alt = q.img ? 'Zdjęcie do pytania' : 'Brak zdjęcia';
  els.duelImg.parentElement.classList.toggle('logo', LOGO_PACKS.has(d.category.id));
  if (els.duelBg) {
    els.duelBg.style.backgroundImage = q.img ? 'url("' + q.img.replace(/"/g, '%22') + '")' : '';
    els.duelBg.hidden = !q.img || LOGO_PACKS.has(d.category.id);
  }
  els.duelImg.classList.toggle('blurred', BLUR_PACKS.has(d.category.id) && H.logoBlur);
  els.duelAnswer.textContent = q.a;
  // Odpowiedź musi zmieścić się w panelu bez przewijania, także na laptopie.
  els.duelAnswer.style.fontSize = q.a.length > 55 ? 'clamp(20px, 1.9vw, 28px)' : q.a.length > 34 ? 'clamp(21px, 2vw, 31px)' : 'clamp(22px, 2.15vw, 34px)';
  els.duelMeta.textContent = 'Pytanie ' + d.qNumber + ' · pula ' + Math.max(0, d.queue.length - d.queuePos);
  // Na ekranie prowadzącego liczy się tylko duża odpowiedź. Bez dopisków
  // o karze, które wcześniej trafiały też na ekran graczy.
}

function renderClocks(rebuild = false) {
  if (!H.duel) return;
  const d = H.duel;
  const ch = H.players.find((p) => p.id === d.challengerId);
  const de = H.players.find((p) => p.id === d.defenderId);
  if (!ch || !de) return;
  if (rebuild || els.clockA.dataset.duel !== String(d.challengerId + d.defenderId + d.tileKey)) {
    els.clockA.dataset.duel = d.challengerId + d.defenderId + d.tileKey;
    els.clockB.dataset.duel = d.challengerId + d.defenderId + d.tileKey;
    fillClock(els.clockA, ch, 'PRETENDENT');
    fillClock(els.clockB, de, 'OBROŃCA');
  }
  updateClockValues();
}

function fillClock(card, player, role) {
  card.innerHTML = '';
  card.style.setProperty('--pc', player.color);
  card.append(
    el('div', 'clock-role', role),
    el('div', 'clock-name', player.name),
    el('div', 'clock-time', '—'),
    el('div', 'clock-tiles', (tileCounts(H.tiles)[player.id] || 0) + ' ' + pluralPoles(tileCounts(H.tiles)[player.id] || 0))
  );
  card.classList.toggle('active', H.duel.active === player.id);
  card.dataset.player = player.id;
}

function updateClockValues() {
  if (!H.duel) return;
  const d = H.duel;
  const now = Date.now();
  const activeLeft = d.deadline ? Math.max(0, d.deadline - now) : d.clocks[d.active];
  [els.clockA, els.clockB].forEach((card) => {
    const id = card.dataset.player;
    if (!id) return;
    const ms = id === d.active ? activeLeft : d.clocks[id];
    card.querySelector('.clock-time').textContent = fmtClock(ms);
    card.classList.toggle('active', id === d.active);
    card.classList.toggle('low', id === d.active && ms <= 10000);
  });
}

function renderOverlay() {
  const key = H.phase + '|' + (H.duel?.tileKey || '') + '|' + (H.winnerId || '') + '|' + (H.conquest?.at || '');
  if (key === H.overlayKey) return;

  H.overlayKey = key;
  const card = els.overlayCard;
  card.innerHTML = '';

  if (H.phase === 'duelLoading') {
    els.overlay.classList.remove('hidden');
    card.append(el('div', 'overlay-kicker', 'The Floor'), el('div', 'overlay-title', 'PRZYGOTOWUJEMY'), spinnerBlock('Przygotowuję pytanie…'));
    return;
  }
  if (H.phase === 'duelIntro') {
    els.overlay.classList.remove('hidden');
    const ch = H.players.find((p) => p.id === H.duel?.challengerId);
    const de = H.players.find((p) => p.id === H.duel?.defenderId);
    card.append(
      el('div', 'overlay-kicker', 'Pojedynek o „' + (H.duel?.category?.name || '') + '”'),
      el('div', 'overlay-title', ch?.name || ''),
      el('p', 'overlay-sub', 'vs ' + (de?.name || '')),
      el('div', 'countdown', '3')
    );
    return;
  }
  if (H.phase === 'gameOver') {
    els.overlay.classList.remove('hidden');
    const winner = H.players.find((p) => p.id === H.winnerId);
    card.append(
      el('div', 'overlay-kicker', 'Cała plansza zdobyta'),
      el('div', 'overlay-title', 'WYGRYWA ' + (winner?.name || '')),
      el('p', 'overlay-sub', 'Ostatni gracz na The Floor.')
    );
    return;
  }

  els.overlay.classList.add('hidden');
  card.innerHTML = '';
}

function resetToSetup() {
  H.phase = 'setup';
  H.tiles = [];
  H.duel = null;
  H.result = null;
  H.winnerId = null;
  H.challengerId = null;
  H.targets = [];
  H.players.forEach((p) => (p.alive = true));
  H.overlayKey = '';
  renderAll();
  sendState();
}

/* ---------------- tick ---------------- */
function startClockLoop() {
  setInterval(() => {
    if (H.phase === 'duel' && H.duel?.deadline) {
      const left = H.duel.deadline - Date.now();
      H.duel.clocks[H.duel.active] = Math.max(0, left);
      updateClockValues();
      if (left <= 0) endDuel(H.duel.active);
    } else {
      updateClockValues();
    }

    if (H.phase === 'duelIntro') {
      const node = els.overlayCard.querySelector('.countdown');
      if (node) node.textContent = String(Math.max(1, Math.ceil((H.introUntil - Date.now()) / 1000)));
    }

    const connected = Date.now() - H.boardSeen < 6500;
    els.connDot.classList.toggle('on', connected);
    els.connDot.classList.toggle('off', !connected);
    els.connText.textContent = connected ? 'Ekran graczy połączony' : 'Brak ekranu graczy';

    // Podczas konfiguracji ekran graczy ma od razu pokazywać wybrana
    // liczbę zawodników, nawet jeśli pojedyncza wiadomość się zgubi.
    if (Date.now() - H.lastSent > (H.phase === 'setup' ? 1000 : 600)) sendState();
  }, 100);
}

/* ---------------- sync ---------------- */
function onBus(message) {
  if (message.t === 'hello') {
    H.boardSeen = Date.now();
    sendState();
  }
}

function publicState() {
  const counts = tileCounts(H.tiles);
  const d = H.duel;
  const sources = H.phase === 'board' ? sourceOptions(H.tiles, H.challengerId, H.rows, H.cols).map(keyOf) : [];
  return {
    phase: H.phase,
    rows: H.rows,
    cols: H.cols,
    players: H.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      alive: p.alive !== false,
      tiles: counts[p.id] || 0,
    })),
    tiles: H.tiles.map((t) => ({
      r: t.r,
      c: t.c,
      owner: t.owner,
      cat: {
        id: t.cat.id,
        name: t.cat.name,
        short: shortCategory(t.cat.name),
        group: t.cat.group,
        icon: t.cat.icon,
      },
    })),
    challengerId: H.challengerId,
    sourceKey: H.sourceKey,
    sources,
    targets: H.phase === 'board' ? H.targets : [],
    duel: d
      ? {
          tileKey: d.tileKey,
          sourceKey: d.sourceKey,
          challengerId: d.challengerId,
          defenderId: d.defenderId,
          category: { id: d.category.id, name: d.category.name, icon: d.category.icon, prompt: d.category.prompt },
          q: d.q ? { img: d.q.img || '', hint: d.q.hint || '', clue: d.q.clue || d.q.text || '' } : null,
          active: d.active,
          clocks: { ...d.clocks },
          deadline: d.deadline,
          qNumber: d.qNumber,
          reveal: d.reveal,
        }
      : null,
    conquest: H.conquest,
    winnerId: H.winnerId,
    turnSeconds: H.turnSeconds,
    logoBlur: H.logoBlur,
    introUntil: H.phase === 'duelIntro' ? H.introUntil : null,
  };
}

function sendState() {
  if (!bus) return;
  H.lastSent = Date.now();
  const state = publicState();
  bus.send('state', { state });
  // Dodatkowa, bezpośrednia droga dla okna otwartego przyciskiem
  // „Ekran graczy”. Działa nawet wtedy, gdy przeglądarka blokuje
  // BroadcastChannel między oknami podglądu.
  if (boardWindow && !boardWindow.closed) {
    try {
      boardWindow.postMessage({ t: 'state', state }, location.origin);
    } catch {}
  } else if (boardWindow?.closed) {
    boardWindow = null;
  }
}

/* ---------------- helpers ---------------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function spinnerBlock(text) {
  const wrap = el('div', 'wait-card');
  const spin = el('div', 'spinner');
  wrap.append(spin, el('p', '', text));
  return wrap;
}

function openBoard() {
  const win = window.open('board.html', 'floor-board', 'popup=yes,width=1360,height=820');
  if (win) {
    boardWindow = win;
    win.focus();
  }
  else toast('Przeglądarka zablokowała okno. Zezwól na wyskakujące okna.', true, 5000);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

boot();
