# THE FLOOR — teleturniej na dwa ekrany

Gra quizowa w stylu *The Floor* dla **dwóch graczy**, w której **prowadzący siedzi z tabletem**, a gracze widzą tylko zdjęcie i zegar. Całość to statyczna strona: **czysty JavaScript, zero serwera, zero logowania**, gotowa na GitHub Pages.

## Jak to działa

1. **Lobby (`index.html`)** — wpisz imiona, wybierz długość tury (30/45/60/90 s), liczbę tur na gracza i kategorie (można też wyszukać kategorię w Wikipedii na żywo i dodać ją do gry).
2. **START GRY** otwiera dwa okna:
   - `host.html` — **ekran prowadzącego**: widzi pytanie, prawidłową odpowiedź, wynik i ma dwa wielkie przyciski.
   - `board.html` — **ekran graczy**: tylko zdjęcie, kategoria, zegar i wynik. Odpowiedź pojawia się na chwilę dopiero po kliknięciu „DOBRZE”.
3. Gracze odpowiadają **na głos**. Prowadzący klika:
   - **DOBRZE** — punkt, na ekranie graczy na ~2 s pojawia się odpowiedź, a zegar zatrzymuje się na ten moment i wraca z następnym pytaniem.
   - **PASS** — następne pytanie, **czas leci dalej** (bez zatrzymywania).
4. Gdy czas minie, tura przechodzi na drugiego gracza — **jego zegar startuje od nowa**. Po ostatniej turze ekrany pokazują zwycięzcę.

Skróty klawiszowe na ekranie prowadzącego: **D** = dobrze, **P** = pass, **K** = zakończ turę.

### Dwa okna / dwa ekrany

Okna dogadują się przez `BroadcastChannel` (z fallbackiem na zdarzenia `localStorage`). Działa to **w obrębie jednej przeglądarki na jednym urządzeniu** — na przykład laptop z HDMI i TV:

1. Podłącz TV przez HDMI i ustaw **rozszerz ekran** (nie duplikuj).
2. Kliknij START GRY — otworzą się dwa okna.
3. Przeciągnij okno **ekranu graczy** na TV i wciśnij pełny ekran (przycisk ⛶ na górze albo F11).

Z tabletem i TV bez komputera: otwórz grę na tablecie, a ekran graczy przeciągnij na drugi monitor tabletu (jeśli obsługuje) lub użyj laptopa jako hosta. **Synchronizacja między dwoma różnymi urządzeniami wymagałaby serwera/WebRTC — samo GitHub Pages tego nie da.**

## Pytania i baza

Pytania **nie są pisane ręcznie**. Skrypt `tools/build-packs.mjs` pobiera z polskiej Wikipedii kategorie haseł ze zdjęciami (prowadzący widzi polski tytuł hasła) oraz z Wikidata **logotypy firm i marek, flagi i herby państw**. Wynik trafia do `data/packs/*.json` i jest dołączony do repo, więc gra startuje natychmiast i działa też bez internetu (poza samymi zdjęciami, które są podlinkowane z Wikimedia).

- **~80 kategorii** i **~4000 pytań** w gotowej bazie (m.in. marki samochodów, przyprawy, grzyby, rasy psów, flagi, herby, logotypy firm, władcy Polski, smartfony, zabawki, monety).
- Losowanie bez powtórek: użyte pytania są zapamiętywane w `localStorage`; po wyczerpaniu puli kategoria tasuje się od nowa.
- **Własna kategoria**: w lobby wpisz frazę (np. „zamki”, „sery”), poczekaj na wyniki z Wikipedii i kliknij „dodaj”. Pytania pobiorą się przy starcie tury i zostaną w cache na 12 h.
- Źródła: Wikipedia (CC BY-SA) i Wikidata (CC0), zdjęcia z Wikimedia Commons. Do gry prywatnej — bez problemu; przy publicznej publikacji zachowaj informację o źródle i licencjach.

Przebudowa bazy (opcjonalnie, wymaga internetu):

```bash
node tools/build-packs.mjs --force
```

## Uruchomienie lokalne

Nie otwieraj `index.html` bezpośrednio z dysku (`file://`) — moduły ES i pliki JSON wymagają HTTP.

```bash
python3 -m http.server 3000
# albo: npx serve .
```

Wejdź na `http://localhost:3000`.

## Publikacja na GitHub Pages

1. Wypchnij repo na GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, wybierz `main` i katalog `/ (root)`.
3. Gra będzie pod `https://<user>.github.io/<repo>/`.

Wszystkie ścieżki są względne, więc działa też w podkatalogu. Brak backendu, build-stepu i zależności runtime.

## Struktura

```
index.html            lobby / wybór kategorii
host.html             ekran prowadzącego (z odpowiedziami)
board.html            ekran graczy (bez odpowiedzi)
assets/css/style.css  cały wygląd
assets/js/common.js   dane, kanał synchronizacji, kolejki pytań
assets/js/lobby.js    wybór kategorii i start
assets/js/host.js     maszyna stanów gry i zegar
assets/js/board.js    render ekranu graczy
data/packs/           wygenerowana baza pytań (index.json + kategorie)
tools/                skrypty budujące bazę z Wikipedii/Wikidata
```

## Ograniczenia

- Dwa ekrany muszą być w **tej samej przeglądarce** (jeden komputer). Osobne urządzenia wymagają WebRTC lub backendu.
- Przeglądarki blokują wyskakujące okna — zezwól tej stronie na ich otwieranie.
- Jakość zdjęć z Wikipedii bywa nierówna (czasem zamiast logotypu jest zdjęcie fabryki). Dlatego jest **PASS**.
- Ekran graczy nie dostaje odpowiedzi w komunikacie synchronizacji — nie da się jej „podejrzeć” w narzędziach przeglądarki przed czasem.
