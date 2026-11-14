import { $, Bus, loadIndex, loadPack, makeQueue, markSeen, toast, loadMorePack } from './common.js';
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
} from './game.js';

const LOGO_PACKS = new Set(['loga-firm', 'aplikacje-internetowe']);
const BLUR_PACKS = new Set(['loga-firm']);

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
  els.duelCard = $('#duel-card');
  els.duelCat = $('#duel-cat');
  els.duelImg = $('#duel-img');
  els.duelLoading = $('#duel-loading');
  els.duelAnswer = $('#duel-answer');
  els.duelMeta = $('#duel-meta');
  els.hostPass = $('#host-pass-note');
  els.controls = $('#duel-controls');
  els.btnOk = $('#btn-ok');
  els.btnPass = $('#btn-pass');
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
    meta.textContent = pack.group + ' · ' + pack.count + ' pytań';
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
  els.gridInfo.textContent = H.cols + ' × ' + H.rows + ' · ' + (equal ? counts[0] + ' pól na gracza' : H.tiles.length + ' pól');
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

function renderSetupLegend() {
  els.setupLegend.innerHTML = '';
  H.players.forEach((player) => {
    const count = territory(H.tiles, player.id).length;
    const chip = document.createElement('span');
    chip.className = 'legend-chip';
    chip.style.setProperty('--pc', player.color);
    chip.textContent = player.name + ' · ' + count + ' pól';
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
    meta.textContent = pack.group + ' · ' + pack.count;
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
  toast('Losowanie gotowe: ' + H.cols + ' × ' + H.rows + ', po ' + grid.per + ' pól na gracza.');
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

  H.phase = 'duelLoading';
  H.targets = [];
  H.duel = {
    tileKey: keyOf(targetTile),
    sourceKey: keyOf(sourceTile),
    challengerId: challenger.id,
    defenderId: defender.id,
    // Pytania zawsze z kategorii obrońcy (atakowanego pola).
    category: { ...targetTile.cat },
    // Kategoria, która rozleje się po wygranej challengera.
    sourceCat: { ...sourceTile.cat },
    clocks: { [challenger.id]: H.turnSeconds * 1000, [defender.id]: H.turnSeconds * 1000 },
    active: challenger.id,
    deadline: null,
    q: null,
    queue: [],
    queuePos: 0,
    pack: null,
    qNumber: 0,
    reveal: null,
    penalty: null,
  };
  renderAll();
  sendState();

  try {
    const pack = await loadPack(targetTile.cat);
    if (token !== H.token) return;
    H.duel.pack = pack;
    const next = makeQueue(pack, H.used);
    H.duel.queue = next.queue;
    H.duel.queuePos = 0;
    H.phase = 'duelIntro';
    H.introUntil = Date.now() + 3000;
    renderAll();
    sendState();
    setTimeout(() => {
      if (token === H.token && H.phase === 'duelIntro') beginDuel();
    }, 3000);
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
  if (H.duel.queuePos >= H.duel.queue.length) {
    let next = makeQueue(H.duel.pack, H.used);
    const hasUnused = next.queue.some((q) => !H.used.has(H.duel.pack.id + '|' + q.a));
    if (!hasUnused) {
      try {
        const extra = await loadMorePack(H.duel.pack);
        if (extra.length) {
          H.duel.pack.items.push(...extra);
          next = makeQueue(H.duel.pack, H.used);
        }
      } catch {}
    }
    H.duel.queue = next.queue;
    H.duel.queuePos = 0;
  }
  const pack = H.duel.pack;
  const q = H.duel.queue[H.duel.queuePos++] || null;
  H.duel.q = q;
  if (!q) return;
  H.duel.qNumber += 1;
  H.used.add(pack.id + '|' + q.a);
  markSeen(pack.id, q.a);
  preloadNext();
}

function preloadNext() {
  const next = H.duel?.queue[H.duel.queuePos];
  if (next?.img) {
    const img = new Image();
    img.src = next.img;
  }
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
  d.penalty = null;
  d.reveal = { answer: d.q.a, type: 'correct', until: Date.now() + 3000, key: Date.now() };
  H.busy = true;
  renderAll();
  sendState();

  const revealKey = d.reveal.key;
  const other = d.active === d.challengerId ? d.defenderId : d.challengerId;
  setTimeout(async () => {
    if (H.phase !== 'duel' || !H.duel || H.duel.reveal?.key !== revealKey) return;
    H.duel.reveal = null;
    H.duel.penalty = null;
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
  d.clocks[d.active] = Math.max(0, left - 3000);
  d.deadline = Date.now() + d.clocks[d.active];
  d.penalty = { playerId: d.active, at: Date.now() };
  d.reveal = { answer: d.q.a, type: 'pass', until: Date.now() + 3000, key: Date.now() };
  if (d.clocks[d.active] <= 0) {
    endDuel(d.active);
    return;
  }
  H.busy = true;
  renderAll();
  sendState();

  const revealKey = d.reveal.key;
  setTimeout(async () => {
    if (H.phase !== 'duel' || !H.duel || H.duel.reveal?.key !== revealKey) return;
    H.duel.reveal = null;
    H.duel.penalty = null;
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

  const loserTiles = territory(H.tiles, loser.id);
  // Zwycięzca rozlewa swoją kategorię na całe terytorium przegranego.
  // Kategoria przegranego znika, a zwycięzca zachowuje swoje pozostałe pola.
  const winnerCategory = winner.id === d.challengerId ? d.sourceCat : d.category;
  loserTiles.forEach((tile) => {
    tile.owner = winner.id;
    tile.cat = { ...winnerCategory };
  });
  loser.alive = false;
  const gained = loserTiles.length;
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
    category: { ...winnerCategory },
    cells: loserTiles.map(keyOf),
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
    if (alive(H.players).length <= 1) finishGame();
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
    duelLoading: ['POJEDYNEK', 'Wczytywanie'],
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
    chip.textContent = player.name + ' · ' + (counts[player.id] || 0) + ' pól';
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
    els.floorStatus.textContent = (w?.name || '') + ' przejmuje ' + H.conquest.gained + ' pól · ' + H.conquest.category.name;
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
      hint.textContent = 'Pytania będą z kategorii atakowanego pola. Twoja kategoria rozleje się na wygrane pola.';
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
      el('p', 'action-text', 'Kategoria: ' + (d?.category?.name || '—') + '. DOBRZE pokazuje odpowiedź i zatrzymuje zegar; PASS pokazuje odpowiedź, a zegar leci dalej.')
    );
    const note = el('div', 'duel-hint');
    note.textContent = 'Po DOBRZE odpowiedź jest widoczna 3 s, dopiero potem startuje zegar przeciwnika. Po PASS zegar nie staje.';
    box.appendChild(note);
    renderPlayerList();
    return;
  }

  if (H.phase === 'conquest' && H.conquest) {
    const winner = H.players.find((p) => p.id === H.conquest.winnerId);
    const loser = H.players.find((p) => p.id === H.conquest.loserId);
    box.append(
      el('div', 'eyebrow', 'Teren zdobyty'),
      el('h3', 'action-title', (winner?.name || '') + ' bierze ' + H.conquest.gained + ' pól'),
      el(
        'p',
        'action-text',
        'Kategoria „' + H.conquest.category.name + '” rozlewa się na pola ' + (loser?.name || '') + '. Kategoria przegranego znika — plansza nie ma pustych miejsc.'
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
      el('span', 'mini-tiles', (counts[player.id] || 0) + ' pól')
    );
    wrap.appendChild(row);
  });
  els.actionContent.appendChild(wrap);
}

function renderDuelCard() {
  if (!H.duel) return;
  const d = H.duel;
  els.duelCat.textContent = d.category.name;
  const q = d.q;
  if (!q) {
    els.duelImg.hidden = true;
    els.duelLoading.hidden = false;
    els.duelAnswer.textContent = '—';
    els.hostPass.hidden = true;
    return;
  }
  if (els.duelImg.dataset.key !== q.img) {
    els.duelImg.dataset.key = q.img;
    els.duelImg.hidden = true;
    els.duelLoading.hidden = false;
    els.duelImg.onload = () => {
      els.duelLoading.hidden = true;
      els.duelImg.hidden = false;
    };
    els.duelImg.onerror = () => {
      els.duelLoading.hidden = true;
    };
    els.duelImg.src = q.img;
  }
  els.duelImg.parentElement.classList.toggle('logo', LOGO_PACKS.has(d.category.id));
  els.duelImg.classList.toggle('blurred', BLUR_PACKS.has(d.category.id) && H.logoBlur);
  els.duelAnswer.textContent = q.a;
  els.duelAnswer.style.fontSize = q.a.length > 40 ? 'clamp(28px, 3vw, 44px)' : q.a.length > 26 ? 'clamp(32px, 3.4vw, 50px)' : '';
  els.duelMeta.textContent = 'Pytanie ' + d.qNumber + ' · pula ' + Math.max(0, d.queue.length - d.queuePos);
  if (d.reveal?.answer) {
    els.hostPass.hidden = false;
    els.hostPass.textContent =
      d.reveal.type === 'correct'
        ? 'DOBRZE · odpowiedź: ' + d.reveal.answer + ' · zegar zatrzymany'
        : 'PASS · odpowiedź: ' + d.reveal.answer + ' · zegar nadal leci';
  } else {
    els.hostPass.hidden = true;
  }
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
    fillClock(els.clockA, ch, 'CHALLENGER');
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
    el('div', 'clock-tiles', (tileCounts(H.tiles)[player.id] || 0) + ' pól')
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
    card.classList.toggle('penalty', d.penalty?.playerId === id && Date.now() - d.penalty.at < 1400);
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
    card.append(el('div', 'overlay-kicker', 'The Floor'), el('div', 'overlay-title', 'GOTUJEMY'), spinnerBlock('Wczytuję kategorię…'));
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

    if (Date.now() - H.lastSent > 600 && H.phase !== 'setup') sendState();
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
          q: d.q ? { img: d.q.img } : null,
          active: d.active,
          clocks: { ...d.clocks },
          deadline: d.deadline,
          qNumber: d.qNumber,
          reveal: d.reveal,
          penalty: d.penalty,
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
  bus.send('state', { state: publicState() });
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
  if (win) win.focus();
  else toast('Przeglądarka zablokowała okno. Zezwól na wyskakujące okna.', true, 5000);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

boot();
