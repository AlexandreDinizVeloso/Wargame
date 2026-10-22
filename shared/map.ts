import geometry from './world-geometry.json';
import type { Continent, GameMode, Province, Theater, StrategicResource } from './types';
export type Terrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'coastal';
export interface ProvinceStaticData {
  id: string;
  name: string;
  kind: 'LAND' | 'SEA_ZONE';
  continent: Continent | 'SEA_ZONE';
  terrain: Terrain;
  terrainDefenseBonus: number;
  baseTax: number;
  baseSupplyLimit: number;
  neighbors: string[];
  straitNeighbors: string[];
  straitSeaIds: Record<string, string>;
  rings: number[][][];
  path: string;
  x: number;
  y: number;
  isCoastal: boolean;
  strategicResource: StrategicResource;
  razedTurn: number | null;
  resource: 'grain' | 'trade' | 'iron' | 'shrine';
}
export const TERRAIN_DEFENSE: Record<Terrain, number> = {
  plains: 1,
  coastal: 1.05,
  forest: 1.15,
  hills: 1.2,
  mountains: 1.35,
};
export const TERRAIN_LABELS: Record<Terrain, string> = {
  plains: 'Planícies',
  coastal: 'Litoral',
  forest: 'Floresta',
  hills: 'Colinas',
  mountains: 'Montanhas',
};
export const CONTINENTS: Record<Continent, string> = {
  EUROPE: 'Europa',
  AMERICAS: 'Américas',
  MENA_AFRICA: 'MENA e África',
  ASIA: 'Ásia e Pacífico',
};
export const THEATERS: Theater[] = ['EUROPE', 'AMERICAS', 'ASIA'];
export const isLegacySeaShortcut = (a: string, b: string) =>
  (a === 'china-east' && b === 'japan') ||
  (b === 'china-east' && a === 'japan') ||
  (a === 'lowlands' && b === 'britain') ||
  (b === 'lowlands' && a === 'britain');
const SEAS: [string, string, number[], string[], string[]][] = [
  [
    'north-atlantic',
    'Atlântico Norte',
    [-65, 30, -15, 65],
    ['portugal', 'castile', 'france', 'britain', 'scandinavia', 'canada-east', 'usa-east'],
    ['south-atlantic', 'caribbean-sea', 'western-med', 'arctic'],
  ],
  [
    'south-atlantic',
    'Atlântico Sul',
    [-38, -40, -5, 5],
    ['brazil', 'amazon', 'rioplata', 'guianas', 'west-africa', 'central-africa', 'south-africa'],
    ['north-atlantic', 'caribbean-sea', 'indian-west', 'south-pacific'],
  ],
  [
    'caribbean-sea',
    'Mar do Caribe',
    [-90, 8, -60, 28],
    ['usa-east', 'mexico', 'central-america', 'caribbean', 'colombia', 'guianas', 'amazon'],
    ['north-atlantic', 'south-atlantic', 'north-pacific'],
  ],
  [
    'north-pacific',
    'Pacífico Norte',
    [-165, 10, -130, 50],
    ['alaska', 'canada-west', 'usa-west', 'mexico', 'japan', 'siberia'],
    ['south-pacific', 'east-asian-sea', 'arctic', 'caribbean-sea'],
  ],
  [
    'south-pacific',
    'Pacífico Sul',
    [-150, -45, -90, 0],
    ['andes', 'chile', 'rioplata', 'archipelago'],
    ['north-pacific', 'south-atlantic', 'south-china-sea', 'indian-east'],
  ],
  [
    'western-med',
    'Mediterrâneo Ocidental',
    [-2, 33, 14, 41],
    ['portugal', 'castile', 'france', 'italy', 'maghreb'],
    ['north-atlantic', 'eastern-med'],
  ],
  [
    'eastern-med',
    'Mediterrâneo Oriental',
    [18, 31, 35, 38],
    ['italy', 'balkans', 'greece', 'anatolia', 'nile', 'arabia'],
    ['western-med', 'indian-west'],
  ],
  [
    'baltic',
    'Mar Báltico',
    [12, 54, 28, 61],
    ['germany', 'lowlands', 'scandinavia', 'poland', 'muscovy'],
    ['north-atlantic', 'arctic'],
  ],
  [
    'arctic',
    'Oceano Ártico',
    [-15, 74, 110, 82],
    ['scandinavia', 'muscovy', 'siberia', 'alaska', 'canada-west', 'canada-east'],
    ['north-atlantic', 'north-pacific', 'baltic'],
  ],
  [
    'indian-west',
    'Índico Ocidental',
    [45, -20, 70, 16],
    ['south-africa', 'east-africa', 'horn', 'arabia', 'persia', 'afghan', 'india-south'],
    ['indian-east', 'south-atlantic', 'eastern-med'],
  ],
  [
    'indian-east',
    'Índico Oriental',
    [80, -20, 100, 15],
    ['india-south', 'bengal', 'indochina', 'malaya', 'archipelago'],
    ['indian-west', 'south-china-sea', 'south-pacific'],
  ],
  [
    'south-china-sea',
    'Mar da China Meridional',
    [110, 0, 120, 20],
    ['china-east', 'indochina', 'malaya', 'archipelago'],
    ['indian-east', 'east-asian-sea', 'south-pacific'],
  ],
  [
    'east-asian-sea',
    'Mar do Japão',
    [130, 28, 145, 45],
    ['china-east', 'korea', 'japan', 'siberia'],
    ['south-china-sea', 'north-pacific'],
  ],
];
export const STRAITS: readonly [string, string, string][] = [
  ['portugal', 'maghreb', 'western-med'],
  ['castile', 'maghreb', 'western-med'],
  ['france', 'britain', 'north-atlantic'],
  ['scandinavia', 'germany', 'baltic'],
  ['scandinavia', 'lowlands', 'baltic'],
  ['italy', 'maghreb', 'western-med'],
  ['italy', 'balkans', 'eastern-med'],
  ['italy', 'greece', 'eastern-med'],
  ['greece', 'anatolia', 'eastern-med'],
  ['balkans', 'anatolia', 'eastern-med'],
  ['nile', 'arabia', 'eastern-med'],
  ['arabia', 'horn', 'indian-west'],
  ['malaya', 'archipelago', 'indian-east'],
  ['korea', 'japan', 'east-asian-sea'],
  ['alaska', 'siberia', 'arctic'],
  ['caribbean', 'central-america', 'caribbean-sea'],
  ['caribbean', 'usa-east', 'caribbean-sea'],
  ['caribbean', 'colombia', 'caribbean-sea'],
];
export const WORLD_STARTS = {
  vespera: ['portugal', 'castile'],
  ferro_norte: ['scandinavia', 'muscovy'],
  aurelia: ['nile', 'maghreb'],
  sol_invicto: ['arabia', 'persia'],
  kaldor: ['south-africa', 'east-africa'],
  turan: ['mongolia', 'siberia'],
  sapiencia: ['china-east', 'indochina'],
  veridia: ['amazon', 'colombia'],
} as const;
const pathOf = (rings: number[][][]) =>
  rings.map((r) => `M${r.map((p) => p.join(',')).join('L')}Z`).join('');
export function makeStaticMap(
  mode: GameMode = 'campaign',
  theater: Theater = 'EUROPE',
): ProvinceStaticData[] {
  const land: ProvinceStaticData[] = geometry.map((g, i) => {
    const isCoastal = SEAS.some((s) => s[3].includes(g.id));
    const terrain: Terrain = [
      'alps',
      'andes',
      'chile',
      'afghan',
      'china-west',
      'anatolia',
    ].includes(g.id)
      ? 'mountains'
      : ['amazon', 'canada-east', 'canada-west', 'siberia', 'central-africa', 'guianas'].includes(
            g.id,
          )
        ? 'forest'
        : ['bohemia', 'castile', 'inland', 'bolivia', 'mongolia'].includes(g.id)
          ? 'hills'
          : isCoastal
            ? 'coastal'
            : 'plains';
    const resource = (['grain', 'trade', 'iron', 'shrine'] as const)[i % 4];
    return {
      ...g,
      kind: 'LAND',
      straitNeighbors: [],
      straitSeaIds: {},
      continent: g.continent as Continent,
      rings: g.rings,
      path: pathOf(g.rings),
      isCoastal,
      terrain,
      terrainDefenseBonus: TERRAIN_DEFENSE[terrain],
      baseTax: [4, 5, 3, 4][i % 4] + (i % 6 === 3 ? 5 : 0),
      strategicResource: (['GRAIN', 'IRON', 'HORSES', 'GOLD_MINE', 'RELIC', null] as const)[i % 6],
      razedTurn: null,
      baseSupplyLimit: terrain === 'mountains' ? 10 : terrain === 'forest' ? 12 : 18,
      resource,
    };
  });
  const ids = new Set(
    land.filter((p) => mode === 'campaign' || p.continent === theater).map((p) => p.id),
  );
  const seas: ProvinceStaticData[] = SEAS.filter((s) => s[3].some((id) => ids.has(id))).map(
    ([id, name, bounds, ports, links]) => {
      const [w, s, e, n] = bounds;
      const project = (lon: number, lat: number) => [(lon + 180) * 4, (85 - lat) * 4];
      const rings = [
        [
          project(w, n),
          project(e - 1, n + 0.5),
          project(e, s),
          project(w + 1, s - 0.5),
          project(w, n),
        ],
      ];
      return {
        id,
        name,
        kind: 'SEA_ZONE',
        straitNeighbors: [],
        straitSeaIds: {},
        continent: 'SEA_ZONE',
        terrain: 'coastal',
        terrainDefenseBonus: 1,
        baseTax: 0,
        baseSupplyLimit: 30,
        isCoastal: false,
        neighbors: [...ports.filter((id) => ids.has(id)), ...links],
        rings,
        path: pathOf(rings),
        x: (w + e + 360) * 2,
        y: (170 - n - s) * 2,
        resource: 'trade',
        strategicResource: null,
        razedTurn: null,
      };
    },
  );
  const all = [...land.filter((p) => ids.has(p.id)), ...seas];
  const active = new Set(all.map((p) => p.id));
  for (const p of all) {
    p.neighbors = p.neighbors.filter((id) => active.has(id) && !isLegacySeaShortcut(p.id, id));
    if (p.kind === 'LAND')
      for (const s of seas) if (s.neighbors.includes(p.id)) p.neighbors.push(s.id);
    p.neighbors = [...new Set(p.neighbors)];
  }
  for (const p of all)
    for (const id of p.neighbors) {
      const other = all.find((q) => q.id === id)!;
      if (!other.neighbors.includes(p.id)) other.neighbors.push(p.id);
    }
  for (const [a, b, sea] of STRAITS) {
    const from = all.find((p) => p.id === a),
      to = all.find((p) => p.id === b);
    if (!from || !to || !active.has(sea)) continue;
    for (const [p, q] of [
      [from, to],
      [to, from],
    ]) {
      if (!p.neighbors.includes(q.id)) p.neighbors.push(q.id);
      p.straitNeighbors.push(q.id);
      p.straitSeaIds[q.id] = sea;
    }
  }
  return all;
}
export function makeMap(mode: GameMode = 'campaign', theater: Theater = 'EUROPE'): Province[] {
  return makeStaticMap(mode, theater).map((p, i) => ({
    ...p,
    ownerId: null,
    occupierId: null,
    religion: (['SOLAR', 'MERCHANT', 'REFORMED', 'ANCESTRAL'] as const)[i % 4],
    pacification: 70,
    unrest: 10,
    fortLevel: 0,
    portLevel: 0,
    marketLevel: 0,
    barracksLevel: 0,
    foundryLevel: 0,
    templeLevel: 0,
    maxBuildingSlots:
      p.strategicResource === 'GOLD_MINE' || p.strategicResource === 'RELIC' ? 3 : 2,
    siege: null,
    recruitedThisTurn: 0,
    recruitmentTurn: 0,
    conversion: 0,
    conversionReligion: null,
    conversionInstigatorId: null,
    capitalOf: null,
  }));
}
