"""Regenerate the checked-in Natural Earth geometry. Optional dependency: shapely.
Natural Earth 1:110m is public domain. Coordinates use an equirectangular projection.
"""
import json, math, urllib.request
from pathlib import Path
from shapely.geometry import shape, box
from shapely.ops import unary_union
SOURCE='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
cache=Path('/tmp/concordia-world-countries.json')
if not cache.exists(): cache.write_bytes(urllib.request.urlopen(SOURCE,timeout=30).read())
countries={f['properties']['ADM0_A3']:shape(f['geometry']) for f in json.loads(cache.read_text())['features']}
# ID, label, continent, countries, clipping bounds (optional).
regions=[
('portugal','Portugal','EUROPE','PRT'),('castile','Ibéria','EUROPE','ESP'),('france','França','EUROPE','FRA',(-10,40,15,55)),
('britain','Ilhas Britânicas','EUROPE','GBR IRL'),('lowlands','Países Baixos','EUROPE','BEL NLD LUX'),('germany','Germânia','EUROPE','DEU'),
('italy','Itália','EUROPE','ITA'),('scandinavia','Escandinávia','EUROPE','NOR SWE DNK FIN ISL'),('poland','Polônia e Báltico','EUROPE','POL LTU LVA EST'),
('alps','Alpes','EUROPE','CHE AUT'),('balkans','Bálcãs','EUROPE','HRV BIH SRB MNE MKD ALB SVN KOS'),('greece','Grécia','EUROPE','GRC BGR'),
('bohemia','Boêmia e Hungria','EUROPE','HUN SVK CZE'),('romania','Danúbio','EUROPE','ROU MDA'),('ruthenia','Rutênia','EUROPE','UKR BLR'),
('muscovy','Moscóvia','EUROPE','RUS',(-20,-90,50,90)),
('alaska','Alasca','AMERICAS','USA',(-180,50,-130,90)),('canada-west','Canadá Ocidental','AMERICAS','CAN',(-180,-90,-100,90)),
('canada-east','Canadá Oriental','AMERICAS','CAN GRL',(-100,-90,0,90)),('usa-west','Costa do Pacífico','AMERICAS','USA',(-130,-90,-100,50)),
('usa-east','Costa Atlântica','AMERICAS','USA',(-100,-90,0,50)),('mexico','México','AMERICAS','MEX'),('central-america','América Central','AMERICAS','PAN CRI NIC HND SLV GTM BLZ'),
('caribbean','Caribe','AMERICAS','CUB HTI DOM JAM PRI TTO BHS'),('colombia','Nova Granada','AMERICAS','COL VEN'),('andes','Andes','AMERICAS','ECU PER'),
('amazon','Amazônia','AMERICAS','BRA',(-180, -8,180,90)),('brazil','Brasil','AMERICAS','BRA',(-180,-90,180,-8)),
('bolivia','Alto Peru','AMERICAS','BOL PRY'),('chile','Chile','AMERICAS','CHL'),('rioplata','Rio da Prata','AMERICAS','ARG URY FLK'),('guianas','Guianas','AMERICAS','GUY SUR FRA',(-62,-5,-48,10)),
('anatolia','Anatólia','ASIA','TUR GEO ARM AZE CYP CYN'),('persia','Pérsia','ASIA','IRN IRQ'),('central-asia','Ásia Central','ASIA','KAZ UZB TKM TJK KGZ'),
('siberia','Sibéria','ASIA','RUS',(50,-90,180,90)),('afghan','Afeganistão e Indo','ASIA','AFG PAK'),('india-north','Hindustão','ASIA','IND NPL BTN',(-180,23,180,90)),
('india-south','Decão','ASIA','IND LKA',(-180,-90,180,23)),('bengal','Bengala','ASIA','BGD MMR'),('indochina','Indochina','ASIA','THA LAO KHM VNM'),
('malaya','Malaia','ASIA','MYS BRN'),('china-west','Tibete e Turquestão','ASIA','CHN',(-180,-90,105,90)),('china-east','China Imperial','ASIA','CHN TWN',(105,-90,180,90)),
('mongolia','Mongólia','ASIA','MNG'),('korea','Coreia','ASIA','KOR PRK'),('japan','Japão','ASIA','JPN'),('archipelago','Arquipélagos','ASIA','IDN PHL PNG TLS AUS NZL FJI VUT SLB NCL'),
('maghreb','Magrebe','MENA_AFRICA','MAR DZA TUN SAH'),('nile','Vale do Nilo','MENA_AFRICA','EGY LBY SDN SDS'),
('arabia','Arábia e Levante','MENA_AFRICA','SAU YEM OMN ARE QAT KWT SYR JOR ISR LBN PSX'),
('west-africa','África Ocidental','MENA_AFRICA','SEN MLI MRT GMB GNB GIN SLE LBR CIV GHA TGO BEN BFA NER NGA'),
('central-africa','África Central','MENA_AFRICA','CMR TCD CAF COD COG GAB GNQ AGO'),('horn','Chifre da África','MENA_AFRICA','ETH ERI DJI SOM SOL'),
('east-africa','África Oriental','MENA_AFRICA','KEN UGA RWA BDI TZA ZMB MWI MOZ MDG'),('south-africa','África Austral','MENA_AFRICA','ZAF NAM BWA ZWE LSO SWZ')]
shapes=[]
for r in regions:
    geom=unary_union([countries[c] for c in r[3].split()])
    if len(r)>4: geom=geom.intersection(box(*r[4]))
    if r[0]=='siberia': geom=unary_union([geom,countries['RUS'].intersection(box(-180,-90,-160,90))])
    shapes.append(geom)
def project(x,y): return [round((x+180)*4,2),round((85-y)*4,2)]
result=[]
for i,(r,g) in enumerate(zip(regions,shapes)):
    polygons=list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
    rings=[]
    for p in polygons:
        if p.geom_type!='Polygon' or p.area<.02: continue
        ring=list(p.simplify(.14,preserve_topology=True).exterior.coords)
        rings.append([project(x,y) for x,y in ring])
    largest=max(polygons,key=lambda p:p.area)
    point=largest.representative_point()
    # Land borders + explicit short crossings, never an arbitrary nearest-neighbor mesh.
    neighbors=[regions[j][0] for j,h in enumerate(shapes) if i!=j and g.distance(h)<.08]
    result.append(dict(id=r[0],name=r[1],continent=r[2],rings=rings,x=project(point.x,point.y)[0],y=project(point.x,point.y)[1],neighbors=neighbors))
lookup={p['id']:p for p in result}
for a,b in [('britain','france'),('britain','lowlands'),('scandinavia','germany'),('scandinavia','poland'),('greece','anatolia'),('japan','korea'),('japan','china-east'),('malaya','archipelago'),('caribbean','mexico'),('caribbean','central-america'),('alaska','siberia')]:
    for src,dst in [(a,b),(b,a)]:
        if dst not in lookup[src]['neighbors']:lookup[src]['neighbors'].append(dst)
Path('shared/world-geometry.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Generated',len(result),'land provinces; source public domain:',SOURCE)
