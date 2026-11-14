#!/usr/bin/env python3
"""Uzupełnia trzy popularne paczki zdjęciami z angielskiej Wikipedii.

Odpowiedzi są polskie, a źródłem zdjęcia jest angielska strona hasła/modelu.
"""
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACKS = ROOT / 'data' / 'packs'
API = 'https://en.wikipedia.org/w/api.php'
UA = 'TheFloorGame/1.0 (educational quiz)'


def api(params):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode('utf-8'))


def images(titles):
    out = {}
    for start in range(0, len(titles), 40):
        chunk = titles[start:start + 40]
        data = api({
            'action': 'query',
            'redirects': '1',
            'titles': '|'.join(chunk),
            'prop': 'pageimages',
            'piprop': 'thumbnail',
            'pithumbsize': '960',
        })
        redirects = {r['from']: r['to'] for r in data.get('query', {}).get('redirects', [])}
        by_title = {p.get('title'): p for p in data.get('query', {}).get('pages', [])}
        for title in chunk:
            page = by_title.get(redirects.get(title, title))
            if page and page.get('thumbnail', {}).get('source'):
                out[title] = page['thumbnail']['source'].split('?')[0]
    return out


def write(pack_id, name, group, icon, prompt, source, entries):
    imgs = images([title for _, title in entries])
    items, seen = [], set()
    for answer, title in entries:
        img = imgs.get(title)
        if not img:
            print(f'  ! brak: {answer} ({title})')
            continue
        if answer.lower() in seen:
            continue
        seen.add(answer.lower())
        items.append({'a': answer, 'img': img})
    data = {
        'id': pack_id, 'name': name, 'group': group, 'icon': icon,
        'prompt': prompt, 'source': source, 'items': items,
    }
    (PACKS / f'{pack_id}.json').write_text(
        json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'
    )
    print(f'{pack_id}: {len(items)} pytań')
    return len(items)


FRUITS = [
    ('Banan', 'Banana'), ('Pomarańcza', 'Orange (fruit)'), ('Cytryna', 'Lemon'),
    ('Mandarynka', 'Mandarin orange'), ('Truskawka', 'Strawberry'), ('Malina', 'Raspberry'),
    ('Borówka', 'Blueberry'), ('Gruszka', 'Pear'), ('Śliwka', 'Plum'),
    ('Brzoskwinia', 'Peach'), ('Winogrono', 'Grape'), ('Arbuz', 'Watermelon'),
    ('Melon', 'Melon'), ('Ananas', 'Pineapple'), ('Mango', 'Mango'),
    ('Awokado', 'Avocado'), ('Granat', 'Pomegranate'), ('Kiwi', 'Kiwifruit'),
    ('Jabłko', 'Apple'), ('Czereśnia', 'Cherry'), ('Wiśnia', 'Sour cherry'),
    ('Agrest', 'Gooseberry'), ('Porzeczka', 'Redcurrant'), ('Żurawina', 'Cranberry'),
    ('Figa', 'Common fig'), ('Daktyl', 'Date palm'), ('Kokos', 'Coconut'),
    ('Liczi', 'Lychee'), ('Papaja', 'Papaya'), ('Nektarynka', 'Nectarine'),
]

APPS = [
    ('X (Twitter)', 'Twitter'), ('YouTube', 'YouTube'), ('Facebook', 'Facebook'),
    ('Google', 'Google'), ('Instagram', 'Instagram'), ('WhatsApp', 'WhatsApp'),
    ('TikTok', 'TikTok'), ('Wikipedia', 'Wikipedia'), ('Netflix', 'Netflix'),
    ('Spotify', 'Spotify'), ('Allegro', 'Allegro (website)'), ('OLX', 'OLX'),
    ('Gmail', 'Gmail'), ('Google Maps', 'Google Maps'), ('Discord', 'Discord'),
    ('Telegram', 'Telegram (software)'), ('Snapchat', 'Snapchat'), ('Pinterest', 'Pinterest'),
    ('LinkedIn', 'LinkedIn'), ('Reddit', 'Reddit'), ('ChatGPT', 'ChatGPT'),
    ('Twitch', 'Twitch'), ('Booking.com', 'Booking.com'), ('Uber', 'Uber'),
]

CARS = [
    ('Toyota', 'Toyota Corolla'), ('Volkswagen', 'Volkswagen Golf'),
    ('Skoda', 'Škoda Octavia'), ('Ford', 'Ford Focus'), ('Opel', 'Opel Astra'),
    ('Renault', 'Renault Clio'), ('Fiat', 'Fiat 500'), ('Peugeot', 'Peugeot 208'),
    ('Citroën', 'Citroën C3'), ('BMW', 'BMW 3 Series'), ('Mercedes-Benz', 'Mercedes-Benz C-Class'),
    ('Audi', 'Audi A4'), ('Kia', 'Kia Sportage'), ('Hyundai', 'Hyundai Tucson'),
    ('Dacia', 'Dacia Duster'), ('SEAT', 'SEAT Leon'), ('Volvo', 'Volvo XC60'),
    ('Honda', 'Honda Civic'), ('Nissan', 'Nissan Qashqai'), ('Mazda', 'Mazda3'),
    ('Suzuki', 'Suzuki Swift'), ('Tesla', 'Tesla Model 3'), ('Cupra', 'Cupra Formentor'),
    ('Jeep', 'Jeep Renegade'), ('Mitsubishi', 'Mitsubishi Outlander'), ('Lexus', 'Lexus RX'),
    ('Mini', 'Mini Hatch'), ('Land Rover', 'Land Rover Defender'),
    ('Porsche', 'Porsche 911'), ('Alfa Romeo', 'Alfa Romeo Giulietta'),
]


def main():
    counts = {}
    counts['owoce-jadalne'] = write(
        'owoce-jadalne', 'Owoce jadalne', 'Kuchnia', '🍎', 'Jaki to owoc?',
        'Kategoria:Owoce jadalne', FRUITS
    )
    counts['aplikacje-internetowe'] = write(
        'aplikacje-internetowe', 'Aplikacje internetowe', 'Internet', '📱',
        'Jaka to aplikacja lub serwis?', 'Kategoria:Aplikacje internetowe', APPS
    )
    counts['marki-samochodow'] = write(
        'marki-samochodow', 'Marki samochodów', 'Motoryzacja', '🚗', 'Jaka to marka samochodu?',
        'Kategoria:Marki samochodów', CARS
    )
    index_path = PACKS / 'index.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    by_id = {p['id']: p for p in index['packs']}
    if 'aplikacje-internetowe' not in by_id:
        index['packs'].append({
            'id': 'aplikacje-internetowe', 'name': 'Aplikacje internetowe',
            'group': 'Internet', 'icon': '📱', 'prompt': 'Jaka to aplikacja lub serwis?',
            'count': counts['aplikacje-internetowe'],
        })
        by_id = {p['id']: p for p in index['packs']}
    for pack_id, count in counts.items():
        by_id[pack_id]['count'] = count
    index['packs'].sort(key=lambda p: p['name'].lower())
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('index:', len(index['packs']), 'kategorii,', sum(p['count'] for p in index['packs']), 'pytań')


if __name__ == '__main__':
    main()
