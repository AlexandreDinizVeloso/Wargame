"""Generate the 42 Risk-paced macro territories from public-domain Natural Earth.

Requires Python 3 and Shapely. Country polygons are clipped/merged, repaired, and
validated before JSON is written. Labels use stable strategic anchors to keep
adjacent territory centers at least 48 SVG pixels apart.
"""
import json
import math
import urllib.request
from pathlib import Path
from shapely.geometry import Polygon, box, shape
from shapely.ops import unary_union

SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
CACHE = Path('/tmp/concordia-world-countries.json')
if not CACHE.exists():
    CACHE.write_bytes(urllib.request.urlopen(SOURCE, timeout=30).read())
COUNTRIES = {
    f['properties']['ADM0_A3']: shape(f['geometry']).buffer(0)
    for f in json.loads(CACHE.read_text())['features']
}
REGIONS = []
EU, AF, AS, NA, SA = 'EUROPE', 'MENA_AFRICA', 'ASIA', 'NORTH_AMERICA', 'SOUTH_AMERICA'

def countries(codes):
    return unary_union([COUNTRIES[code] for code in codes.split()])

def add(key, name, continent, codes, anchor, bounds=None, geometry=None):
    area = countries(codes) if geometry is None else geometry
    if bounds is not None:
        area = area.intersection(box(*bounds))
    REGIONS.append((key, name, continent, area.buffer(0), anchor))

# South America: four large territories, including an undivided Brazil.
add('brazil', 'Brasil', SA, 'BRA GUY SUR', (-52, -12), geometry=countries('BRA GUY SUR').union(COUNTRIES['FRA'].intersection(box(-62, -5, -48, 10))))
add('rioplata', 'Cone Sul', SA, 'ARG URY CHL PRY FLK', (-65, -37))
add('andes', 'Andes', SA, 'PER BOL ECU', (-75, -13))
add('colombia', 'Colômbia e Venezuela', SA, 'COL VEN', (-68, 5))
# North and Central America: seven territories.
add('alaska', 'Alasca', NA, 'USA', (-154, 62), (-180, 50, -130, 90))
add('canada-west', 'Canadá Ocidental', NA, 'CAN', (-120, 58), (-180, -90, -100, 90))
add('canada-east', 'Canadá Oriental', NA, 'CAN GRL', (-83, 56), (-100, -90, 0, 90))
add('usa-west', 'Estados Unidos Ocidentais', NA, 'USA', (-116, 37), (-130, -90, -100, 50))
add('usa-east', 'Estados Unidos Orientais', NA, 'USA', (-83, 37), (-100, -90, 0, 50))
add('mexico', 'México', NA, 'MEX', (-103, 23))
add('central-america', 'América Central e Caribe', NA, 'PAN CRI NIC HND SLV GTM BLZ CUB HTI DOM JAM PRI TTO BHS', (-80, 13))
# Europe: nine macro territories.
add('castile', 'Península Ibérica', EU, 'ESP PRT', (-6, 39))
add('france', 'França', EU, 'FRA', (2, 49), (-10, 35, 12, 60))
add('britain', 'Ilhas Britânicas', EU, 'GBR IRL', (-6, 58))
add('germany', 'Europa Central', EU, 'DEU BEL NLD LUX DNK CHE AUT CZE SVK HUN', (14, 54))
add('italy', 'Itália', EU, 'ITA', (13, 40))
add('scandinavia', 'Escandinávia', EU, 'SWE NOR FIN ISL', (23, 67))
add('poland', 'Polônia e Báltico', EU, 'POL LTU LVA EST', (30, 54))
add('balkans', 'Bálcãs e Grécia', EU, 'ROU BGR ALB GRC MKD SRB KOS MNE BIH HRV SVN', (26, 40))
add('muscovy', 'Moscóvia', EU, '', (40, 62), geometry=COUNTRIES['RUS'].intersection(box(-180, -90, 50, 90)).difference(box(-180, -90, -130, 90)).union(countries('UKR BLR MDA')))
# Africa and Middle East: nine territories.
add('maghreb', 'Magrebe', AF, 'MAR DZA TUN LBY SAH', (3, 28))
add('nile', 'Egito e Nilo', AF, 'EGY SDN SDS', (29, 26))
add('west-africa', 'África Ocidental', AF, 'MRT SEN GMB GNB GIN SLE LBR CIV BFA GHA TGO BEN NER MLI NGA', (0, 10))
add('central-africa', 'África Central', AF, 'CMR TCD CAF COG COD GAB GNQ AGO', (20, 0))
add('east-africa', 'África Oriental', AF, 'ETH ERI DJI SOM SOL KEN UGA TZA RWA BDI', (40, 2))
add('south-africa', 'África Austral', AF, 'ZAF NAM BWA ZWE ZMB MOZ MWI LSO SWZ MDG', (25, -23))
add('anatolia', 'Anatólia', AF, 'TUR ARM GEO AZE CYP', (39, 40))
add('arabia', 'Arábia e Levante', AF, 'SAU YEM OMN ARE QAT KWT JOR ISR PSX LBN SYR', (43, 22))
add('persia', 'Pérsia e Mesopotâmia', AF, 'IRN IRQ', (55, 33))
# Asia and Oceania: thirteen territories.
add('ural', 'Urais', AS, 'RUS', (66, 61), (50, -90, 85, 90))
add('siberia', 'Sibéria', AS, '', (112, 63), geometry=COUNTRIES['RUS'].intersection(box(85, -90, 180, 90)).union(COUNTRIES['RUS'].intersection(box(-180, -90, -130, 90))))
add('central-asia', 'Ásia Central', AS, 'KAZ UZB TKM TJK KGZ', (68, 43))
add('afghan', 'Afeganistão e Khyber', AS, '', (69, 29), geometry=COUNTRIES['AFG'].union(COUNTRIES['PAK'].intersection(box(-180, -90, 70, 90))))
add('india-north', 'Hindustão', AS, '', (82, 26), geometry=COUNTRIES['IND'].intersection(box(-180, 20, 180, 90)).union(COUNTRIES['PAK'].intersection(box(70, -90, 180, 90))).union(countries('NPL BGD BTN')))
add('india-south', 'Decão', AS, '', (78, 12), geometry=COUNTRIES['IND'].intersection(box(-180, -90, 180, 20)).union(COUNTRIES['LKA']))
add('indochina', 'Indochina', AS, '', (105, 13), geometry=countries('MMR THA KHM VNM LAO').union(COUNTRIES['MYS'].intersection(box(-180, -90, 105, 90))))
manchuria = COUNTRIES['CHN'].intersection(box(120, 40, 180, 90))
add('china-west', 'China Interior e Tibete', AS, 'CHN', (92, 40), (-180, -90, 105, 90))
add('china-east', 'China Oriental', AS, '', (114, 28), geometry=COUNTRIES['CHN'].intersection(box(105, -90, 180, 90)).difference(manchuria).union(COUNTRIES['TWN']))
add('mongolia', 'Mongólia', AS, 'MNG', (105, 50))
add('korea', 'Coreia e Manchúria', AS, '', (127, 44), geometry=countries('PRK KOR').union(manchuria))
add('japan', 'Japão', AS, 'JPN', (139, 37))
add('archipelago', 'Indonésia e Oceania', AS, '', (126, -19), geometry=countries('IDN PNG AUS NZL PHL BRN').union(COUNTRIES['MYS'].intersection(box(105, -90, 180, 90))))
assert len(REGIONS) == 42

def project(lon, lat):
    return [round((lon + 180) * 4, 2), round((85 - lat) * 4, 2)]

result = []
for index, (key, name, continent, area, anchor) in enumerate(REGIONS):
    assert area.is_valid and not area.is_empty, key
    parts = list(area.geoms) if hasattr(area, 'geoms') else [area]
    parts = [p.simplify(.08, preserve_topology=True) for p in parts if p.geom_type == 'Polygon' and p.area >= .02]
    assert parts and all(p.is_valid for p in parts), key
    rings = []
    for part in parts:
        # Rounding can turn a near-tangent coastal cut into a self-intersection.
        # Repair in final SVG coordinates, then serialize the repaired rings.
        projected = Polygon(
            [project(x, y) for x, y in part.exterior.coords],
            [[project(x, y) for x, y in hole.coords] for hole in part.interiors],
        ).buffer(0)
        pieces = list(projected.geoms) if hasattr(projected, 'geoms') else [projected]
        for piece in pieces:
            if piece.geom_type != 'Polygon' or piece.is_empty:
                continue
            assert piece.is_valid, key
            boundary = [list(point) for point in piece.exterior.coords]
            assert Polygon(boundary).is_valid, key
            rings.append(boundary)
            for hole in piece.interiors:
                boundary = [list(point) for point in hole.coords]
                assert Polygon(boundary).is_valid, key
                rings.append(boundary)
    neighbors = [other[0] for j, other in enumerate(REGIONS) if index != j and area.distance(other[3]) < .08]
    x, y = project(*anchor)
    result.append(dict(id=key, name=name, continent=continent, rings=rings, x=x, y=y, neighbors=neighbors))
lookup = {p['id']: p for p in result}
# Narrow strategic water passages; they also carry sea-control metadata in map.ts.
straits = [('britain', 'france'), ('castile', 'maghreb'), ('scandinavia', 'germany'), ('italy', 'balkans'), ('balkans', 'anatolia'), ('arabia', 'east-africa'), ('indochina', 'archipelago'), ('korea', 'japan'), ('alaska', 'siberia')]
for a, b in straits:
    lookup[a]['neighbors'].append(b)
    lookup[b]['neighbors'].append(a)
# Central Sahara is not a direct north/south highway.
for a, b in [('maghreb', 'central-africa')]:
    lookup[a]['neighbors'] = [n for n in lookup[a]['neighbors'] if n != b]
    lookup[b]['neighbors'] = [n for n in lookup[b]['neighbors'] if n != a]
for p in result:
    p['neighbors'] = sorted(set(p['neighbors']))
    for neighbor in p['neighbors']:
        distance = math.hypot(p['x'] - lookup[neighbor]['x'], p['y'] - lookup[neighbor]['y'])
        assert distance >= 48, (p['id'], neighbor, distance)
for i, region in enumerate(REGIONS):
    for other in REGIONS[i + 1:]:
        assert region[3].intersection(other[3]).area < .001, (region[0], other[0])
Path('shared/world-geometry.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Generated 42 land territories; valid disjoint source polygons; adjacent centers >=48px.')
