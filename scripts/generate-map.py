"""Generate 95 disjoint strategic land provinces from public-domain Natural Earth.
Run: PYTHONPATH=/workspace/.cache/concordia-python python3 scripts/generate-map.py
Dependency: shapely. Raw source is cached, never required by the game runtime.
"""
import json
import urllib.request
from pathlib import Path
from shapely.geometry import shape, box
from shapely.ops import unary_union
SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
cache = Path('/tmp/concordia-world-countries.json')
if not cache.exists():
    cache.write_bytes(urllib.request.urlopen(SOURCE, timeout=30).read())
countries = {f['properties']['ADM0_A3']: shape(f['geometry']) for f in json.loads(cache.read_text())['features']}
regions = []
def add(key, name, continent, codes, bounds=None, subtract=None):
    geom = unary_union([countries[c] for c in codes.split()])
    if bounds: geom = geom.intersection(box(*bounds))
    if subtract: geom = geom.difference(subtract)
    regions.append((key, name, continent, geom))
EU='EUROPE'; AF='MENA_AFRICA'; AS='ASIA'; AM='AMERICAS'
add('portugal','Portugal',EU,'PRT')
add('castile','Castela',EU,'ESP',(-180,-90,-1,90));add('aragon','Aragão e Catalunha',EU,'ESP',(-1,-90,180,90))
add('france','França',EU,'FRA',(-10,48,15,55));add('aquitaine','Aquitânia',EU,'FRA',(-10,40,4,48));add('burgundy','Borgonha e Ródano',EU,'FRA',(4,40,15,48))
add('britain','Inglaterra',EU,'GBR',(-180,-90,180,55));add('scotland','Escócia',EU,'GBR',(-180,55,180,90));add('ireland','Irlanda',EU,'IRL')
add('lowlands','Países Baixos',EU,'BEL NLD LUX');add('rhineland','Renânia',EU,'DEU',(-180,-90,9,90))
add('germany','Saxônia e Brandemburgo',EU,'DEU',(9,49,180,90));add('bavaria','Baviera',EU,'DEU',(9,-90,180,49))
add('alps','Alpes',EU,'CHE AUT');add('italy','Lombardia e Toscana',EU,'ITA',(-180,41,180,90));add('naples','Nápoles e Sicília',EU,'ITA',(-180,-90,180,41))
add('scandinavia','Escandinávia',EU,'NOR SWE FIN ISL');add('denmark','Dinamarca',EU,'DNK');add('poland','Polônia',EU,'POL');add('lithuania','Lituânia e Báltico',EU,'LTU LVA EST')
add('bohemia','Boêmia',EU,'CZE SVK');add('hungary','Hungria',EU,'HUN');add('balkans','Bálcãs',EU,'HRV BIH SRB MNE MKD ALB SVN KOS');add('greece','Grécia e Trácia',EU,'GRC BGR');add('romania','Romênia e Moldávia',EU,'ROU MDA')
crimea = countries['UKR'].intersection(box(32,44,37,46))
add('crimea','Crimeia',EU,'UKR',(32,44,37,46));add('ruthenia','Rutênia',EU,'UKR BLR',subtract=crimea);add('muscovy','Moscóvia',EU,'RUS',(-20,-90,50,90))
add('maghreb','Marrocos',AF,'MAR SAH');add('algiers','Argélia e Tunísia',AF,'DZA TUN');add('tripoli','Tripolitânia',AF,'LBY');add('nile','Baixo Nilo e Cairo',AF,'EGY');add('nubia','Núbia e Alto Nilo',AF,'SDN SDS')
add('west-africa','Senegal e Mali',AF,'SEN MLI MRT GMB GNB GIN SLE LBR CIV BFA NER');add('gold-coast','Costa do Ouro',AF,'GHA TGO BEN NGA');add('central-africa','Congo e África Central',AF,'CMR TCD CAF COD COG GAB GNQ AGO');add('horn','Chifre da África',AF,'ETH ERI DJI SOM SOL');add('east-africa','Zanzibar e África Oriental',AF,'KEN UGA RWA BDI TZA MWI MDG');add('zambezi','Zambeze',AF,'ZMB MOZ ZWE');add('south-africa','Cabo e África Austral',AF,'ZAF NAM BWA LSO SWZ')
add('anatolia','Anatólia',AF,'TUR CYP CYN');add('levant','Levante e Jerusalém',AF,'SYR JOR ISR LBN PSX');add('arabia','Arábia',AF,'SAU YEM OMN ARE QAT KWT');add('mesopotamia','Mesopotâmia',AF,'IRQ');add('persia','Pérsia',AF,'IRN')
add('caucasus','Cáucaso',AS,'GEO ARM AZE');add('siberia','Sibéria Ocidental',AS,'RUS',(50,-90,110,90))
yak = countries['RUS'].intersection(box(110,-90,180,90)).union(countries['RUS'].intersection(box(-180,-90,-160,90)))
regions.append(('yakutia','Iacútia e Sibéria Oriental',AS,yak))
add('central-asia','Cazaquistão e Turcomênia',AS,'KAZ TKM');add('samarkand','Samarcanda e Transoxiana',AS,'UZB TJK KGZ');add('afghan','Afeganistão e Khyber',AS,'AFG');add('punjab','Punjab e Vale do Indo',AS,'PAK');add('india-north','Deli e Ganges',AS,'IND NPL BTN',(-180,23,180,90));add('bengal','Bengala',AS,'BGD');add('india-south','Decão e Madras',AS,'IND LKA',(-180,-90,180,23));add('burma','Birmânia',AS,'MMR');add('indochina','Indochina',AS,'THA LAO KHM VNM');add('malaya','Malaia',AS,'MYS BRN')
sumatra=countries['IDN'].intersection(box(-180,-90,106,90));java=countries['IDN'].intersection(box(106,-90,180,-5))
regions.append(('sumatra','Sumatra',AS,sumatra));regions.append(('java','Java e Pequenas Sondas',AS,java));add('philippines','Filipinas',AS,'PHL')
add('archipelago','Bornéu e Celebes',AS,'IDN PNG TLS NZL FJI VUT SLB NCL',subtract=sumatra.union(java))
add('australia-west','Austrália Ocidental',AS,'AUS',(-180,-90,135,90));add('australia-east','Austrália Oriental',AS,'AUS',(135,-90,180,90))
add('mongolia','Mongólia',AS,'MNG');add('china-north','Pequim e Rio Amarelo',AS,'CHN TWN',(105,34,180,90));add('china-east','Nanquim e Xangai',AS,'CHN TWN',(105,25,180,34));add('china-south','Cantão',AS,'CHN TWN',(105,-90,180,25))
tibet=countries['CHN'].intersection(box(78,27,100,36));regions.append(('tibet','Tibete e Himalaia',AS,tibet));add('china-west','Sichuan e Turquestão',AS,'CHN',(-180,-90,105,90),subtract=tibet);add('korea','Coreia',AS,'KOR PRK');add('japan','Japão',AS,'JPN')
add('alaska','Alasca',AM,'USA',(-180,50,-130,90));add('canada-west','Canadá Ocidental',AM,'CAN',(-180,-90,-100,90));add('canada-east','Canadá Oriental',AM,'CAN GRL',(-100,-90,0,90));add('usa-west','Califórnia e Pacífico',AM,'USA',(-130,-90,-112,50));add('great-plains','Grandes Planícies',AM,'USA',(-112,-90,-90,50));add('great-lakes','Grandes Lagos',AM,'USA',(-90,40,-80,50));
usa_east=countries['USA'].intersection(box(-80,-90,0,50)).union(countries['USA'].intersection(box(-90,-90,-80,40)))
regions.append(('usa-east','Nova Inglaterra e Virgínia',AM,usa_east))
add('mexico','México',AM,'MEX',(-180,-90,-90,90));add('yukatan','Iucatã',AM,'MEX',(-90,-90,180,90));add('central-america','América Central',AM,'PAN CRI NIC HND SLV GTM BLZ');add('caribbean','Caribe',AM,'CUB HTI DOM JAM PRI TTO BHS');add('colombia','Nova Granada',AM,'COL');add('venezuela','Venezuela',AM,'VEN');add('guianas','Guianas',AM,'GUY SUR FRA',(-62,-5,-48,10));add('andes','Peru e Andes',AM,'ECU PER');add('bolivia','Alto Peru',AM,'BOL PRY');add('amazon','Amazônia',AM,'BRA',(-180,-8,180,90));add('brazil-north','Bahia e Pernambuco',AM,'BRA',(-180,-16,180,-8));add('brazil','Rio e Minas',AM,'BRA',(-180,-23,180,-16));add('sao-paulo','São Paulo e Brasil Meridional',AM,'BRA',(-180,-90,180,-23));add('chile','Chile',AM,'CHL');add('rioplata','Rio da Prata',AM,'ARG URY FLK',(-180,-40,180,90));add('patagonia','Patagônia',AM,'ARG FLK',(-180,-90,180,-40))
assert len(regions)==95, len(regions)
def project(x,y):return [round((x+180)*4,2),round((85-y)*4,2)]
result=[]
for i,(key,name,continent,g) in enumerate(regions):
    polygons = list(g.geoms) if hasattr(g,'geoms') else [g]
    polygons = [p for p in polygons if p.geom_type=='Polygon' and p.area>=.02]
    assert polygons,key
    rings=[[project(x,y) for x,y in p.simplify(.10,preserve_topology=True).exterior.coords] for p in polygons]
    point=max(polygons,key=lambda p:p.area).representative_point()
    neighbors=[r[0] for j,r in enumerate(regions) if i!=j and g.distance(r[3])<.08]
    result.append(dict(id=key,name=name,continent=continent,rings=rings,x=project(point.x,point.y)[0],y=project(point.x,point.y)[1],neighbors=neighbors))
lookup={p['id']:p for p in result}
# Physical straits; ocean journeys use fleets/charters, never arbitrary land links.
crossings=[('britain','france'),('britain','ireland'),('scotland','ireland'),('scandinavia','denmark'),('denmark','germany'),('denmark','lowlands'),('greece','anatolia'),('japan','korea'),('malaya','sumatra'),('sumatra','java'),('java','archipelago'),('malaya','archipelago'),('archipelago','philippines'),('caribbean','mexico'),('caribbean','central-america'),('alaska','yakutia')]
blocked=[('tibet','india-north'),('algiers','central-africa'),('tripoli','central-africa')]
for a,b in crossings:
    for src,dst in [(a,b),(b,a)]:
        if dst not in lookup[src]['neighbors']:lookup[src]['neighbors'].append(dst)
for a,b in blocked:
    for src,dst in [(a,b),(b,a)]:lookup[src]['neighbors']=[n for n in lookup[src]['neighbors'] if n!=dst]
for p in result:p['neighbors']=sorted(set(p['neighbors']))
# Polygons must not overlap; touching borders have zero area.
for i,r in enumerate(regions):
    for s in regions[i+1:]:assert r[3].intersection(s[3]).area<.001,(r[0],s[0])
Path('shared/world-geometry.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Generated',len(result),'land provinces; source public domain:',SOURCE)
