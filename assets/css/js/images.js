// Wspólne wczytywanie zdjęć. Wikimedia ma kilka hostów i czasem jeden z
// wariantów miniatur nie odpowiada — próbujemy kolejnych, zanim pokażemy puste pole.
const imageCache = new Map();

export function normalizeImageUrl(url) {
  if (!url) return '';
  let value = String(url).trim();
  if (value.startsWith('//')) value = 'https:' + value;
  // To ten sam plik, ale standardowy host miniaturek jest stabilniejszy.
  value = value.replace(/^https?:\/\/thumb\.wikimedia\.org\//i, 'https://upload.wikimedia.org/');
  value = value.replace(/^http:\/\//i, 'https://');
  return value;
}

export function imageCandidates(url) {
  const primary = normalizeImageUrl(url);
  if (!primary) return [];
  const out = [primary];
  if (/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\//i.test(primary)) {
    // Wikimedia odrzuca część szerokości, gdy oryginał jest mniejszy.
    // Trzy próby wystarczą, a mniej zapytań to mniejsze ryzyko HTTP 429.
    for (const width of [640, 500]) {
      const fallback = primary.replace(/\/\d+px-/, '/' + width + 'px-');
      if (fallback !== primary && !out.includes(fallback)) out.push(fallback);
    }
    const original = originalFromThumb(primary);
    if (original && !out.includes(original)) out.push(original);
  }
  if (/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i.test(primary)) {
    const withWidth = primary.includes('?') ? primary : primary + '?width=800';
    if (!out.includes(withWidth)) out.push(withWidth);
  }

  // Ostatnia deska ratunku: oryginalny plik przez Commons i jego generator
  // miniatur. Czasem tylko ten host odpowiada, gdy thumb.* jest chwilowo
  // ograniczony przez Wikimedia.
  const filename = originalFileName(primary);
  if (filename && /\.(jpe?g|png|webp|gif|svg)$/i.test(filename)) {
    const encoded = encodeURIComponent(filename);
    for (const candidate of [
      'https://commons.wikimedia.org/wiki/Special:FilePath/' + encoded + '?width=800',
      'https://commons.wikimedia.org/w/thumb.php?f=' + encoded + '&w=800',
    ]) {
      if (!out.includes(candidate)) out.push(candidate);
    }
  }
  return out;
}

function originalFileName(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return name.replace(/^\d+px-/, '');
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function originalFromThumb(url) {
  try {
    const parsed = new URL(url);
    const marker = '/thumb/';
    const at = parsed.pathname.indexOf(marker);
    if (at < 0) return '';
    const after = parsed.pathname.slice(at + marker.length);
    const parts = after.split('/');
    const thumbName = parts.pop() || '';
    if (parts.length < 3 || !/^\d+px-/.test(thumbName)) return '';
    const originalName = thumbName.replace(/^\d+px-/, '');
    parsed.pathname = parsed.pathname.slice(0, at) + '/' + parts.slice(0, 2).join('/') + '/' + originalName;
    parsed.search = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function loadOne(url, timeout = 12000) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (ok, source) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok ? source : '');
    };
    const timer = setTimeout(() => done(false), timeout);
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => done(img.naturalWidth > 0, url);
    img.onerror = () => done(false);
    img.src = url;
  });
}

async function loadWithRetry(candidates, timeout, rounds = 2) {
  for (let round = 0; round < rounds; round++) {
    for (const candidate of candidates) {
      const ok = await loadOne(candidate, timeout);
      if (ok) return ok;
    }
    // 429 i chwilowe błędy sieci nie powinny kończyć się pustym polem.
    if (round < rounds - 1) await sleep(450 + round * 350);
  }
  return '';
}

/** Wczytuje zdjęcie i zwraca pierwszy działający wariant (albo pusty string). */
export function preloadImage(url, timeout = 8000) {
  const candidates = imageCandidates(url);
  if (!candidates.length) return Promise.resolve('');
  const key = candidates[0];
  if (imageCache.has(key)) return imageCache.get(key);
  const promise = loadWithRetry(candidates, timeout, 2);
  imageCache.set(key, promise);
  // Nie zapamiętuj trwale porażki (np. chwilowego 429) — kolejne pytanie
  // może spróbować ponownie.
  promise.then((ok) => {
    if (!ok) imageCache.delete(key);
  });
  return promise;
}

/** Ładuje listę w tle, ograniczając liczbę równoczesnych zapytań. */
export async function preloadImages(urls, { concurrency = 1, limit = 6, delay = 250 } = {}) {
  const unique = [...new Set((urls || []).filter(Boolean))].slice(0, limit);
  let index = 0;
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (index < unique.length) {
      const url = unique[index++];
      results.push(await preloadImage(url));
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Ustawia zdjęcie w elemencie <img> z fallbackiem wariantów.
 * onState(true) po załadowaniu, onState(false) po wyczerpaniu wariantów.
 */
export function setImageWithFallback(img, url, onState) {
  if (!img) return Promise.resolve('');
  const candidates = imageCandidates(url);
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  if (!candidates.length) {
    onState?.(false);
    return Promise.resolve('');
  }
  return (async () => {
    // Najpierw korzystamy z wyniku wcześniejszego preloadu. Wcześniej ten
    // element pobierał zdjęcie od nowa, więc mimo rozgrzania cache pytanie
    // potrafiło „wisieć” kilka sekund albo pokazać brak zdjęcia.
    const cached = imageCache.get(candidates[0]);
    if (cached) {
      const ready = await cached;
      if (ready) {
        img.src = ready;
        onState?.(true);
        return ready;
      }
    }
    const ok = await loadWithRetry(candidates, 8000, 2);
    if (ok) {
      imageCache.set(candidates[0], Promise.resolve(ok));
      img.src = ok;
      onState?.(true);
      return ok;
    }
    onState?.(false);
    return '';
  })();
}
