import { isImpassableCrossing } from './geography';
export {
  WORLD_RIVERS,
  riverCrossings,
  hasRiverCrossing,
  impassableFeatures,
  isImpassableCrossing,
} from './geography';
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
  SOUTH_AMERICA: 'América do Sul',
  NORTH_AMERICA: 'América do Norte e Central',
  EUROPE: 'Europa',
  MENA_AFRICA: 'África e Oriente Médio',
  ASIA: 'Ásia e Oceania',
  AMERICAS: 'Américas',
};
export const THEATERS: Theater[] = ['EUROPE', 'AMERICAS', 'ASIA'];
// Only used when loading old maps whose former sea shortcuts need migration.
export const isLegacySeaShortcut = (a: string, b: string) =>
  (a === 'china-east' && b === 'japan') ||
  (b === 'china-east' && a === 'japan') ||
  (a === 'lowlands' && b === 'britain') ||
  (b === 'lowlands' && a === 'britain');
const SEAS: [string, string, number[], string[], string[]][] = [
  [
    'north-atlantic',
    'Atlântico Norte',
    [-65, 22, -15, 65],
    [
      'castile',
      'france',
      'britain',
      'scandinavia',
      'canada-east',
      'usa-east',
      'mexico',
      'central-america',
      'colombia',
    ],
    ['south-atlantic', 'mediterranean', 'north-sea', 'arctic-ocean', 'north-pacific'],
  ],
  [
    'south-atlantic',
    'Atlântico Sul',
    [-38, -42, -5, 5],
    ['brazil', 'rioplata', 'west-africa', 'central-africa', 'south-africa'],
    ['north-atlantic', 'indian-ocean', 'south-pacific'],
  ],
  [
    'mediterranean',
    'Mediterrâneo',
    [-5, 30, 35, 43],
    ['castile', 'france', 'italy', 'balkans', 'maghreb', 'nile', 'anatolia', 'arabia'],
    ['north-atlantic', 'arabian-sea'],
  ],
  [
    'north-sea',
    'Mar do Norte',
    [-5, 51, 25, 65],
    ['britain', 'france', 'germany', 'scandinavia', 'poland', 'muscovy'],
    ['north-atlantic', 'arctic-ocean'],
  ],
  [
    'indian-ocean',
    'Oceano Índico',
    [55, -35, 98, 0],
    ['east-africa', 'south-africa', 'india-north', 'india-south', 'indochina', 'archipelago'],
    ['south-atlantic', 'arabian-sea', 'south-china-sea', 'south-pacific'],
  ],
  [
    'arabian-sea',
    'Mar Arábico',
    [43, 3, 70, 25],
    ['east-africa', 'arabia', 'persia', 'afghan', 'india-north', 'india-south'],
    ['mediterranean', 'indian-ocean'],
  ],
  [
    'south-china-sea',
    'Mar da China Meridional',
    [107, 0, 124, 23],
    ['indochina', 'china-east', 'archipelago'],
    ['indian-ocean', 'north-pacific', 'south-pacific'],
  ],
  [
    'north-pacific',
    'Pacífico Norte',
    [-165, 10, -130, 50],
    ['alaska', 'canada-west', 'usa-west', 'mexico', 'china-east', 'korea', 'japan', 'siberia'],
    ['south-pacific', 'south-china-sea', 'arctic-ocean', 'north-atlantic'],
  ],
  [
    'south-pacific',
    'Pacífico Sul',
    [-150, -45, -90, 0],
    ['andes', 'rioplata', 'central-america', 'colombia', 'archipelago'],
    ['north-pacific', 'south-atlantic', 'indian-ocean', 'south-china-sea'],
  ],
  [
    'arctic-ocean',
    'Oceano Ártico',
    [-80, 70, 60, 83],
    ['alaska', 'canada-west', 'canada-east', 'scandinavia', 'muscovy', 'ural', 'siberia'],
    ['north-atlantic', 'north-sea', 'north-pacific'],
  ],
];
export const STRAITS: readonly [string, string, string][] = [
  ['britain', 'france', 'north-atlantic'],
  ['castile', 'maghreb', 'mediterranean'],
  ['scandinavia', 'germany', 'north-sea'],
  ['italy', 'balkans', 'mediterranean'],
  ['balkans', 'anatolia', 'mediterranean'],
  ['arabia', 'east-africa', 'arabian-sea'],
  ['indochina', 'archipelago', 'south-china-sea'],
  ['korea', 'japan', 'north-pacific'],
  ['alaska', 'siberia', 'arctic-ocean'],
];
export const WORLD_STARTS = {
  vespera: ['castile', 'france'],
  ferro_norte: ['scandinavia', 'muscovy'],
  aurelia: ['nile', 'maghreb'],
  sol_invicto: ['arabia', 'persia'],
  kaldor: ['south-africa', 'east-africa'],
  turan: ['mongolia', 'siberia'],
  sapiencia: ['china-east', 'indochina'],
  veridia: ['brazil', 'colombia'],
} as const;
const pathOf = (rings: number[][][]) =>
  rings.map((r) => `M${r.map((p) => p.join(',')).join('L')}Z`).join('');
export function makeStaticMap(
  mode: GameMode = 'campaign',
  theater: Theater = 'EUROPE',
): ProvinceStaticData[] {
  const land: ProvinceStaticData[] = geometry.map((g, i) => {
    const isCoastal = SEAS.some((s) => s[3].includes(g.id));
    const terrain: Terrain = ['andes', 'afghan', 'china-west', 'anatolia'].includes(g.id)
      ? 'mountains'
      : [
            'brazil',
            'canada-east',
            'canada-west',
            'ural',
            'siberia',
            'central-africa',
            'archipelago',
          ].includes(g.id)
        ? 'forest'
        : ['castile', 'mongolia', 'persia'].includes(g.id)
          ? 'hills'
          : isCoastal
            ? 'coastal'
            : 'plains';
    return {
      ...g,
      neighbors: [...g.neighbors],
      kind: 'LAND',
      continent: g.continent as Continent,
      straitNeighbors: [],
      straitSeaIds: {},
      rings: g.rings,
      path: pathOf(g.rings),
      isCoastal,
      terrain,
      terrainDefenseBonus: TERRAIN_DEFENSE[terrain],
      baseTax: [4, 5, 3, 4][i % 4] + (i % 6 === 3 ? 5 : 0),
      strategicResource: (
        ['GRAIN', 'IRON', 'HORSES', 'GOLD_MINE', 'RELIC', 'TIMBER', 'SPICES', null] as const
      )[i % 8],
      razedTurn: null,
      baseSupplyLimit: terrain === 'mountains' ? 10 : terrain === 'forest' ? 12 : 18,
      resource: (['grain', 'trade', 'iron', 'shrine'] as const)[i % 4],
    };
  });
  const ids = new Set(
    land
      .filter(
        (p) =>
          mode === 'campaign' ||
          p.continent === theater ||
          (theater === 'AMERICAS' && ['SOUTH_AMERICA', 'NORTH_AMERICA'].includes(p.continent)),
      )
      .map((p) => p.id),
  );
  const seas: ProvinceStaticData[] = SEAS.filter((s) => s[3].some((id) => ids.has(id))).map(
    ([id, name, bounds, ports, links]) => {
      const [w, s, e, n] = bounds,
        project = (lon: number, lat: number) => [(lon + 180) * 4, (85 - lat) * 4];
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
  const all = [...land.filter((p) => ids.has(p.id)), ...seas],
    active = new Set(all.map((p) => p.id));
  for (const p of all) {
    p.neighbors = p.neighbors.filter(
      (id) => active.has(id) && !isLegacySeaShortcut(p.id, id) && !isImpassableCrossing(p.id, id),
    );
    if (p.kind === 'LAND')
      for (const sea of seas) if (sea.neighbors.includes(p.id)) p.neighbors.push(sea.id);
    p.neighbors = [...new Set(p.neighbors)];
  }
  for (const p of all)
    for (const id of p.neighbors) {
      const q = all.find((q) => q.id === id)!;
      if (!q.neighbors.includes(p.id)) q.neighbors.push(p.id);
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
    neutralDevelopmentLevel: 0,
    neutralDevelopmentTurn: 0,
    coastalBombardment: null,
    recruitedThisTurn: 0,
    recruitmentTurn: 0,
    conversion: 0,
    conversionReligion: null,
    conversionInstigatorId: null,
    capitalOf: null,
  }));
}
