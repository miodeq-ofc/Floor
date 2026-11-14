import {
  $,
  fmtTime,
  getConfig,
  Bus,
  loadPack,
  makeQueue,
  markSeen,
  shuffle,
  toast,
} from './common.js';

const cfg = getConfig();
if (!cfg || !cfg.categories?.length) {
  location.replace('index.html');
  throw new Error('Brak konfiguracji gry — wróć do ustawień.');
}

const G = {
  cfg,
  players: (cfg?.players || [{ name: 'Gracz 1' }, { name: 'Gracz 2' }]).map((p) => ({ name: p.name, score: 0 })),
  current: 0,
  turnIndex: 0,
  turnsTotal: (cfg?.turnsPerPlayer || 2) * 2,
  phase: 'boot',
  categoryOrder: [],
  category: null,
  pack: null,
  queue: [],
  queuePos: 0,
  q: null,
  qNumber: 0,
  deadline: null,
  remainingMs: (cfg?.turnSeconds || 45) * 1000,
  totalMs: (cfg?.turnSeconds || 45) * 1000,
  introUntil: 0,
  reveal: null,
  flash: null,
  error: null,
  boardSeen: 0,
  token: 0,
  busy: false,
  overlayKey: '',
  lastStateAt: 0,
};

let bus = null;
const els = {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function boot() {
  cacheEls();
  buildScoreTiles();
  bind();
  startMasterLoop();
  bus = new Bus(cfg.id, onMessage);
  G.categoryOrder = shuffle(cfg.categories);
  startGame();
}

function cacheEls() {
  els.turnKicker = $('#turn-kicker');
  els.turnPlayer = $('#turn-player');
  els.categoryChip = $('#category-chip');
  els.categoryEmoji = $('#category-emoji');
  els.categoryName = $('#category-name');
  els.scores = $('#scores');
  els.timer = $('#timer');
  els.timerNum = $('#timer-num');
  els.timerRing = $('#timer-ring');
  els.connDot = $('#conn-dot');
  els.connText = $('#conn-text');
  els.qCounter = $('#q-counter');
  els.qPool = $('#q-pool');
  els.qWrap = $('#q-wrap');
  els.qImage = $('#q-image');
  els.qLoading = $('#q-loading');
  els.qFallback = $('#q-fallback');
  els.qBg = $('#q-bg');
  els.qPrompt = $('#q-prompt');
  els.answerText = $('#answer-text');
  els.answerCat = $('#answer-cat');
  els.answerNum = $('#answer-num');
  els.btnOk = $('#btn-ok');
  els.btnPass = $('#btn-pass');
  els.overlay = $('#overlay');
  els.overlayCard = $('#overlay-card');
  els.footInfo = $('#foot-info');
  els.packInfo = $('#pack-info');
}

function buildScoreTiles() {
  els.scores.innerHTML = '';
  G.players.forEach((player, index) => {
    const tile = el('div', 'score-tile');
    tile.dataset.index = String(index);
    tile.append(el('div', 'name', player.name), el('div', 'pts', '0'));
    els.scores.appendChild(tile);
  });
}

function bind() {
  els.btnOk.addEventListener('click', accept);
  els.btnPass.addEventListener('click', pass);
  $('#end-turn').addEventListener('click', () => endTurn('manual'));
  $('#open-board').addEventListener('click', openBoard);
  $('#fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.target.matches('input, textarea, select')) return;
    const key = event.key.toLowerCase();
    if (key === 'd' || key === 'enter' || key === 'arrowright') {
      event.preventDefault();
      accept();
    } else if (key === 'p' || key === 'arrowleft' || key === ' ') {
      event.preventDefault();
      pass();
    } else if (key === 'k') {
      event.preventDefault();
      endTurn('manual');
    }
  });
  window.addEventListener('beforeunload', () => bus?.close());
}

function openBoard() {
  const win = window.open('board.html', 'floor-board', 'popup=yes,width=1280,height=760');
  if (win) {
    win.focus();
    toast('Ekran graczy otwarty w nowym oknie.');
  } else {
    toast('Przeglądarka zablokowała okno. Zezwól na wyskakujące okna.', true, 5000);
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/* ---------------- komunikacja ---------------- */
function onMessage(msg) {
  if (msg.t === 'hello') {
    G.boardSeen = Date.now();
    sendState();
  }
}

function publicState() {
  return {
    g: cfg.id,
    phase: G.phase,
    players: G.players.map((p) => ({ name: p.name, score: p.score })),
    current: G.current,
    turn: Math.min(G.turnIndex + 1, G.turnsTotal),
    turnsTotal: G.turnsTotal,
    category: G.category ? { name: G.category.name, icon: G.category.icon, prompt: G.category.prompt } : null,
    q: G.q ? { img: G.q.img, prompt: G.category?.prompt || 'Co to jest?' } : null,
    qNumber: G.qNumber,
    poolLeft: Math.max(0, G.queue.length - G.queuePos),
    deadline: G.deadline,
    remainingMs: G.remainingMs,
    totalMs: G.totalMs,
    introUntil: G.phase === 'intro' ? G.introUntil : null,
    reveal: G.reveal,
    flash: G.flash,
    error: G.error ? { message: G.error.message } : null,
  };
}

function sendState() {
  G.lastStateAt = Date.now();
  bus?.send('state', { state: publicState() });
}

/* ---------------- gra ---------------- */
function startGame() {
  G.players.forEach((p) => (p.score = 0));
  G.current = 0;
  G.turnIndex = 0;
  G.qNumber = 0;
  startTurn();
}

async function startTurn() {
  const token = ++G.token;
  G.busy = false;
  G.q = null;
  G.reveal = null;
  G.flash = null;
  G.error = null;
  G.deadline = null;
  G.remainingMs = G.totalMs = cfg.turnSeconds * 1000;
  G.phase = 'loading';
  G.category = G.categoryOrder[G.turnIndex % G.categoryOrder.length] || cfg.categories[0];
  G.qNumber = 0;
  renderAll();
  sendState();
  await prepareCategory(G.category, token);
}

async function prepareCategory(category, token) {
  try {
    const pack = await loadPack(category);
    if (token !== G.token) return;
    const { queue, total } = makeQueue(pack);
    G.pack = pack;
    G.queue = queue;
    G.queuePos = 0;
    G.packTotal = total;
    G.phase = 'intro';
    G.introUntil = Date.now() + 3200;
    renderAll();
    sendState();
    setTimeout(() => {
      if (token === G.token && G.phase === 'intro') beginPlay();
    }, 3200);
  } catch (error) {
    if (token !== G.token) return;
    G.phase = 'error';
    G.error = { message: error.message || 'Nie udało się wczytać kategorii.', category };
    renderAll();
    sendState();
  }
}

function beginPlay() {
  G.phase = 'play';
  G.remainingMs = G.totalMs;
  G.deadline = Date.now() + G.remainingMs;
  advanceQuestion();
  G.busy = false;
  renderAll();
  sendState();
}

function advanceQuestion() {
  if (!G.pack) return;
  if (G.queuePos >= G.queue.length) {
    const next = makeQueue(G.pack);
    G.queue = next.queue;
    G.queuePos = 0;
  }
  if (!G.queue.length) {
    G.q = null;
    return;
  }
  G.q = G.queue[G.queuePos++];
  G.qNumber += 1;
  markSeen(G.pack.id, G.q.a);
  preloadNext();
}

function preloadNext() {
  const next = G.queue[G.queuePos];
  if (next?.img) {
    const img = new Image();
    img.src = next.img;
  }
}

function accept() {
  if (G.phase !== 'play' || G.busy || !G.q) return;
  const left = G.deadline ? G.deadline - Date.now() : G.remainingMs;
  if (left <= 0) {
    endTurn('time');
    return;
  }
  G.busy = true;
  G.players[G.current].score += 1;
  G.remainingMs = left;
  G.deadline = null;
  G.reveal = { answer: G.q.a, key: Date.now() };
  G.phase = 'reveal';
  els.btnOk.classList.remove('flash');
  void els.btnOk.offsetWidth;
  els.btnOk.classList.add('flash');
  renderAll();
  sendState();

  setTimeout(() => {
    if (G.phase !== 'reveal') return;
    G.reveal = null;
    G.phase = 'play';
    G.q = null;
    advanceQuestion();
    G.deadline = Date.now() + G.remainingMs;
    G.busy = false;
    renderAll();
    sendState();
  }, 1900);
}

function pass() {
  if (G.phase !== 'play' || G.busy || !G.q) return;
  G.busy = true;
  if (G.deadline) G.remainingMs = Math.max(0, G.deadline - Date.now());
  G.flash = { type: 'pass', key: Date.now() };
  advanceQuestion();
  renderAll();
  sendState();
  setTimeout(() => {
    G.flash = null;
    G.busy = false;
    renderAll();
    sendState();
  }, 550);
}

function endTurn(reason = 'time') {
  if (!['play', 'reveal', 'intro', 'loading', 'error'].includes(G.phase)) return;
  G.token += 1;
  G.phase = 'turnEnd';
  G.deadline = null;
  G.reveal = null;
  G.flash = null;
  G.q = null;
  G.remainingMs = 0;
  G.busy = false;
  if (reason === 'time') G.flash = { type: 'time', key: Date.now() };
  renderAll();
  sendState();

  const isLast = G.turnIndex + 1 >= G.turnsTotal;
  setTimeout(() => {
    if (!isLast) {
      G.turnIndex += 1;
      G.current = 1 - G.current;
      startTurn();
    } else {
      G.phase = 'gameOver';
      G.flash = null;
      renderAll();
      sendState();
    }
  }, 2600);
}

/* ---------------- pętla i render ---------------- */
function startMasterLoop() {
  setInterval(() => {
    if (G.phase === 'play' && G.deadline) {
      G.remainingMs = Math.max(0, G.deadline - Date.now());
      updateTimerUI(G.remainingMs);
      if (G.remainingMs <= 0) endTurn('time');
    } else {
      updateTimerUI(G.remainingMs);
    }

    if (G.phase === 'intro') {
      const node = document.getElementById('countdown');
      if (node) {
        const left = Math.max(1, Math.ceil((G.introUntil - Date.now()) / 1000));
        node.textContent = String(left);
      }
    }

    const connected = Date.now() - G.boardSeen < 6500;
    els.connDot.classList.toggle('on', connected);
    els.connDot.classList.toggle('off', !connected);
    els.connText.textContent = connected ? 'Ekran graczy połączony' : 'Brak ekranu graczy';

    if (Date.now() - G.lastStateAt > 600) sendState();
  }, 120);
}

function updateTimerUI(ms) {
  els.timerNum.textContent = fmtTime(ms);
  const ratio = Math.max(0, Math.min(1, ms / G.totalMs));
  els.timerRing.style.setProperty('--p', String(ratio));
  els.timer.classList.toggle('low', ms <= 10000 && G.phase === 'play');
}

function renderAll() {
  renderChrome();
  renderQuestion();
  renderScores();
  renderOverlay();
  els.btnOk.disabled = G.phase !== 'play' || G.busy;
  els.btnPass.disabled = G.phase !== 'play' || G.busy;
  const labels = {
    boot: 'Przygotowuję grę…',
    loading: 'Wczytuję pytania…',
    intro: 'Start za chwilę',
    play: 'Gra trwa — oceniaj odpowiedzi',
    reveal: 'Odpowiedź pokazana graczom',
    turnEnd: 'Koniec tury',
    gameOver: 'Koniec gry',
    error: 'Problem z kategorią',
  };
  els.footInfo.textContent = labels[G.phase] || '';
}

function renderChrome() {
  els.turnKicker.textContent = 'TURA ' + Math.min(G.turnIndex + 1, G.turnsTotal) + ' / ' + G.turnsTotal;
  els.turnPlayer.textContent = G.players[G.current]?.name || '';
  if (G.category) {
    els.categoryChip.hidden = false;
    els.categoryEmoji.textContent = G.category.icon || '🎯';
    els.categoryName.textContent = G.category.name;
    els.qPrompt.textContent = G.category.prompt || 'Co to jest?';
    els.answerCat.textContent = G.category.name;
  } else {
    els.categoryChip.hidden = true;
  }
  els.packInfo.textContent = G.packTotal
    ? 'Baza kategorii: ' + G.packTotal + ' pytań · w tej turze losowo'
    : 'Baza pytań: —';
}

function renderScores() {
  [...els.scores.children].forEach((tile, index) => {
    const player = G.players[index];
    tile.querySelector('.name').textContent = player.name;
    tile.querySelector('.pts').textContent = String(player.score);
    const max = Math.max(...G.players.map((p) => p.score));
    tile.classList.toggle('active', index === G.current);
    tile.classList.toggle('lead', player.score === max && max > 0 && index !== G.current);
  });
}

function renderQuestion() {
  const q = G.q;
  if (!q) {
    els.qImage.hidden = true;
    els.qFallback.hidden = true;
    els.qLoading.hidden = false;
    els.qLoading.innerHTML = '<div><div class="spinner"></div>Losuję pytanie…</div>';
    els.qBg.style.backgroundImage = '';
    els.answerText.textContent = '—';
    els.answerText.style.fontSize = '';
    els.qCounter.textContent = G.phase === 'loading' ? 'Przygotowuję kategorię' : 'Pytanie —';
    els.qPool.textContent = G.packTotal ? G.packTotal + ' pytań w kategorii' : '';
    els.answerNum.textContent = '';
    return;
  }

  if (els.qImage.dataset.key !== q.img) {
    els.qImage.dataset.key = q.img;
    els.qImage.hidden = true;
    els.qFallback.hidden = true;
    els.qLoading.hidden = false;
    els.qLoading.innerHTML = '<div><div class="spinner"></div>Wczytuję zdjęcie…</div>';
    els.qBg.style.backgroundImage = 'url("' + q.img + '")';
    els.qImage.onload = () => {
      els.qLoading.hidden = true;
      els.qImage.hidden = false;
    };
    els.qImage.onerror = () => {
      els.qLoading.hidden = true;
      els.qImage.hidden = true;
      els.qFallback.hidden = false;
    };
    els.qImage.src = q.img;
  }

  els.answerText.textContent = q.a;
  els.answerText.style.fontSize =
    q.a.length > 44 ? 'clamp(20px, 2.6vw, 38px)' : q.a.length > 30 ? 'clamp(26px, 3.4vw, 48px)' : '';
  els.qCounter.textContent = 'Pytanie ' + G.qNumber;
  els.qPool.textContent = Math.max(0, G.queue.length - G.queuePos) + ' w puli';
  els.answerNum.textContent = 'Pytanie ' + G.qNumber;
}

function renderOverlay() {
  const key = G.phase + '|' + (G.reveal?.key || '') + '|' + G.turnIndex + '|' + (G.error?.message || '');
  if (key === G.overlayKey) return;
  G.overlayKey = key;
  const card = els.overlayCard;

  if (['play', 'reveal', 'boot'].includes(G.phase)) {
    els.overlay.classList.add('hidden');
    card.innerHTML = '';
    return;
  }

  els.overlay.classList.remove('hidden');
  card.innerHTML = '';

  if (G.phase === 'loading') {
    card.append(
      el('div', 'overlay-kicker', 'The Floor'),
      el('div', 'overlay-title', 'GOTUJEMY'),
      (() => {
        const wrap = el('div', 'wait-card');
        wrap.append(el('div', 'spinner'), el('p', '', 'Wczytuję kategorię „' + (G.category?.name || '') + '” i losuję pytania…'));
        return wrap;
      })()
    );
    return;
  }

  if (G.phase === 'intro') {
    card.append(
      el('div', 'overlay-kicker', 'Tura ' + (G.turnIndex + 1) + ' z ' + G.turnsTotal),
      el('div', 'overlay-title', G.players[G.current]?.name || ''),
      el('p', 'overlay-sub', (G.category?.icon || '') + ' ' + (G.category?.name || '')),
      el('div', 'countdown', '3')
    );
    return;
  }

  if (G.phase === 'turnEnd') {
    const nextIndex = G.turnIndex + 1 < G.turnsTotal ? 1 - G.current : G.current;
    card.append(
      el('div', 'overlay-kicker', G.flash?.type === 'time' ? 'Czas minął' : 'Koniec tury'),
      el('div', 'overlay-title', 'KONIEC TURY')
    );
    card.appendChild(buildMiniScores());
    if (G.turnIndex + 1 < G.turnsTotal) {
      card.append(el('p', 'overlay-sub', 'Następna tura: ' + G.players[nextIndex].name));
    }
    return;
  }

  if (G.phase === 'gameOver') {
    const max = Math.max(...G.players.map((p) => p.score));
    const winners = G.players.filter((p) => p.score === max);
    card.append(
      el('div', 'overlay-kicker', 'Koniec gry'),
      el('div', 'overlay-title', winners.length > 1 ? 'REMIS' : 'WYGRYWA'),
      el('p', 'overlay-sub', winners.map((p) => p.name).join(' i ')),
      buildMiniScores()
    );
    const actions = el('div', 'mini-scores');
    const again = el('a', 'btn btn-primary btn-lg', '↻ Nowa gra');
    again.href = 'index.html';
    actions.appendChild(again);
    card.appendChild(actions);
    return;
  }

  if (G.phase === 'error') {
    card.append(
      el('div', 'overlay-kicker', 'Problem'),
      el('div', 'overlay-title', 'NIE POSZŁO'),
      el('p', 'overlay-sub', G.error?.message || 'Nie udało się wczytać pytań.'),
      (() => {
        const actions = el('div', 'mini-scores');
        const retry = el('button', 'btn btn-primary', 'Spróbuj ponownie');
        retry.type = 'button';
        retry.addEventListener('click', () => {
          const token = ++G.token;
          G.phase = 'loading';
          G.error = null;
          renderAll();
          sendState();
          prepareCategory(G.category, token);
        });
        const skip = el('button', 'btn', 'Pomiń turę');
        skip.type = 'button';
        skip.addEventListener('click', () => endTurn('skip'));
        actions.append(retry, skip);
        return actions;
      })()
    );
  }
}

function buildMiniScores() {
  const wrap = el('div', 'mini-scores');
  const max = Math.max(...G.players.map((p) => p.score));
  G.players.forEach((player) => {
    const box = el('div', 'mini-score' + (player.score === max && max > 0 ? ' win' : ''));
    box.append(el('div', 'n', player.name), el('div', 'v', String(player.score)));
    wrap.appendChild(box);
  });
  return wrap;
}

boot();
