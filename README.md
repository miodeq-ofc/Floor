# THE FLOOR — teleturniej na dwa ekrany

Gra w stylu *The Floor* dla **2–8 graczy**: losowa plansza z kategorii, pojedynek o pole przeciwnika i osobne zegary. Prowadzący ma tablet/laptop z odpowiedziami, gracze widzą planszę, pytanie i zegary. Całość to statyczna strona: **czysty JavaScript, zero serwera, zero logowania**, gotowa na GitHub Pages.

## Jak to działa

1. **Launcher (`index.html`)** — jedno kliknięcie otwiera **najpierw ekran graczy** w nowym oknie (na TV), a **bieżącą kartę zamienia w ekran prowadzącego**. Od razu widzisz konfigurację gry.
2. **Ekran prowadzącego (`host.html`)**
   - wpisujesz liczbę graczy (2–8) i imiona,
   - wybierasz zegar pojedynku (30/45/60/75 s na gracza),
   - losujesz planszę — wymiary dobierają się tak, żeby **każdy gracz dostał tyle samo pól** (np. 4 graczy → 6×6 = 36 pól, po 9), a terytoria są rozproszone po całej planszy,
   - w każdym polu losuje się inna kategoria z wybranej puli,
   - klikasz pole, żeby zmienić jego **właściciela** albo **wyszukać inną kategorię**,
   - startujesz grę.
3. **Przebieg pojedynku**
   - **Tura krąży po kolei** (1 → 2 → 3 → 1…). Aktualny gracz wybiera najpierw **własne pole**, potem **sąsiednie pole przeciwnika** (góra, dół, lewo lub prawo). Może wybrać dowolne swoje pole z frontierem, nie tylko jedno.
   - Pojedynek odbywa się w **kategorii pola, z którego atakujesz**. Po zakończeniu **oba pola — atakujące i atakowane — przyjmują kategorię atakowanego**, a zwycięzca ma oba. Reszta pól przegranego zostaje u niego, a plansza nie ma pustych miejsc.
   - Każdy gracz ma **własny zegar**. Pretendent zaczyna; tylko aktywny zegar leci.
   - **DOBRZE** — odpowiedź poprawna; przez ok. 3 s widać tylko poprawną odpowiedź, a **zegar stoi**. Dopiero po zniknięciu odpowiedzi startuje zegar przeciwnika.
   - **PASS** — **bez kary**: zegar nadal leci, a poprawna odpowiedź jest widoczna ok. 3 s. Nic nie ubywa.
   - **Koniec pojedynku wyznacza tylko czas** — nie ma przycisku błędnej odpowiedzi. Gdy czyjś zegar dobiegnie zera, drugi gracz wygrywa i przejmuje pole. Po pojedynku **tura przechodzi do następnego gracza** — zwycięzca nie dostaje dodatkowego ataku.
   - Gra kończy się, gdy jedna osoba ma całą planszę. Może mieć przy tym kilka różnych kategorii — to jest zamierzone.
4. **Ekran graczy (`board.html`)** — duża plansza z kategoriami i właścicielami, a w pojedynku: wielkie **VS** z rolami i imionami, dwa zegary, zdjęcie i pytanie. Po DOBRZE/PASS na ok. 3 s pojawia się **tylko odpowiedź** na kolorowym tle — bez dopisków o karze; w trakcie odpytywania ekran nie dostaje jej w synchronizacji. Dźwięki (tik zegara, odliczanie, dobra/zła odpowiedź, PASS) są generowane przez Web Audio i można je wyłączyć przyciskiem 🔊.

Skróty na ekranie prowadzącego: **D** / Enter = DOBRZE, **P** / Spacja = PASS.

### Dwa okna / dwa ekrany

Okna dogadują się przez `BroadcastChannel` (z fallbackiem na `localStorage`). Działa to **w obrębie jednej przeglądarki na jednym urządzeniu**:

1. Podłącz TV przez HDMI i ustaw **rozszerz ekran** (nie duplikuj).
2. Na stronie głównej kliknij **„Otwórz 2 ekrany”** i zezwól na wyskakujące okna. **Najpierw otworzy się ekran graczy**, a bieżąca karta od razu stanie się ekranem prowadzącego.
3. Przeciągnij okno **ekranu graczy** na TV i wciśnij pełny ekran (⛶ albo F11).
4. Wróć do okna prowadzącego (bieżąca karta), ustaw graczy i planszę, kliknij **Start gry**.

Jeżeli przeglądarka zablokuje okno ekranu graczy, bieżąca karta i tak zostaje **ekranem prowadzącego** — ekran graczy otworzysz przyciskiem **„Ekran graczy”** w nagłówku (albo osobną kartą `board.html`).

## Plansza i kategorie

- **Plansza** ma od 4×4 do 7×8 pól; wymiary są dobierane tak, aby liczba pól dzieliła się przez liczbę graczy (6–10 pól na osobę). Przykładowo: 2 → 4×4 (po 8), 3 → 5×6 (po 10), 4 → 6×6 (po 9), 5 → 6×5 (po 6), 6 → 6×6 (po 6), 7 → 7×7 (po 7), 8 → 7×8 (po 7). To najbliższe równe podziały — plansza nigdy nie ma pustych pól.
- **Terytoria nie muszą być ciągłe**: losowanie przydziela pola równo, ale rozrzuca je po całej planszy. Możesz mieć pole w lewym górnym rogu i drugie w prawym dolnym.
- **Sąsiednie pola tego samego gracza i tej samej kategorii łączą się w jeden kształt** (poligon): wspólne krawędzie znikają, a etykieta kategorii jest tylko raz. Łączą się wyłącznie pola stykające się bokiem — góra/dół lub lewo/prawo; pola po skosie i oddalone zostają osobne.
- **Kategorie** to konkretne, węższe tematy (np. „Przyprawy”, „Rasy psów”, „Logotypy znanych marek”, „Zamki”), a nie szerokie działy. W puli jest **78 gotowych paczek** i **4483 pytania** oraz **93 dodatkowe kategorie z Wikipedii** (m.in. ptaki, ssaki, architektura, ludzie i miejsca) — łącznie **171 kategorii**. Większe paczki są uzupełniane do **90 pytań**, a kategorie z Wikipedii dociągają pytania przy pierwszym pojedynku i zostają w pamięci przeglądarki.
- Pula jest wyszukiwalna; można zaznaczyć tylko wybrane kategorie. Pole na planszy też ma wyszukiwarkę kategorii.
- Losowanie bez powtórek w całej grze: każde pytanie z kategorii jest oznaczone jako użyte, a kolejka nie resetuje się w środku pojedynku. Przed startem pojedynku gra sprawdza, czy jest co najmniej 20 pytań; jeśli nie — **dociąga je z Wikipedii** (`loadMorePack`: kategoria + podkategorie + wyszukiwanie). W trakcie pojedynku, gdy zostaje mało pytań, robi to samo w tle.
- Źródłem nie jest wyłącznie plik z paczką: nowe pytania są pobierane automatycznie z kategorii Wikipedii, a nie tylko z gotowej listy. Kategorie oznaczone jako „na żywo” nie mają sztywnej listy — pierwszy pojedynek pobiera strony i zdjęcia, a potem korzysta z cache.

### Automatyczne uzupełnianie i walidacja

Baza nie jest zamkniętą listą. `tools/enrich-packs.mjs` przechodzi **wszystkie** paczki i automatycznie:

- pobiera strony z kategorii Wikipedii oraz z podkategorii (2 poziomy),
- jeśli nadal brakuje — korzysta z wyszukiwania Wikipedii,
- odrzuca duplikaty, listy, disambiguacje, ogólniki typu „Piwo” i puste pytania,
- odrzuca zdjęcia, które są dokumentem, mapą, plakatem, okładką, nutami albo logotypem w kategorii, gdzie logotypu być nie powinno,
- zostawia kuratorowane pozycje na początku paczki, a brakujące dokłada do **90 pytań na kategorię**,
- zapisuje raport `data/packs/quality-report.json` i przebudowuje `index.json`.

Uruchomienie:

```bash
node tools/enrich-packs.mjs --target=90
```

Gra dodatkowo dociąga pytania w trakcie pojedynku, więc nawet kategoria z małą liczbą stron Wikipedii nie kończy się po trzech pytaniach. Jeżeli Wikipedia chwilowo ogranicza zapytania (HTTP 429), gra korzysta z tego, co już ma, i nie przerywa pojedynku.

### Jakość danych

Baza jest generowana z polskiej Wikipedii i Wikidata (`tools/build-packs.mjs`), a następnie poprawiana przez `tools/refine-packs.mjs` i `tools/enrich-packs.mjs`:

- **logotypy** — tylko znane marki (≥20 wersji językowych), polskie nazwy, bez zdjęć i szerokich wordmarków; w ustawieniach jest **„Zamazuj logotypy”** (domyślnie włączone),
- **rasy psów** — 150 najpopularniejszych ras (filtr liczby wersji językowych), a nie wszystkie 350 pozycji z kategorii,
- **mięsa** — kuratorowana lista normalnych cuts i wędlin zamiast „Bushmeat” i „mięso in vitro”,
- **telefony / podzespoły** — usunięte pytania o konkretne modele („Samsung Galaxy S5 Mini”); nie ma ich już w bazie,
- **owoce jadalne** — 30 kuratorowanych, naprawdę jadalnych owoców (bez „przemysłu owocowo-warzywnego” i orzecha laskowego) plus automatyczne uzupełnienie, zdjęcia z jasnym tłem,
- **aplikacje internetowe** — **75 popularnych usług** (X, YouTube, Facebook, Google, Instagram, ChatGPT, Allegro…), a nie wszystkie aplikacje z Wikipedii,
- **marki samochodów** — 30 modeli spotykanych w Polsce, zdjęcia aut z przodu lub z boku; usunięty Brabus i logotypy na ciemnym tle,
- **tłumaczenia** — poprawione m.in. „baba wielkanocna” → **„babka wielkanocna”**,
- **walidacja** — automatyczna kontrola wszystkich paczek: unikalne odpowiedzi, sensowny tytuł, zdjęcie z Wikimedia/Simple Icons, brak dokumentów, list, wydarzeń i pojęć niezwiązanych z kategorią; wynik w `data/packs/quality-report.json`.
- **zdjęcia tematyczne** — odrzucane są pliki będące siedzibami firm, sklepami, półkami, fabrykami, mapami i reklamami w kategoriach, w których powinien być produkt/obiekt (m.in. marki napojów, napoje, samochody, herbaty). Odpowiedzi typu „face lifting” albo „tuning” nie trafiają do pytań „Jaki to samochód?”. Ładowanie ma kilka wariantów miniatur, fallback na Commons i ponowną próbę po chwilowym błędzie/HTTP 429, więc pojedyncze zdjęcie nie zostawia pustego pola.

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
assets/js/images.js     odporne ładowanie zdjęć (warianty miniatur + cache)
assets/js/game.js       plansza, terytoria, sąsiedztwo, zegary
assets/js/host.js       konfiguracja + przebieg pojedynków
assets/js/board.js      render ekranu graczy
data/packs/             baza pytań (index.json + kategorie)
tools/build-packs.mjs      generator z Wikipedii/Wikidata
tools/refine-packs.mjs     filtr jakości (psy, logotypy, mięsa, modele)
tools/enrich-packs.mjs     automatyczne uzupełnianie do 90 pytań + walidacja
tools/merge-cache.py       scalanie cache kategorii/wyszukiwania i filtr jakości
tools/curate-popular.py    kurator popularnych nazw (owoce, aplikacje, auta)
tools/curate-popular-en.py kurator angielskich nazw i zdjęć
data/packs/quality-report.json  raport automatycznej walidacji
```

## Ograniczenia

- Dwa ekrany muszą być w **tej samej przeglądarce** (jeden komputer). Osobne urządzenia wymagają WebRTC lub backendu.
- Przeglądarki blokują wyskakujące okna — zezwól tej stronie na ich otwieranie.
- Jakość zdjęć z Wikipedii bywa nierówna. Paczki **owoce jadalne**, **aplikacje internetowe**, **marki samochodów**, **kompozytorzy**, **minerały** i **samochody** są kuratorowane pod kątem rozpoznawalnych nazw; resztę można podmienić w edytorze pola. Jest **PASS** i zmiana kategorii.
- Ekran graczy nie dostaje odpowiedzi w trakcie odpytywania; pojawia się ona dopiero w celowym, ok. 3-sekundowym reveal po DOBRZE/PASS jako sam napis na kolorowym tle (wtedy widać ją też na TV).
- Gra jest zaprojektowana na jeden komputer z dwoma oknami; nie ma pokoi online.
