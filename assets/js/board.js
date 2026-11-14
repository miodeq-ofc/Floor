import { $, Bus, fmtTime } from './common.js';

const B = {
  state: null,
  lastFloorSig: '',
  lastDuelKey: '',
  overlayKey: '',
  seenAt: 0,
  hostSeenAt: 0,
  timer: 0,
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
  els.overlay = $('#board-overlay');
  els.overlayCard = $('#board-overlay-card');
  els.waiting = $('#waiting-card');
}

function bind() {
  $('#board-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
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
    duelEnd: ['POJEDYNEK', 'Koniec starcia'],
    gameOver: ['KONIEC GRY', 'Zwycięzca'],
  };
  const [kick, title] = labels[s.phase] || labels.setup;
  els.kicker.textContent = kick;
  els.title.textContent = title;
  const showCat = s.duel && ['duelLoading', 'duelIntro', 'duel'].includes(s.phase);
  els.cat.hidden = !showCat;
  if (showCat) els.cat.textContent = (s.duel.category.icon || '') + ' ' + s.duel.category.name;
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
    s.targets,
    s.tiles.map((t) => [t.r, t.c, t.owner, t.cat.id]),
  ]);
  if (sig !== B.lastFloorSig) {
    B.lastFloorSig = sig;
    els.floor.style.setProperty('--cols', String(s.cols));
    els.floor.style.setProperty('--rows', String(s.rows));
    els.floor.innerHTML = '';
    s.tiles.forEach((tile) => {
      const player = s.players.find((p) => p.id === tile.owner);
      const node = document.createElement('div');
      node.className = 'floor-tile';
      node.style.setProperty('--pc', player?.color || '#667');
      if (s.phase === 'board' && tile.owner === s.challengerId) node.classList.add('challenger');
      if (s.phase === 'board' && s.targets.includes(tile.r + ':' + tile.c)) {
        node.classList.add('target');
        const attack = document.createElement('span');
        attack.className = 'tile-attack';
        attack.textContent = '⚔';
        node.appendChild(attack);
      }
      if (s.phase === 'gameOver' && s.winnerId === tile.owner) node.classList.add('winner');
      const emoji = document.createElement('span');
      emoji.className = 'tile-emoji';
      emoji.textContent = tile.cat.icon || '🎯';
      const name = document.createElement('span');
      name.className = 'tile-cat';
      name.textContent = tile.cat.name;
      const dot = document.createElement('span');
      dot.className = 'tile-dot';
      node.append(emoji, name, dot);
      els.floor.appendChild(node);
    });
  }

  if (s.phase === 'setup') {
    els.caption.textContent = 'Prowadzący ustawia grę…';
  } else if (s.phase === 'board') {
    const ch = s.players.find((p) => p.id === s.challengerId);
    els.caption.textContent = ch
      ? 'Challenger: ' + ch.name + ' — prowadzący wybiera sąsiednie pole'
      : 'Losowanie challengera…';
  } else if (s.phase === 'duelEnd') {
    const w = s.players.find((p) => p.id === s.result?.winnerId);
    els.caption.textContent = w ? w.name + ' przejmuje terytorium' : 'Koniec pojedynku';
  } else if (s.phase === 'gameOver') {
    const w = s.players.find((p) => p.id === s.winnerId);
    els.caption.textContent = w ? 'Cała plansza należy do ' + w.name : 'Koniec gry';
  } else {
    els.caption.textContent = 'The Floor';
  }
  renderLegend();
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
      chip.textContent = player.name + ' · ' + player.tiles + ' pól';
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
    els.players.append(clockCard(ch, 'CHALLENGER', d, 'a'), clockCard(de, 'OBROŃCA', d, 'b'));
  }
  if (!d.q) {
    els.image.hidden = true;
    els.loading.hidden = false;
  } else if (els.image.dataset.key !== d.q.img) {
    els.image.dataset.key = d.q.img;
    els.image.hidden = true;
    els.loading.hidden = false;
    els.image.onload = () => {
      els.loading.hidden = true;
      els.image.hidden = false;
    };
    els.image.onerror = () => {
      els.loading.hidden = true;
      els.image.hidden = true;
    };
    els.image.src = d.q.img;
  }
  const isLogo = d.category.id === 'loga-firm';
  const blur = isLogo && s.logoBlur;
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
      count.textContent = player.tiles + ' pól';
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
  tiles.textContent = player.tiles + ' pól';
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
    const node = document.createElement('div');
    node.className = 'floor-tile mini-tile';
    node.style.setProperty('--pc', player?.color || '#667');
    if (tile.owner === d.challengerId) node.classList.add('challenger');
    if (tile.owner === d.defenderId) node.classList.add('defender');
    if (tile.owner !== d.challengerId && tile.owner !== d.defenderId) node.classList.add('dim');
    if (tile.r + ':' + tile.c === d.tileKey) node.classList.add('duel-tile');
    els.mini.appendChild(node);
  });
}

function renderOverlay() {
  const s = B.state;
  let html = '';
  let key = s.phase + '|' + (s.result?.winnerId || '') + '|' + (s.winnerId || '') + '|' + (s.duel?.tileKey || '');
  if (s.phase === 'duelLoading') {
    html = '<div class="overlay-kicker">The Floor</div><div class="overlay-title">GOTUJEMY</div><div class="wait-card"><div class="spinner"></div><p>Wczytuję kategorię…</p></div>';
  } else if (s.phase === 'duelIntro') {
    const ch = s.players.find((p) => p.id === s.duel?.challengerId);
    const de = s.players.find((p) => p.id === s.duel?.defenderId);
    html =
      '<div class="overlay-kicker">Pojedynek o „' +
      escapeHtml(s.duel?.category?.name || '') +
      '”</div><div class="overlay-title">' +
      escapeHtml(ch?.name || '') +
      '</div><p class="overlay-sub">vs ' +
      escapeHtml(de?.name || '') +
      '</p><div class="countdown" id="big-countdown">3</div>';
  } else if (s.phase === 'duelEnd' && s.result) {
    const winner = s.players.find((p) => p.id === s.result.winnerId);
    const loser = s.players.find((p) => p.id === s.result.loserId);
    html =
      '<div class="overlay-kicker">Koniec pojedynku</div><div class="overlay-title">WYGRYWA ' +
      escapeHtml(winner?.name || '') +
      '</div><p class="overlay-sub">' +
      escapeHtml(loser?.name || '') +
      ' odpada · ' +
      s.result.gained +
      ' pól przejętych</p>';
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
    els.banner.classList.add('hidden');
    return;
  }
  els.bannerText.textContent = reveal.answer;
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
    if (node) node.textContent = String(Math.max(1, Math.ceil((s.introUntil - now) / 1000)));
  }
  if (s?.duel) {
    const reveal = s.duel.reveal;
    els.banner.classList.toggle('hidden', !reveal?.answer);
    if (reveal?.answer) els.bannerText.textContent = reveal.answer;
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
    card.classList.toggle('penalty', d.penalty?.playerId === id && Date.now() - d.penalty.at < 1400);
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
