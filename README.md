# THE FLOOR — teleturniej na dwa ekrany

Gra w stylu *The Floor* dla **2–8 graczy**: losowa plansza z kategorii, pojedynek o pole przeciwnika i osobne zegary. Prowadzący ma tablet/laptop z odpowiedziami, gracze widzą planszę, pytanie i zegary. Całość to statyczna strona: **czysty JavaScript, zero serwera, zero logowania**, gotowa na GitHub Pages.

## Jak to działa

1. **Launcher (`index.html`)** — jedno kliknięcie otwiera **dwa okna**: ekran prowadzącego i ekran graczy. Najpierw ustawiasz grę, dopiero potem startujesz.
2. **Ekran prowadzącego (`host.html`)**
   - wpisujesz liczbę graczy (2–8) i imiona,
   - wybierasz zegar pojedynku (30/45/60/75 s na gracza),
   - losujesz planszę — wymiary dobierają się tak, żeby **każdy gracz dostał tyle samo pól** (np. 4 graczy → 8×7 = 56 pól, po 14),
   - w każdym polu losuje się inna kategoria z wybranej puli,
   - klikasz pole, żeby zmienić jego **właściciela** albo **wyszukać inną kategorię**,
   - startujesz grę.
3. **Przebieg pojedynku**
   - Losowany jest **challenger**. Podświetlone są pola sąsiadów (wspólna krawędź) — prowadzący klika jedno z nich.
   - Pojedynek odbywa się **zawsze w kategorii atakowanego pola**.
   - Każdy gracz ma **własny zegar**. Challenger zaczyna; tylko aktywny zegar leci.
   - **DOBRZE** — odpowiedź poprawna, zegar zatrzymuje się, kontrolę i zegar przejmuje przeciwnik.
   - **PASS** — −3 s dla aktywnego gracza, na chwilę pokazuje się odpowiedź, ale zegar **nadal leci**.
   - Kto pierwszy spali swój zegar, **odpada**; zwycięzca przejmuje **wszystkie jego pola**.
   - Zwycięzca może atakować dalej albo prowadzący może wylosować nowego challengera.
   - Gra kończy się, gdy jedna osoba ma całą planszę.
4. **Ekran graczy (`board.html`)** — plansza z kategoriami i właścicielami, a w pojedynku: dwa zegary, zdjęcie, pytanie i pasek odpowiedzi po PASS. **Nie dostaje prawidłowej odpowiedzi** w komunikacie synchronizacji — widać ją dopiero po PASS.

Skróty na ekranie prowadzącego: **D** / Enter = DOBRZE, **P** / Spacja = PASS.

### Dwa okna / dwa ekrany

Okna dogadują się przez `BroadcastChannel` (z fallbackiem na `localStorage`). Działa to **w obrębie jednej przeglądarki na jednym urządzeniu**:

1. Podłącz TV przez HDMI i ustaw **rozszerz ekran** (nie duplikuj).
2. Na stronie głównej kliknij **„Otwórz 2 ekrany”** i zezwól na wyskakujące okna.
3. Przeciągnij okno **ekranu graczy** na TV i wciśnij pełny ekran (⛶ albo F11).
4. Wróć do okna prowadzącego, ustaw graczy i planszę, kliknij **Start gry**.

Jeżeli przeglądarka zablokuje drugie okno, launcher otwiera **ekran graczy w bieżącej karcie**, a prowadzącego w osobnym oknie. Dodatkowo na ekranie prowadzącego jest przycisk **„🖥️ Ekran graczy”**.

## Plansza i kategorie

- **Plansza** ma od 4×4 do 9×10 pól; wymiary są dobierane tak, aby liczba pól dzieliła się przez liczbę graczy (4–16 pól na osobę). Przykładowo: 2 → 6×5 (po 15), 4 → 8×7 (po 14), 6 → 7×6 (po 7), 7 → 7×7 (po 7), 8 → 8×7 (po 7).
- **Kategorie** to konkretne, węższe tematy (np. „Przyprawy”, „Rasy psów”, „Logotypy znanych marek”, „Zamki”), a nie szerokie działy. W puli jest **77 kategorii** i **ponad 3500 pytań**.
- Pula jest wyszukiwalna; można zaznaczyć tylko wybrane kategorie. Pole na planszy też ma wyszukiwarkę kategorii.
- Losowanie bez powtórek: użyte pytania są zapamiętywane w `localStorage`; po wyczerpaniu pula tasuje się od nowa.

### Jakość danych

Baza jest generowana z polskiej Wikipedii i Wikidata (`tools/build-packs.mjs`), a następnie poprawiana przez `tools/refine-packs.mjs`:

- **logotypy** — tylko znane marki (≥20 wersji językowych), polskie nazwy, bez zdjęć i szerokich wordmarków; w ustawieniach jest **„Zamazuj logotypy”** (domyślnie włączone),
- **rasy psów** — 150 najpopularniejszych ras (filtr liczby wersji językowych), a nie wszystkie 350 pozycji z kategorii,
- **mięsa** — kuratorowana lista normalnych cuts i wędlin zamiast „Bushmeat” i „mięso in vitro”,
- **telefony / podzespoły** — usunięte pytania o konkretne modele („Samsung Galaxy S5 Mini”); nie ma ich już w bazie.

Źródła: Wikipedia (CC BY-SA), Wikidata (CC0), zdjęcia z Wikimedia Commons. Do gry prywatnej bez problemu; przy publicznej publikacji zachowaj informację o źródle i licencjach.

Przebudowa / poprawki bazy (opcjonalnie, wymaga internetu):

```bash
node tools/build-packs.mjs --force
node tools/refine-packs.mjs
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
index.html              launcher — otwiera dwa ekrany
host.html               ekran prowadzącego: konfiguracja, plansza, odpowiedzi
board.html              ekran graczy: plansza, pytanie, zegary
assets/css/style.css    bazowy wygląd
assets/css/floor.css    plansza, edytor pól, pojedynek
assets/js/common.js     dane, kanał synchronizacji, kolejki pytań
assets/js/game.js       plansza, terytoria, sąsiedztwo, zegary
assets/js/host.js       konfiguracja + przebieg pojedynków
assets/js/board.js      render ekranu graczy
data/packs/             baza pytań (index.json + kategorie)
tools/build-packs.mjs   generator z Wikipedii/Wikidata
tools/refine-packs.mjs  filtr jakości (psy, logotypy, mięsa, modele)
```

## Ograniczenia

- Dwa ekrany muszą być w **tej samej przeglądarce** (jeden komputer). Osobne urządzenia wymagają WebRTC lub backendu.
- Przeglądarki blokują wyskakujące okna — zezwól tej stronie na ich otwieranie.
- Jakość zdjęć z Wikipedii bywa nierówna; dlatego jest **PASS** i możliwość zmiany kategorii w polu.
- Ekran graczy nie dostaje odpowiedzi w komunikacie synchronizacji — nie da się jej „podejrzeć” w narzędziach przeglądarki przed czasem. Wyjątkiem jest celowy, krótki reveal po PASS.
- Gra jest zaprojektowana na jeden komputer z dwoma oknami; nie ma pokoi online.
