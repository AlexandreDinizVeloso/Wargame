import type { Province } from './types';

export type Terrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'coastal';
export interface ProvinceStaticData {
  id: string;
  name: string;
  terrain: Terrain;
  terrainDefenseBonus: number;
  baseTax: number;
  baseSupplyLimit: number;
  neighbors: string[];
  polygon: string;
  x: number;
  y: number;
  col: number;
  row: number;
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

const NAMES = [
  'Irlanda',
  'Gales',
  'Escócia',
  'Londres',
  'Flandres',
  'Holanda',
  'Dinamarca',
  'Prússia',
  'Galícia',
  'Leão',
  'Bretanha',
  'Paris',
  'Renânia',
  'Boêmia',
  'Saxônia',
  'Polônia',
  'Porto',
  'Castela',
  'Bordéus',
  'Provença',
  'Suíça',
  'Veneza',
  'Hungria',
  'Moldávia',
  'Lisboa',
  'Andaluzia',
  'Aragão',
  'Gênova',
  'Roma',
  'Ragusa',
  'Grécia',
  'Trácia',
];
export function makeMap(): Province[] {
  return NAMES.map((name, index) => {
    const col = index % 8,
      row = Math.floor(index / 8);
    const offsets =
      col % 2 === 0
        ? [
            [0, -1],
            [0, 1],
            [-1, -1],
            [-1, 0],
            [1, -1],
            [1, 0],
          ]
        : [
            [0, -1],
            [0, 1],
            [-1, 0],
            [-1, 1],
            [1, 0],
            [1, 1],
          ];
    const neighbors = offsets
      .map(([dc, dr]) => [col + dc, row + dr])
      .filter(([c, r]) => c >= 0 && c < 8 && r >= 0 && r < 4)
      .map(([c, r]) => `p${r * 8 + c}`);
    const terrain: Terrain =
      index === 20
        ? 'mountains'
        : [8, 10, 12, 14, 15].includes(index)
          ? 'forest'
          : [9, 13, 17, 22, 23, 26].includes(index)
            ? 'hills'
            : index === 11
              ? 'plains'
              : 'coastal';
    const resource = (['grain', 'trade', 'iron', 'shrine'] as const)[
      (index * 7 + Math.floor(index / 8)) % 4
    ];
    const center = { x: 94 + col * 93, y: 85 + row * 107.387 + (col % 2) * 53.694 };
    return {
      id: `p${index}`,
      name,
      col,
      row,
      ...center,
      terrain,
      terrainDefenseBonus: TERRAIN_DEFENSE[terrain],
      baseTax: { grain: 4, trade: 6, iron: 3, shrine: 3 }[resource],
      baseSupplyLimit: { plains: 18, coastal: 16, forest: 12, hills: 10, mountains: 8 }[terrain],
      polygon: hexPoints(center),
      neighbors,
      resource,
      ownerId: null,
      troops: 2,
      morale: 55,
      training: 1.05,
      mercenaries: 0,
      pacification: 70,
      fortLevel: 0,
      conversionReligion: null,
      conversionInstigatorId: null,
      unrest: 10,
      development: 0,
      religion: [6, 7, 14].includes(index)
        ? 'Protestantismo'
        : [22, 23, 29, 30].includes(index)
          ? 'Ortodoxia'
          : index === 31
            ? 'Islã sunita'
            : 'Catolicismo',
      conversion: 0,
      capital: false,
    };
  });
}
export function makeStaticMap(): ProvinceStaticData[] {
  return makeMap().map(
    ({
      id,
      name,
      terrain,
      terrainDefenseBonus,
      baseTax,
      baseSupplyLimit,
      neighbors,
      polygon,
      x,
      y,
      col,
      row,
      resource,
    }) => ({
      id,
      name,
      terrain,
      terrainDefenseBonus,
      baseTax,
      baseSupplyLimit,
      neighbors,
      polygon,
      x,
      y,
      col,
      row,
      resource,
    }),
  );
}
export function hexPoints(p: Pick<Province, 'x' | 'y'>, radius = 60.5) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${p.x + radius * Math.cos(a)},${p.y + radius * Math.sin(a)}`;
  }).join(' ');
}
