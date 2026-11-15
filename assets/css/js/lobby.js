import { $, $$, loadIndex, toast, storeGet, storeSet, searchWikiCategories, CONFIG_KEY } from './common.js';

const POPULAR = [
  'marki-samochodow',
  'przyprawy',
  'rasy-psow',
  'flagi-panstw',
  'loga-firm',
  'wladcy-polski',
  'zabawki',
  'smartfony',
];

const GROUPS = ['Motoryzacja', 'Kuchnia', 'Przyroda', 'Geografia', 'Historia', 'Muzyka', 'Film i TV', 'Technika', 'Nauka', 'Marki', 'Zabawa', 'Inne', 'Własne'];

const state = {
  packs: [],
  customs: [],
  selected: new Set(),
  query: '',
  turnSeconds: 45,
  turnsPerPlayer: 2,
  liveHits: [],
  searchToken: 0,
  ready: false,
};

const byId = new Map();

function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10;
  const tens = n % 100;
  if (last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14)) return few;
  return many;
}

function allCats() {
  return [...state.packs, ...state.customs];
}

function catById(id) {
  return byId.get(id) || state.customs.find((c) => c.id === id) || null;
}

function init() {
  bindSettings();
  bindSearch();
  $('#start').addEventListener('click', startGame);

  storeGet('floor:selection', []).forEach((cat) => {
    if (cat && cat.id && cat.id.startsWith('live-')) {
      state.customs.push(cat);
      byId.set(cat.id, cat);
      state.selected.add(cat.id);
    }
  });

  loadIndex()
    .then((packs) => {
      state.packs = packs;
      packs.forEach((p) => byId.set(p.id, p));
      const saved = storeGet('floor:selection', null);
      const valid = new Set(packs.map((p) => p.id));
      if (Array.isArray(saved) && saved.length) {
        saved.forEach((cat) => {
          if (cat.id.startsWith('live-')) return;
          if (valid.has(cat.id)) state.selected.add(cat.id);
        });
      }
      if (!state.selected.size) {
        POPULAR.forEach((id) => valid.has(id) && state.selected.add(id));
      }
      state.ready = true;
      updateHero();
      render();
      updateSummary();
    })
    .catch((error) => {
      $('#cat-groups').innerHTML = '';
      const box = document.createElement('div');
      box.className = 'cat-empty';
      box.innerHTML =
        '<b>Nie mogę wczytać bazy pytań.</b><br />Otwórz grę przez serwer HTTP (np. GitHub Pages albo <code>npx serve</code>), a nie bezpośrednio z pliku.';
      $('#cat-groups').appendChild(box);
      toast(error.message, true, 6000);
    });
}

function updateHero() {
  const total = state.packs.reduce((sum, p) => sum + (p.count || 0), 0);
  $('#hero-packs').textContent = new Intl.NumberFormat('pl-PL').format(state.packs.length);
  $('#hero-questions').textContent = new Intl.NumberFormat('pl-PL').format(total);
}

function bindSettings() {
  $('#turn-seg').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-sec]');
    if (!btn) return;
    state.turnSeconds = Number(btn.dataset.sec);
    $$('#turn-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    updateSummary();
  });
  $('#turns-seg').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-turns]');
    if (!btn) return;
    state.turnsPerPlayer = Number(btn.dataset.turns);
    $$('#turns-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    updateSummary();
  });
}

function bindSearch() {
  const input = $('#search');
  const clear = $('#search-clear');
  let debounce = 0;

  input.addEventListener('input', () => {
    state.query = input.value.trim();
    clear.hidden = !state.query;
    render();
    updateSummary();
    clearTimeout(debounce);
    if (state.query.length < 3) {
      hideLive();
      return;
    }
    debounce = setTimeout(() => findLive(state.query), 650);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    clear.hidden = true;
    hideLive();
    render();
    input.focus();
  });

  $('#select-popular').addEventListener('click', () => {
    state.selected.clear();
    POPULAR.forEach((id) => byId.has(id) && state.selected.add(id));
    render();
    updateSummary();
  });

  $('#select-all').addEventListener('click', () => {
    allCats().forEach((cat) => state.selected.add(cat.id));
    render();
    updateSummary();
  });

  $('#select-none').addEventListener('click', () => {
    state.selected.clear();
    render();
    updateSummary();
  });
}

function hideLive() {
  state.liveHits = [];
  $('#live-results').hidden = true;
  $('#live-results').innerHTML = '';
}

async function findLive(query) {
  const token = ++state.searchToken;
  const box = $('#live-results');
  box.hidden = false;
  box.innerHTML = '<h4>Szukam w Wikipedii…</h4>';
  try {
    const hits = await searchWikiCategories(query);
    if (token !== state.searchToken) return;
    state.liveHits = hits.filter((hit) => hit.name.length <= 60);
    renderLive();
  } catch (error) {
    if (token !== state.searchToken) return;
    box.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'live-note';
    note.textContent = error.message;
    box.appendChild(note);
  }
}

function renderLive() {
  const box = $('#live-results');
  box.innerHTML = '';
  if (!state.liveHits.length) {
    box.innerHTML = '<h4>Brak kategorii w Wikipedii</h4>';
    return;
  }
  const head = document.createElement('h4');
  head.textContent = 'Kategorie z Wikipedii — dodaj i graj';
  box.appendChild(head);

  state.liveHits.forEach((hit) => {
    const id = 'live-' + hit.pageid;
    const row = document.createElement('div');
    row.className = 'live-row';

    const name = document.createElement('span');
    name.className = 'live-name';
    name.textContent = hit.name;
    row.appendChild(name);

    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    const already = state.selected.has(id) || state.customs.some((c) => c.id === id);
    btn.textContent = already ? '✓ dodana' : '+ dodaj';
    btn.disabled = already;
    btn.addEventListener('click', () => {
      const cat = {
        id,
        name: hit.name,
        group: 'Własne',
        icon: '🌐',
        prompt: 'Co widzisz na zdjęciu? Podaj nazwę.',
        live: true,
        cat: hit.title,
        count: null,
      };
      if (!state.customs.some((c) => c.id === id)) state.customs.push(cat);
      byId.set(id, cat);
      state.selected.add(id);
      btn.textContent = '✓ dodana';
      btn.disabled = true;
      render();
      updateSummary();
      toast('Dodano kategorię „' + cat.name + '”. Pytania pobiorą się przy starcie tury.');
    });
    row.appendChild(btn);
    box.appendChild(row);
  });

  const note = document.createElement('div');
  note.className = 'live-note';
  note.textContent = 'Kategoria spoza bazy: pytania i zdjęcia zostaną pobrane z Wikipedii przy starcie tury (wymaga internetu).';
  box.appendChild(note);
}

function render() {
  if (!state.ready) return;
  const container = $('#cat-groups');
  container.innerHTML = '';
  const query = state.query.toLowerCase();
  let visible = 0;

  GROUPS.forEach((group) => {
    const cats = allCats().filter((cat) => {
      if (cat.group !== group) return false;
      if (!query) return true;
      return (cat.name + ' ' + cat.group).toLowerCase().includes(query);
    });
    if (!cats.length) return;
    visible += cats.length;

    const section = document.createElement('section');
    section.className = 'cat-group';

    const head = document.createElement('div');
    head.className = 'cat-group-head';
    const h3 = document.createElement('h3');
    h3.textContent = group;
    const line = document.createElement('span');
    line.className = 'line';
    head.append(h3, line);
    section.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'cat-grid';
    cats.forEach((cat) => grid.appendChild(renderCat(cat)));
    section.appendChild(grid);
    container.appendChild(section);
  });

  if (!visible) {
    const empty = document.createElement('div');
    empty.className = 'cat-empty';
    empty.textContent = 'Brak kategorii dla „' + state.query + '”. Spróbuj innej frazy albo dodaj kategorię z Wikipedii poniżej.';
    container.appendChild(empty);
  }
}

function renderCat(cat) {
  const active = state.selected.has(cat.id);
  const btn = document.createElement('button');
  btn.className = 'cat';
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(active));
  btn.dataset.id = cat.id;

  const emoji = document.createElement('span');
  emoji.className = 'cat-emoji';
  emoji.textContent = cat.icon || '🎯';

  const body = document.createElement('span');
  body.className = 'cat-body';
  const name = document.createElement('span');
  name.className = 'cat-name';
  name.textContent = cat.name;
  const count = document.createElement('span');
  count.className = 'cat-count';
  count.textContent = cat.live
    ? 'z Wikipedii · na żywo'
    : (cat.count || 0) + ' ' + plural(cat.count || 0, 'pytanie', 'pytania', 'pytań');
  body.append(name, count);

  const check = document.createElement('span');
  check.className = 'cat-check';

  btn.append(emoji, body, check);
  btn.addEventListener('click', () => {
    if (state.selected.has(cat.id)) state.selected.delete(cat.id);
    else state.selected.add(cat.id);
    btn.setAttribute('aria-pressed', String(!active));
    render();
    updateSummary();
  });
  return btn;
}

function updateSummary() {
  const cats = [...state.selected].map(catById).filter(Boolean);
  const known = cats.filter((c) => !c.live);
  const live = cats.length - known.length;
  const questions = known.reduce((sum, c) => sum + (c.count || 0), 0);

  $('#sum-cats').textContent = cats.length + (live ? ' (+' + live + ' live)' : '');
  $('#sum-q').textContent = questions
    ? new Intl.NumberFormat('pl-PL').format(questions) + (live ? ' + live' : '')
    : live
      ? 'z Wikipedii na żywo'
      : '0';

  const turns = state.turnsPerPlayer * 2;
  $('#sum-turns').textContent = turns + ' ' + plural(turns, 'tura', 'tury', 'tur');
  const seconds = turns * state.turnSeconds;
  const minutes = Math.round((seconds / 60) * 10) / 10;
  $('#sum-time').textContent = String(minutes).replace('.', ',') + ' min';

  const status = $('#cat-status');
  if (!cats.length) status.textContent = 'wybierz przynajmniej jedną';
  else if (live) status.textContent = cats.length + ' ' + plural(cats.length, 'kategoria', 'kategorie', 'kategorii') + ' · w tym live';
  else status.textContent = cats.length + ' ' + plural(cats.length, 'kategoria', 'kategorie', 'kategorii');
}

function startGame() {
  const cats = [...state.selected].map(catById).filter(Boolean);
  if (!cats.length) {
    toast('Wybierz przynajmniej jedną kategorię.', true);
    $('#cat-groups').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const p1 = ($('#p1').value || '').trim().slice(0, 18) || 'Gracz 1';
  const p2 = ($('#p2').value || '').trim().slice(0, 18) || 'Gracz 2';

  const cfg = {
    v: 1,
    id: Math.random().toString(36).slice(2, 10),
    players: [{ name: p1 }, { name: p2 }],
    turnSeconds: state.turnSeconds,
    turnsPerPlayer: state.turnsPerPlayer,
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      group: c.group,
      icon: c.icon,
      prompt: c.prompt,
      count: c.count ?? null,
      live: !!c.live,
      cat: c.cat || null,
    })),
    createdAt: Date.now(),
  };

  storeSet(CONFIG_KEY, cfg);
  storeSet('floor:selection', cfg.categories);

  const board = window.open('board.html', 'floor-board', 'popup=yes,width=1280,height=760');
  if (!board) toast('Zezwól na wyskakujące okna, żeby otworzyć ekran graczy.', true, 5000);
  window.location.href = 'host.html';
}

init();
