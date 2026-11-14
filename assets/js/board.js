import { $, Bus, fmtTime } from './common.js';
import { shortCategory, sameCategoryNeighbor, mergeInfo, categoryGroup, pluralPoles } from './game.js';
import { Sound } from './sound.js';
import { preloadImages, setImageWithFallback } from './images.js';

const LOGO_PACKS = new Set(['loga-firm', 'aplikacje-internetowe', 'flagi-panstw', 'herby-panstw']);
const BLUR_PACKS = new Set(['loga-firm', 'marki-napojow']);

const B = {
  state: null,
  lastFloorSig: '',
  lastDuelKey: '',
  overlayKey: '',
  seenAt: 0,
  hostSeenAt: 0,
  timer: 0,
  lastRevealKey: '',
  lastActiveId: null,
  lastTickSecond: null,
  lastIntroSecond: 0,
};

const els = {};
const bus = new Bus('main', onMessage);

function boot() {
  cache();
  bind();
  render();
  bus.send('hello');
  setInterval(() => bus.send('hello'), 2200);
  setInterval(tick, 100);
}

function cache() {
  els.boardScreen = $('#board-screen');
  els.duelScreen = $('#duel-screen');
  els.floor = $('#board-floor');
  els.caption = $('#board-caption');
  els.legend = $('#board-legend');
  els.kicker = $('#board-kicker');
  els.title = $('#board-title');
  els.cat = $('#board-cat');
  els.turn = $('#board-turn');
  els.turnName = $('#board-turn-name');
  els.dot = $('#board-dot');
  els.conn = $('#board-conn');
  els.players = $('#duel-players');
  els.stage = $('#duel-stage');
  els.image = $('#duel-image');
  els.loading = $('#duel-loading');
  els.prompt = $('#duel-prompt');
  els.mini = $('#mini-floor');
  els.miniLegend = $('#mini-legend');
  els.banner = $('#answer-banner');
  els.bannerText = $('#answer-banner-text');
  els.sound = $('#board-sound');
  els.conquest = $('#conquest-banner');
  els.conquestTitle = $('#conquest-title');
  els.conquestNote = $('#conquest-note');
  els.overlay = $('#board-overlay');
  els.overlayCard = $('#board-overlay-card');
  els.waiting = $('#waiting-card');
  els.setup = $('#board-setup');
  els.clue = $('#duel-clue');
}

function updateSoundButton() {
  if (!els.sound) return;
  const on = Sound.isEnabled();
  els.sound.textContent = on ? '🔊' : '🔇';
  els.sound.title = on ? 'Wyłącz dźwięk' : 'Włącz dźwięk';
  els.sound.setAttribute('aria-pressed', String(on));
}

function bind() {
  $('#board-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  const unlock = () => Sound.unlock();
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
  els.sound?.addEventListener('click', () => {
    Sound.unlock();
    Sound.toggle();
    updateSoundButton();
  });
  updateSoundButton();
  window.addEventListener('beforeunload', () => bus.close());
}

function onMessage(message) {
  if (message.t === 'state' && message.state) {
    B.hostSeenAt = Date.now();
    B.state = message.state;
    render();
  }
}

/* ---------------- render ---------------- */
function render() {
  const s = B.state;
  if (!s) {
    renderConnection();
    return;
  }
  B.hostSeenAt = Date.now();
  renderConnection();
  renderHeader();
  renderScreens();
  renderOverlay();
  renderAnswerBanner();
  renderConquest();
  tick();
}

function renderConnection() {
  const connected = Date.now() - B.hostSeenAt < 6500;
  els.dot.classList.toggle('on', connected);
  els.dot.classList.toggle('off', !connected);
  els.conn.textContent = connected ? 'Połączono z prowadzącym' : 'Czekam na prowadzącego';
  els.waiting.hidden = Boolean(B.state);
  if (!B.state) {
    els.boardScreen.hidden = true;
    els.duelScreen.hidden = true;
  }
}

function renderHeader() {
  const s = B.state;
  const labels = {
    setup: ['KONFIGURACJA', 'Prowadzący ustawia grę'],
    board: ['RUNDA POJEDYNKÓW', 'Wybór pola'],
    duelLoading: ['POJEDYNEK', 'Za chwilę'],
    duelIntro: ['POJEDYNEK', 'Przygotujcie się'],
    duel: ['POJEDYNEK', s.duel?.category?.name || 'Walka'],
    conquest: ['POJEDYNEK', 'Przejęcie terenu'],
    gameOver: ['KONIEC GRY', 'Zwycięzca'],
  };
  const [kick, title] = labels[s.phase] || labels.setup;
  els.kicker.textContent = kick;
  els.title.textContent = title;
  const showCat = s.duel && ['duelLoading', 'duelIntro', 'duel'].includes(s.phase);
  els.cat.hidden = !showCat;
  if (showCat) els.cat.textContent = s.duel.category.name;

  const turnPlayer = s.phase === 'board' ? s.players.find((p) => p.id === s.challengerId) : null;
  els.turn.hidden = !turnPlayer;
  if (turnPlayer) els.turnName.textContent = turnPlayer.name;
}

function renderScreens() {
  const s = B.state;
  const duelPhase = s.duel && ['duelLoading', 'duelIntro', 'duel'].includes(s.phase);
  els.boardScreen.hidden = duelPhase;
  els.duelScreen.hidden = !duelPhase;
  if (duelPhase) {
    renderDuel();
  } else {
    renderBoard();
  }
}

function renderBoard() {
  const s = B.state;
  const sig = JSON.stringify([
    s.phase,
    s.challengerId,
    s.sourceKey,
    s.sources,
    s.targets,
    s.conquest?.at,
    s.tiles.map((t) => [t.r, t.c, t.owner, t.cat.id]),
  ]);
  if (sig !== B.lastFloorSig) {
    B.lastFloorSig = sig;
    els.floor.style.setProperty('--cols', String(s.cols));
    els.floor.style.setProperty('--rows', String(s.rows));
    els.floor.innerHTML = '';
    const groupSets = groupState(s);
    s.tiles.forEach((tile) => {
      const player = s.players.find((p) => p.id === tile.owner);
      const key = tile.r + ':' + tile.c;
      const node = document.createElement('div');
      node.className = 'floor-tile';
      node.style.setProperty('--pc', player?.color || '#667');
      node.title = tile.cat.name + ' · ' + (player?.name || '');

      if (sameCategoryNeighbor(s.tiles, tile, s.rows, s.cols)) node.classList.add('same-cat');
      const merge = mergeInfo(s.tiles, tile, s.rows, s.cols);
      if (merge.merged) {
        node.classList.add('merged');
        if (merge.up) node.classList.add('merge-up');
        if (merge.down) node.classList.add('merge-down');
        if (merge.left) node.classList.add('merge-left');
        if (merge.right) node.classList.add('merge-right');
      }
      if (merge.continuation) node.classList.add('merge-cont');

      markGroup(node, s, tile, key, groupSets.options, 'group-option');
      markGroup(node, s, tile, key, groupSets.source, 'group-source');
      markGroup(node, s, tile, key, groupSets.targets, 'group-target');

      if (s.phase === 'board') {
        if (tile.owner === s.challengerId && (s.sources || []).includes(key)) node.classList.add('source-option');
        if (s.sourceKey === key) node.classList.add('source');
        if ((s.targets || []).includes(key)) {
          node.classList.add('target');
          const attack = document.createElement('span');
          attack.className = 'tile-attack';
          attack.textContent = '!';
          node.appendChild(attack);
        }
      }

      if (s.phase === 'conquest' && s.conquest?.cells?.includes(key)) node.classList.add('conquered');
      if ((s.phase === 'conquest' && s.conquest?.winnerId === tile.owner) || (s.phase === 'gameOver' && s.winnerId === tile.owner)) {
        node.classList.add('winner');
      }

      const name = document.createElement('span');
      name.className = 'tile-cat';
      name.textContent = tile.cat.short || shortCategory(tile.cat.name);
      const dot = document.createElement('span');
      dot.className = 'tile-dot';
      node.append(name, dot);
      els.floor.appendChild(node);
    });
  }

  const setupMode = s.phase === 'setup' && !s.tiles.length;
  els.setup.hidden = !setupMode;
  if (setupMode) renderSetupPlayers(s);

  if (s.phase === 'setup') {
    els.caption.textContent = 'Prowadzący ustawia grę…';
  } else if (s.phase === 'board') {
    const ch = s.players.find((p) => p.id === s.challengerId);
    const source = s.tiles.find((t) => t.r + ':' + t.c === s.sourceKey);
    els.caption.textContent = !ch
      ? 'Wybór pola'
      : source
        ? 'Atak z „' + source.cat.name + '” · wybierz sąsiednie pole'
        : 'Wybierz swoje pole · zaatakuj sąsiada';
  } else if (s.phase === 'conquest' && s.conquest) {
    const w = s.players.find((p) => p.id === s.conquest.winnerId);
    els.caption.textContent = (w?.name || '') + ' zdobywa ' + s.conquest.gained + ' ' + pluralPoles(s.conquest.gained) + ' · ' + s.conquest.category.name;
  } else if (s.phase === 'gameOver') {
    const w = s.players.find((p) => p.id === s.winnerId);
    els.caption.textContent = w ? 'Cała plansza należy do ' + w.name : 'Koniec gry';
  } else {
    els.caption.textContent = 'The Floor';
  }
  renderLegend();
  renderConquest();
}

function renderSetupPlayers(s) {
  els.setup.innerHTML = '';
  const kicker = document.createElement('div');
  kicker.className = 'board-setup-kicker';
  kicker.textContent = 'USTAWIENIE GRY';
  const title = document.createElement('h2');
  title.className = 'board-setup-title';
  title.textContent = 'GRACZE';
  const sub = document.createElement('p');
  sub.className = 'board-setup-sub';
  sub.textContent = 'Prowadzący wybiera zawodników. Plansza pojawi się tutaj po wylosowaniu pól.';
  const grid = document.createElement('div');
  grid.className = 'board-setup-players';
  s.players.forEach((player, index) => {
    const card = document.createElement('div');
    card.className = 'board-setup-player';
    card.style.setProperty('--pc', player.color);
    const dot = document.createElement('div');
    dot.className = 'board-setup-dot';
    const name = document.createElement('b');
    name.textContent = player.name || 'Gracz ' + (index + 1);
    const role = document.createElement('span');
    role.textContent = name.textContent === 'Gracz ' + (index + 1) ? 'Zawodnik' : 'Gracz ' + (index + 1);
    card.append(dot, name, role);
    grid.appendChild(card);
  });
  els.setup.append(kicker, title, sub, grid);
}

function groupState(s) {
  const out = { options: new Set(), source: new Set(), targets: new Set() };
  const addGroup = (set, key) => {
    const tile = s.tiles.find((item) => item.r + ':' + item.c === key);
    if (!tile) return;
    categoryGroup(s.tiles, tile, s.rows, s.cols).forEach((item) => set.add(item.r + ':' + item.c));
  };
  if (s.phase === 'board') {
    (s.sources || []).forEach((key) => addGroup(out.options, key));
    addGroup(out.source, s.sourceKey);
    (s.targets || []).forEach((key) => addGroup(out.targets, key));
  }
  return out;
}

function markGroup(node, s, tile, key, set, className) {
  if (!set.has(key)) return;
  node.classList.add(className);
  const edge = mergeInfo(s.tiles, tile, s.rows, s.cols);
  if (!edge.up) node.classList.add('g-edge-top');
  if (!edge.down) node.classList.add('g-edge-bottom');
  if (!edge.left) node.classList.add('g-edge-left');
  if (!edge.right) node.classList.add('g-edge-right');
}

function renderLegend() {
  const s = B.state;
  els.legend.innerHTML = '';
  s.players
    .filter((p) => p.alive)
    .forEach((player) => {
      const chip = document.createElement('span');
      chip.className = 'legend-chip';
      chip.style.setProperty('--pc', player.color);
      chip.textContent = player.name + ' · ' + player.tiles + ' ' + pluralPoles(player.tiles);
      els.legend.appendChild(chip);
    });
}

function renderDuel() {
  const s = B.state;
  const d = s.duel;
  const ch = s.players.find((p) => p.id === d.challengerId);
  const de = s.players.find((p) => p.id === d.defenderId);
  if (!ch || !de) return;
  const key = d.tileKey + d.challengerId + d.defenderId;
  if (key !== B.lastDuelKey) {
    B.lastDuelKey = key;
    els.players.innerHTML = '';
    els.players.append(clockCard(ch, 'PRETENDENT', d, 'a'), clockCard(de, 'OBROŃCA', d, 'b'));
  }
  if (!d.q) {
    els.image.hidden = true;
    els.loading.hidden = false;
    if (els.clue) els.clue.hidden = true;
  } else if (els.image.dataset.key !== d.q.img) {
    els.image.dataset.key = d.q.img;
    els.image.hidden = true;
    els.loading.hidden = false;
    const key = d.q.img;
    preloadImages([key]);
    setImageWithFallback(els.image, key, (ok) => {
      if (els.image.dataset.key !== key) return;
      els.loading.hidden = true;
      els.image.hidden = !ok;
    });
  }
  if (els.clue) {
    els.clue.textContent = d.q.hint || '';
    els.clue.hidden = !d.q.hint;
  }
  const isLogo = LOGO_PACKS.has(d.category.id);
  const blur = BLUR_PACKS.has(d.category.id) && s.logoBlur;
  els.stage.classList.toggle('logo-stage', isLogo);
  els.image.classList.toggle('blurred', blur);
  els.prompt.textContent = d.category.prompt || 'Co to jest?';
  renderMini();
  renderMiniLegend();
  updateClocks();
}

function renderMiniLegend() {
  if (!els.miniLegend) return;
  const s = B.state;
  els.miniLegend.innerHTML = '';
  s.players
    .filter((p) => p.alive)
    .forEach((player) => {
      const row = document.createElement('div');
      row.className = 'mini-legend-row';
      row.style.setProperty('--pc', player.color);
      const dot = document.createElement('span');
      dot.className = 'mini-legend-dot';
      const name = document.createElement('span');
      name.className = 'mini-legend-name';
      name.textContent = player.name;
      const count = document.createElement('span');
      count.className = 'mini-legend-count';
      count.textContent = player.tiles + ' ' + pluralPoles(player.tiles);
      row.append(dot, name, count);
      els.miniLegend.appendChild(row);
    });
}

function clockCard(player, role, d, side) {
  const card = document.createElement('div');
  card.className = 'duel-player clock-card';
  card.dataset.player = player.id;
  card.dataset.side = side;
  card.style.setProperty('--pc', player.color);
  card.innerHTML = '';
  const roleEl = document.createElement('div');
  roleEl.className = 'clock-role';
  roleEl.textContent = role;
  const name = document.createElement('div');
  name.className = 'clock-name';
  name.textContent = player.name;
  const time = document.createElement('div');
  time.className = 'clock-time';
  time.textContent = fmtTime(d.clocks[player.id]);
  const tiles = document.createElement('div');
  tiles.className = 'clock-tiles';
  tiles.textContent = player.tiles + ' ' + pluralPoles(player.tiles);
  card.append(roleEl, name, time, tiles);
  card.classList.toggle('active', d.active === player.id);
  return card;
}

function renderMini() {
  const s = B.state;
  const d = s.duel;
  const sig = d.tileKey + s.tiles.map((t) => t.owner).join(',');
  if (els.mini.dataset.sig === sig) return;
  els.mini.dataset.sig = sig;
  els.mini.style.setProperty('--cols', String(s.cols));
  els.mini.style.setProperty('--rows', String(s.rows));
  els.mini.innerHTML = '';
  s.tiles.forEach((tile) => {
    const player = s.players.find((p) => p.id === tile.owner);
    const key = tile.r + ':' + tile.c;
    const node = document.createElement('div');
    node.className = 'floor-tile mini-tile';
    node.style.setProperty('--pc', player?.color || '#667');
    if (tile.owner === d.challengerId) node.classList.add('challenger');
    if (tile.owner === d.defenderId) node.classList.add('defender');
    if (tile.owner !== d.challengerId && tile.owner !== d.defenderId) node.classList.add('dim');
    if (key === d.tileKey) node.classList.add('duel-tile');
    els.mini.appendChild(node);
  });
}

function renderConquest() {
  if (!els.conquest) return;
  const s = B.state;
  if (!s || s.phase !== 'conquest' || !s.conquest) {
    els.conquest.classList.add('hidden');
    return;
  }
  const winner = s.players.find((p) => p.id === s.conquest.winnerId);
  els.conquest.style.setProperty('--pc', winner?.color || '#f6c453');
  els.conquestTitle.textContent = (winner?.name || '') + ' zdobywa ' + s.conquest.gained + ' ' + pluralPoles(s.conquest.gained);
  els.conquestNote.textContent = 'Kategoria „' + s.conquest.category.name + '” przechodzi na oba pola: atakujące i atakowane. Reszta terytorium zostaje u przeciwnika.';
  els.conquest.classList.remove('hidden');
}

function renderOverlay() {
  const s = B.state;
  let html = '';
  let key = s.phase + '|' + (s.winnerId || '') + '|' + (s.duel?.tileKey || '') + '|' + (s.conquest?.at || '');
  if (s.phase === 'duelLoading') {
    html = '<div class="overlay-kicker">The Floor</div><div class="overlay-title">PRZYGOTOWUJEMY</div><div class="wait-card"><div class="spinner"></div><p>Przygotowuję pytanie…</p></div>';
  } else if (s.phase === 'duelIntro') {
    const ch = s.players.find((p) => p.id === s.duel?.challengerId);
    const de = s.players.find((p) => p.id === s.duel?.defenderId);
    html =
      '<div class="overlay-kicker">Pojedynek o „' + escapeHtml(s.duel?.category?.name || '') + '”</div>' +
      '<div class="vs-intro">' +
      '<div class="vs-side challenger" style="--pc:' + escapeHtml(ch?.color || '#f6c453') + '">' +
      '<span class="vs-role">PRETENDENT</span><b class="vs-name">' + escapeHtml(ch?.name || '') + '</b>' +
      '<small class="vs-tiles">' + (ch?.tiles || 0) + ' ' + pluralPoles(ch?.tiles || 0) + '</small></div>' +
      '<div class="vs-center">VS</div>' +
      '<div class="vs-side defender" style="--pc:' + escapeHtml(de?.color || '#63a4ff') + '">' +
      '<span class="vs-role">OBROŃCA</span><b class="vs-name">' + escapeHtml(de?.name || '') + '</b>' +
      '<small class="vs-tiles">' + (de?.tiles || 0) + ' ' + pluralPoles(de?.tiles || 0) + '</small></div>' +
      '</div><div class="countdown" id="big-countdown">3</div>';
  } else if (s.phase === 'gameOver') {
    const winner = s.players.find((p) => p.id === s.winnerId);
    html =
      '<div class="overlay-kicker">Cała plansza zdobyta</div><div class="overlay-title">WYGRYWA ' +
      escapeHtml(winner?.name || '') +
      '</div><p class="overlay-sub">Ostatni gracz na The Floor.</p>';
  }
  if (key === B.overlayKey) return;
  B.overlayKey = key;
  els.overlayCard.innerHTML = html;
  els.overlay.classList.toggle('hidden', !html);
}

function renderAnswerBanner() {
  const reveal = B.state?.duel?.reveal;
  if (!reveal?.answer) {
    B.lastRevealKey = '';
    els.banner.classList.add('hidden');
    return;
  }
  const key = reveal.key || reveal.type + '|' + reveal.answer;
  if (key !== B.lastRevealKey) {
    B.lastRevealKey = key;
    if (reveal.type === 'correct') Sound.correct();
    else Sound.pass();
  }
  els.bannerText.textContent = reveal.answer;
  els.banner.dataset.type = reveal.type || 'pass';
  els.banner.classList.remove('hidden');
}

/* ---------------- live timers ---------------- */
function tick() {
  const s = B.state;
  const now = Date.now();
  renderConnection();
  if (s?.duel) updateClocks();
  if (s?.phase === 'duelIntro') {
    const node = document.getElementById('big-countdown');
    const sec = Math.max(1, Math.ceil((s.introUntil - now) / 1000));
    if (node) node.textContent = String(sec);
    if (sec !== B.lastIntroSecond) {
      B.lastIntroSecond = sec;
      Sound.countdown(sec);
    }
  } else {
    B.lastIntroSecond = 0;
  }

  if (s?.phase === 'duel' && s.duel) {
    const d = s.duel;
    if (d.active !== B.lastActiveId) {
      B.lastActiveId = d.active;
      B.lastTickSecond = null;
    }
    if (d.deadline) {
      const sec = Math.ceil(Math.max(0, d.deadline - now) / 1000);
      if (sec !== B.lastTickSecond) {
        B.lastTickSecond = sec;
        if (sec > 0) Sound.tick(sec <= 10);
      }
    } else {
      B.lastTickSecond = null;
    }
  } else {
    B.lastActiveId = null;
    B.lastTickSecond = null;
  }

  if (s?.duel) {
    const reveal = s.duel.reveal;
    els.banner.classList.toggle('hidden', !reveal?.answer);
    if (reveal?.answer) {
      els.bannerText.textContent = reveal.answer;
      // Typ musi się aktualizować także w ticku: inaczej po DOBRZE kolejny
      // PASS potrafił zostać zielony, bo zmieniał się tylko tekst.
      els.banner.dataset.type = reveal.type || 'pass';
    }
  }
}

function updateClocks() {
  const s = B.state;
  const d = s.duel;
  if (!d) return;
  const now = Date.now();
  const activeLeft = d.deadline ? Math.max(0, d.deadline - now) : d.clocks[d.active];
  document.querySelectorAll('#duel-players .clock-card').forEach((card) => {
    const id = card.dataset.player;
    const ms = id === d.active ? activeLeft : d.clocks[id];
    const time = card.querySelector('.clock-time');
    if (time) time.textContent = fmtTime(ms);
    card.classList.toggle('active', id === d.active);
    card.classList.toggle('low', id === d.active && ms <= 10000);
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
