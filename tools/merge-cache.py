#!/usr/bin/env python3
"""Scala cache kategorii i wyszukiwania pobrane przez przeglądarkę.

Cache powstaje w przeglądarce (osobny limit IP), a ten skrypt wykonuje
te same filtry jakości co tools/enrich-packs.mjs. Dzięki temu można
uzupełnić bazę bez czekania na odblokowanie action=query w terminalu.
"""
import json
import os
import re
import sys
from pathlib import Path

OUT = Path('data/packs')
TARGET = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--target=')), 90))

GENERIC = {s.lower() for s in """
owoce owoce jadalne warzywa grzyby grzyby jadalne grzyby trujące desery zupy ciasta
ciasta deserowe ciasta wytrawne przekąski słodycze koktajle napoje napoje bezalkoholowe
herbaty wina piwo owoce morza wędliny mięsa mięso pierogi ryby ryby akwariowe psy rasy psów
koty rasy kotów konie rasy koni gołębie rasy gołębi motyle owady kaktusy jaskinie góry
pustynie zamki plaże parki narodowe władcy władcy polski prezydenci prezydenci usa
cesarze rzymscy pomniki muzea gatunki muzyczne tańce kompozytorzy dyrygenci aktorzy
polscy aktorzy teleturnieje smartfony procesory karty graficzne telefony lokomotywy
pociągi rowery silniki roboty maszyny pierwiastki pierwiastki chemiczne minerały skały
sieci marki odzieżowe marki kosmetyków marki napojów marki piwa hotele restauracje
zabawki gry planszowe monety znaczki znaczki pocztowe odznaczenia zegarki drzwi
drzwi i bramy samochody motocykle ciężarówki samochody ciężarowe autobusy
samochody terenowe samochody wyścigowe formuła 1 samoloty statki budynki drzewa
kwiaty zwierzęta rośliny marki samochodów aplikacje aplikacje internetowe logotypy
logotypy znanych marek flagi flagi państw herby herby państw skamieniałości owoc
warzywo grzyb deser zupa ciasto przekąska słodycz koktajl napój herbata wino owoc morza
wędlina pieróg pies kot koń gołąb motyl owad kaktus jaskinia góra pustynia zamek
plaża park narodowy władca prezydent cesarz pomnik muzeum gatunek taniec kompozytor
dyrygent aktor teleturniej smartfon procesor karta graficzna telefon lokomotywa pociąg
rower silnik robot maszyna pierwiastek minerał skała sieć marka odzieżowa marka
kosmetyków marka napoju marka piwa hotel restauracja zabawka gra planszowa moneta
znaczek odznaczenie zegarek drzwi samochód motocykl ciężarówka autobus samochód
terenowy samochód wyścigowy samolot statek budynek drzewo kwiat zwierzę roślina
marka samochodu aplikacja logotyp flaga herb skamieniałość
""".split()}

BAD = {s.lower() for s in """
Baryłka Maß Kiper Biergarten Rail Ale Trail Alkoholizm
Grzane wino Degustacja wina Wino w religii Prohibicja w Stanach Zjednoczonych Portugalia Herakles Gruzja
Noc Muzeów Międzynarodowy Dzień Muzeów Edukacja muzealna Choroba Byne’a Międzynarodowy Związek Muzeów Górskich
Kraków Zakopane Marsala Bydgoszcz
Parki narodowe w Polsce Parki krajobrazowe w Polsce Zgromadzenie Narodowe
Kuchnia rosyjska Bambi Wietnam Azory Kawa
Koło wodne Wiatrak Hamownia Jonolot Messerschmitt Bf 109 Toyota Celica
Kuba Wojewódzki Wagon sypialny Wojciech Szczęsny Toto Wolff Mercedes-Benz Lotus Cars Samochód sportowy
Pies domowy Maria Skłodowska-Curie Edward Konecki Mieczysław Wątorski Czesław Borowczyk
Miron Białoszewski Kandaryn Krzysztof Kamil Baczyński Aleksiej Leonow Kartka pocztowa
Nowe Miasto nad Metują Louis Vuitton Obóz zagłady w Treblince Błonie La Chaux-de-Fonds
TomTom Cindy Crawford Skratki
Cudowne Mosty Mount Everest Dolina Będkowska Rezerwat przyrody Panieńskie Skały
Meyer Lansky Poznań Alicante Katowice Piotr Kędzierski Adam Gessler Rumia Nikiszowiec
""".split()}

BAD_PHRASES = {s.strip().lower() for s in """
Międzynarodowy Dzień Muzeów
Międzynarodowy Związek Muzeów Górskich
Noc Muzeów
Edukacja muzealna
Choroba Byne’a
Grzane wino
Degustacja wina
Wino w religii
Historia wina
Wady wina
Rail Ale Trail
Polska Partia Przyjaciół Piwa
Parki narodowe w Polsce
Parki krajobrazowe w Polsce
Parki narodowe w Hiszpanii
Parki narodowe we Francji
Park narodowy
Kuchnia rosyjska
Koszyczek do szklanki
Torebka herbaty
Amatorowie herbaty i kuriera
Koło wodne
Koło deptakowe
Wytwórnia Silników Wysokoprężnych Andoria
Mleko ryżowe
Miód pitny
Koniak
Samochód wyścigowy
Samochód sportowy
Wyścig Tatrzański
Flagi wyścigowe
Enzo Ferrari
Znaczek pocztowy
Poczta Polska
Poczta Watykańska
Walor filatelistyczny
Poczta Polska w Wolnym Mieście Gdańsku
Antoni Patek
Kryzys kwarcowy
Dewizka
Mińska Fabryka Zegarków
Struktura skały
Rezerwat przyrody Panieńskie Skały
Tokio Hotel
Konserwacja i restauracja dzieł sztuki
Konserwacja i restauracja zabytków
Restauracja fresków w kaplicy Sykstyńskiej
Restauracja Burbonów
Casual dining
Rybołówstwo
Paluszki rybne
Targ rybny
Ciastko z krabem
Muzeum wirtualne
Muzea i parki edukacyjne
Grupa Laokoona
Ripley’s Believe It or Not!
Legendy Hollywoodu
Browar w Grodzisku Wielkopolskim
Muzeum etnograficzne
""".splitlines() if s.strip()}

BAD_TOKENS = {'dzień', 'edukacja', 'choroba', 'związek', 'partia', 'degustacja', 'religii', 'wady',
              'kryzys', 'dewizka', 'fabryka', 'wytwórnia', 'tokio', 'konserwacja', 'zabytków', 'fresków',
              'burbonów', 'rybołówstwo', 'targ', 'paluszki', 'ciastko', 'walor', 'struktura', 'rezerwat',
              'casual', 'enzo', 'toto', 'antoni', 'kierat', 'wiatrak', 'hamownia', 'jonolot', 'legendy'}

KEYWORDS = {
    'muzea': ['muze', 'museum'], 'piwo': ['piw', 'browar'], 'wina': ['win', 'winnic'],
    'parki-narodowe': ['park'], 'herbaty': ['herbat'], 'silniki': ['silnik'],
    'marki-napojow': ['napój', 'napoj', 'marka'], 'samochody-wyscigowe': ['wyścig', 'samochód'],
    'znaczki': ['znaczek', 'poczta', 'filatel'], 'zegarki': ['zegar'], 'skaly': ['skał'],
    'hotele': ['hotel'], 'restauracje': ['restaurac'], 'marki-kosmetykow': ['kosmetyk', 'marka'],
    'marki-odziezowe': ['odzież', 'marka'], 'sieci-handlowe': ['sieć', 'sklep', 'marka'],
    'samochody-ciezarowe': ['ciężarów', 'samochód'], 'samochody': ['samochód'],
    'owoce-morza': ['owoc morza', 'owoce morza', 'ryb', 'małż', 'krab', 'ośmiornic', 'kalmar'],
    'wedliny': ['wędlin', 'kiełbas', 'szynk', 'salami', 'boczek'],
    'miesa': ['mięs', 'wołow', 'wieprz', 'drób', 'baranin', 'jagnięc', 'cielęc'],
    'pierogi': ['pieróg', 'pierog'], 'przekaski': ['przekąsk'],
    'slodycze': ['słodycz', 'cukierek', 'czekolad', 'ciastk', 'żel'], 'ciasta': ['ciast'],
    'tance': ['taniec', 'tańc'], 'koktajle': ['koktajl'], 'gatunki-muzyczne': ['gatunek', 'muzyk'],
    'zabawki': ['zabawk'], 'gry-planszowe': ['gra planszowa', 'gra'],
    'pierwiastki': ['pierwiastek', 'pierwiastk'], 'mineraly': ['minerał'],
    'motyle': ['motyl'], 'owady': ['owad'], 'kaktusy': ['kaktus'], 'gory': ['góra', 'gór', 'szczyt'],
    'jaskinie': ['jaskini'], 'plaze': ['plaż'], 'wladcy-polski': ['władca', 'król', 'książę', 'cesarz'],
    'prezydenci-usa': ['prezydent'], 'polscy-aktorzy': ['aktor'], 'roboty': ['robot'],
    'maszyny': ['maszyn'], 'pociagi': ['pociąg', 'kolej'], 'rowery': ['rower'],
    'rasy-golebi': ['gołąb'], 'rasy-koni': ['koń', 'koni'], 'rasy-kotow': ['kot'],
    'skamienialosci': ['skamieniał'], 'zamki': ['zamek', 'zamk'], 'owoce-jadalne': ['owoc'],
    'warzywa': ['warzyw'], 'desery': ['deser'], 'zupy': ['zup'], 'przyprawy': ['przypraw'],
    'grzyby-jadalne': ['grzyb'], 'grzyby-trujace': ['grzyb'], 'ryby-akwariowe': ['ryb'],
    'marki-samochodow': ['marka', 'samochód'],
}

IMAGE_BAD = re.compile(
    r'(screenshot|zrzut|diagram|schemat|wykres|chart|mapa|map_|_map|plan\b|logo|logotyp|wordmark|icon|ikona|cover|okładka|poster|plakat|sheet|score|partytura|nuty|rag|schallplatte|record|album|naczynia|kuchenne|menu|ulotka|reklama)',
    re.I,
)


def clean(title):
    return re.sub(r'\s*\([^)]*\)\s*$', '', str(title)).strip()


def title_ok(pack, title):
    raw = str(title or '').strip()
    a = clean(raw)
    low = a.lower()
    if not a or len(a) < 2 or len(a) > 65:
        return False
    if low in GENERIC or low in BAD or low in BAD_PHRASES or low == pack['name'].lower():
        return False
    if any(re.search(r'\b' + re.escape(t) + r'\b', low) for t in BAD_TOKENS):
        return False
    if re.match(r'^(lista|lasy|noc|dzień|edukacja|choroba|związek|kraków|zakopane)\b', raw, re.I):
        return False
    if re.search(r'\((ujednoznacznienie|disambiguation)\)', raw, re.I):
        return False
    if re.match(r'^\d{1,4}$', raw):
        return False
    if re.match(r'^(Galeria|Kategoria|Szablon|Plik|Wikiprojekt|Wikipedia|Portal):', raw, re.I):
        return False
    if re.search(r'\b(wykaz|spis|lista|galeria)\b', raw, re.I):
        return False
    return True


def image_ok(pack, img):
    if not img:
        return False
    if pack['id'] == 'aplikacje-internetowe' and img.startswith('https://cdn.simpleicons.org/'):
        return True
    if not re.match(r'^https://(upload|thumb)\.wikimedia\.org/', img, re.I):
        return False
    f = os.path.basename(img.split('?')[0]).lower()
    if not re.search(r'\.(jpe?g|png|webp|gif|svg)$', f):
        return False
    if pack['id'] == 'marki-samochodow' and re.search(r'(logo|badge|emblem|znak|brand)', f):
        return False
    if IMAGE_BAD.search(f):
        return False
    return True


def keywords(pack):
    return KEYWORDS.get(pack['id'], [pack['name'].lower()])


cat = json.load(open(OUT / '_cat.json', encoding='utf-8'))
search = json.load(open(OUT / '_rest.json', encoding='utf-8'))
index = json.load(open(OUT / 'index.json', encoding='utf-8'))
report = []
for meta in index['packs']:
    pid = meta['id']
    if pid == 'aplikacje-internetowe':
        continue
    path = OUT / (pid + '.json')
    pack = json.load(open(path, encoding='utf-8'))
    if len(pack['items']) >= TARGET:
        continue
    before = len(pack['items'])
    seen_a = {x['a'].lower() for x in pack['items']}
    seen_i = {x['img'] for x in pack['items']}
    items = [x for x in pack['items'] if title_ok(pack, x['a']) and image_ok(pack, x['img'])]
    seen_a = {x['a'].lower() for x in items}
    seen_i = {x['img'] for x in items}
    added = []

    def add(title, img, description=''):
        if len(items) + len(added) >= TARGET:
            return
        if description and re.search(r'(lista|list of|ujednoznacznienie|disambiguation)', description, re.I):
            return
        a = clean(title)
        low = a.lower()
        if low in seen_a or not title_ok(pack, a):
            return
        if img in seen_i or not image_ok(pack, img):
            return
        seen_a.add(low)
        seen_i.add(img)
        added.append({'a': a, 'img': img})

    # Najpierw dokładni członkowie kategorii (cache z action=query).
    for p in cat.get(pid, []):
        add(p.get('title'), (p.get('thumbnail') or {}).get('source'))

    # Potem wynik wyszukiwania, ale tylko gdy tytuł/opis zawiera temat kategorii.
    kws = keywords(pack)
    for p in search.get(pid, []):
        text = (str(p.get('title') or '') + ' ' + str(p.get('description') or '')).lower()
        if not any(k.lower() in text for k in kws):
            continue
        raw = (p.get('thumbnail') or {}).get('url')
        if not raw:
            continue
        img = ('https:' + raw) if raw.startswith('//') else raw
        img = re.sub(r'/\d+px-', '/800px-', img).split('?')[0]
        add(p.get('title'), img, p.get('description') or '')

    if added or len(items) != before:
        pack['items'] = items + added
        path.write_text(json.dumps(pack, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    report.append({'id': pid, 'name': pack['name'], 'before': before, 'after': len(pack['items']), 'added': len(added)})
    print(f"{pack['name']}: {before} -> {len(pack['items'])} (+{len(added)})")

# Przebuduj indeks po wszystkich zmianach.
allpacks = []
for p in OUT.glob('*.json'):
    if p.name in ('index.json', 'quality-report.json') or p.name.startswith('_'):
        continue
    d = json.load(open(p, encoding='utf-8'))
    if d.get('items'):
        allpacks.append({'id': d['id'], 'name': d['name'], 'group': d['group'], 'icon': d['icon'], 'prompt': d['prompt'], 'count': len(d['items'])})
order = ['Motoryzacja', 'Kuchnia', 'Przyroda', 'Geografia', 'Historia', 'Muzyka', 'Film i TV', 'Technika', 'Nauka', 'Marki', 'Zabawa', 'Inne']
allpacks.sort(key=lambda x: (order.index(x['group']) if x['group'] in order else 99, x['name']))
index = {'generated': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'packs': allpacks, 'total': sum(x['count'] for x in allpacks)}
json.dump(index, open(OUT / 'index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump({'generated': index['generated'], 'target': TARGET, 'report': report}, open(OUT / 'quality-report.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('TOTAL', index['total'], 'PACKS', len(allpacks))
