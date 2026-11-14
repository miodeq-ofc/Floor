import { $, getConfig, Bus, fmtTime } from './common.js';

const cfg = getConfig();
const S = {
  state: null,
  heard: 0,
  qKey: '',
  overlayKey: '',
  revealKey: 0,
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
  $('#fullscreen').addEventListener('click', toggleFullscreen);
  if (!cfg) {
    showNoConfig();
    return;
  }
  buildScoreTiles();
  bus = new Bus(cfg.id, onMessage);
  bus.send('hello');
  setInterval(() => bus?.send('hello'), 4000);
  setInterval(tick, 100);
  render();
  window.addEventListener('beforeunload', () => bus?.close());
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
  els.connDot = $('#conn-dot');
  els.stage = $('#stage');
  els.qBg = $('#q-bg');
  els.placeholder = $('#placeholder');
  els.qImage = $('#q-image');
  els.qLoading = $('#q-loading');
  els.qWrap = $('#image-wrap');
  els.qPrompt = $('#q-prompt');
  els.barFill = $('#bar-fill');
  els.hint = $('#hint');
  els.overlay = $('#overlay');
  els.overlayCard = $('#overlay-card');
}

function buildScoreTiles() {
  els.scores.innerHTML = '';
  (cfg.players || [{ name: 'Gracz 1' }, { name: 'Gracz 2' }]).forEach((player) => {
    const tile = el('div', 'board-score');
    tile.append(el('div', 'name', player.name), el('div', 'pts', '0'));
    els.scores.appendChild(tile);
  });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function onMessage(msg) {
  if (msg.t !== 'state' || !msg.state) return;
  if (msg.state.g !== cfg.id) return;
  S.state = msg.state;
  S.heard = Date.now();
  render();
}

function showNoConfig() {
  els.turnKicker.textContent = 'BRAK GRY';
  els.overlay.classList.remove('hidden');
  els.overlayCard.innerHTML = '';
  els.overlayCard.append(
    el('div', 'overlay-kicker', 'The Floor'),
    el('div', 'overlay-title', 'NAJPIERW USTAWIENIA'),
    el('p', 'overlay-sub', 'Ten ekran otwiera się z lobby. Wróć do ustawień, wybierz kategorie i kliknij START GRY.'),
    (() => {
      const a = el('a', 'btn btn-primary btn-lg', '↩ Wróć do ustawień');
      a.href = 'index.html';
      return a;
    })()
  );
}

/* ---------------- render ---------------- */
function render() {
  const state = S.state;
  const connected = state && Date.now() - S.heard < 6500;
  els.connDot.classList.toggle('on', !!connected);
  els.connDot.classList.toggle('off', !connected);

  if (!state) {
    renderWaiting();
    return;
  }

  renderChrome(state);
  renderQuestion(state);
  renderOverlay(state);
  updateTimerUI();
}

function renderWaiting() {
  els.turnKicker.textContent = 'CZEKAM NA PROWADZĄCEGO';
  els.turnPlayer.textContent = '—';
  els.categoryChip.hidden = true;
  els.placeholder.hidden = false;
  els.qImage.hidden = true;
  els.qLoading.hidden = true;
  els.qPrompt.hidden = true;
  els.barFill.style.width = '100%';
  els.timerNum.textContent = '—';
  els.timer.classList.remove('low');
  els.overlay.classList.add('hidden');
}

function renderChrome(state) {
  els.turnKicker.textContent = 'TURA ' + (state.turn || 1) + ' / ' + (state.turnsTotal || 1);
  els.turnPlayer.textContent = state.players?.[state.current]?.name || '';
  if (state.category) {
    els.categoryChip.hidden = false;
    els.categoryEmoji.textContent = state.category.icon || '🎯';
    els.categoryName.textContent = state.category.name;
  } else {
    els.categoryChip.hidden = true;
  }

  [...els.scores.children].forEach((tile, index) => {
    const player = state.players?.[index];
    if (!player) return;
    tile.querySelector('.name').textContent = player.name;
    tile.querySelector('.pts').textContent = String(player.score);
    tile.classList.toggle('active', index === state.current);
  });
}

function renderQuestion(state) {
  const q = state.q;
  if (!q) {
    els.qImage.hidden = true;
    els.qLoading.hidden = true;
    els.qPrompt.hidden = true;
    els.placeholder.hidden = state.phase === 'gameOver';
    if (state.phase === 'loading' || state.phase === 'error') els.placeholder.hidden = true;
    return;
  }

  els.placeholder.hidden = true;
  els.qPrompt.hidden = false;
  els.qPrompt.textContent = q.prompt || state.category?.prompt || 'Co to jest?';

  if (S.qKey !== q.img) {
    S.qKey = q.img;
    els.qImage.hidden = true;
    els.qImage.classList.remove('board-image');
    void els.qImage.offsetWidth;
    els.qImage.className = 'board-image';
    els.qLoading.hidden = false;
    els.qBg.style.backgroundImage = 'url("' + q.img + '")';
    els.qImage.onload = () => {
      els.qLoading.hidden = true;
      els.qImage.hidden = false;
    };
    els.qImage.onerror = () => {
      els.qLoading.hidden = true;
      els.qImage.hidden = true;
      els.qPrompt.hidden = false;
      els.qPrompt.textContent = 'Brak zdjęcia — prowadzący zaraz zmieni pytanie';
    };
    els.qImage.src = q.img;
  }
}

function renderOverlay(state) {
  const phase = state.phase;
  const key = phase + '|' + (state.turn || 1) + '|' + (state.reveal?.key || '') + '|' + (state.current ?? '');
  const visible = ['loading', 'intro', 'reveal', 'turnEnd', 'gameOver', 'error'].includes(phase);
  if (key === S.overlayKey) return;
  S.overlayKey = key;

  els.overlay.classList.toggle('hidden', !visible);
  const card = els.overlayCard;
  card.innerHTML = '';
  if (!visible) return;

  if (phase === 'loading') {
    card.append(
      el('div', 'overlay-kicker', 'The Floor'),
      el('div', 'overlay-title', 'GOTUJEMY'),
      (() => {
        const wrap = el('div', 'wait-card');
        wrap.append(el('div', 'spinner'), el('p', '', state.category ? 'Kategoria: ' + state.category.name : 'Wczytuję kategorię…'));
        return wrap;
      })()
    );
    return;
  }

  if (phase === 'intro') {
    card.append(
      el('div', 'overlay-kicker', 'Tura ' + (state.turn || 1) + ' z ' + (state.turnsTotal || 1)),
      el('div', 'overlay-title', 'GOTOWI?'),
      el('p', 'overlay-sub', (state.players?.[state.current]?.name || '') + ' · ' + (state.category?.icon || '') + ' ' + (state.category?.name || '')),
      el('div', 'countdown', '3')
    );
    return;
  }

  if (phase === 'reveal') {
    const answer = state.reveal?.answer || '';
    const answerEl = el('div', 'overlay-answer ok', '✓ ' + answer);
    if (answer.length > 44) answerEl.style.fontSize = 'clamp(26px, 5.4vw, 58px)';
    else if (answer.length > 26) answerEl.style.fontSize = 'clamp(32px, 6.5vw, 76px)';
    card.append(
      el('div', 'overlay-kicker', 'Dobra odpowiedź'),
      answerEl,
      el('p', 'overlay-sub', 'Punkt dla: ' + (state.players?.[state.current]?.name || ''))
    );
    return;
  }

  if (phase === 'turnEnd') {
    card.append(el('div', 'overlay-kicker', 'Koniec tury'), el('div', 'overlay-title', 'ZMIANA'), buildScores(state, false));
    const next = state.turn < state.turnsTotal ? state.players?.[1 - state.current]?.name : null;
    if (next) card.append(el('p', 'overlay-sub', 'Następny: ' + next));
    return;
  }

  if (phase === 'gameOver') {
    const max = Math.max(...(state.players || []).map((p) => p.score));
    const winners = (state.players || []).filter((p) => p.score === max);
    card.append(
      el('div', 'overlay-kicker', 'Koniec gry'),
      el('div', 'overlay-title', winners.length > 1 ? 'REMIS' : 'WYGRYWA'),
      el('p', 'overlay-sub', winners.map((p) => p.name).join(' i ')),
      buildScores(state, true)
    );
    return;
  }

  if (phase === 'error') {
    card.append(
      el('div', 'overlay-kicker', 'Chwila przerwy'),
      el('div', 'overlay-title', 'PROBLEM'),
      el('p', 'overlay-sub', state.error?.message || 'Prowadzący wznowi grę za chwilę.')
    );
  }
}

function buildScores(state, highlightWinner) {
  const wrap = el('div', 'mini-scores');
  const max = Math.max(...(state.players || []).map((p) => p.score));
  (state.players || []).forEach((player) => {
    const win = highlightWinner && player.score === max && max > 0;
    const box = el('div', 'mini-score' + (win ? ' win' : ''));
    box.append(el('div', 'n', player.name), el('div', 'v', String(player.score)));
    wrap.appendChild(box);
  });
  return wrap;
}

/* ---------------- zegar ---------------- */
function tick() {
  const state = S.state;
  if (!state) return;
  updateTimerUI();
  if (state.phase === 'intro') {
    const node = document.getElementById('countdown');
    if (node && state.introUntil) node.textContent = String(Math.max(1, Math.ceil((state.introUntil - Date.now()) / 1000)));
  }
  const connected = Date.now() - S.heard < 6500;
  els.connDot.classList.toggle('on', connected);
  els.connDot.classList.toggle('off', !connected);
}

function updateTimerUI() {
  const state = S.state;
  if (!state) return;
  const total = state.totalMs || (cfg?.turnSeconds || 45) * 1000;
  let ms = 0;
  if (state.phase === 'play') ms = state.deadline ? state.deadline - Date.now() : state.remainingMs || 0;
  else if (state.phase === 'reveal') ms = state.remainingMs || 0;
  else if (state.phase === 'intro' || state.phase === 'turnEnd') ms = state.remainingMs || 0;
  ms = Math.max(0, ms);

  els.timerNum.textContent = state.phase === 'gameOver' ? '0' : fmtTime(ms);
  els.timer.classList.toggle('low', state.phase === 'play' && ms <= 10000);
  els.barFill.style.width = Math.max(0, Math.min(100, (ms / total) * 100)) + '%';
  els.barFill.parentElement.classList.toggle('low', state.phase === 'play' && ms <= 10000);
}

boot();
