import type { Province } from './types';

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
    return {
      id: `p${index}`,
      name,
      col,
      row,
      x: 94 + col * 93,
      y: 85 + row * 107.387 + (col % 2) * 53.694,
      neighbors,
      resource: (['grain', 'trade', 'iron', 'shrine'] as const)[
        (index * 7 + Math.floor(index / 8)) % 4
      ],
      ownerId: null,
      troops: 2,
      morale: 55,
      training: 30,
      unrest: 10,
      development: 0,
      faith: [6, 7, 14].includes(index)
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
export function hexPoints(p: Pick<Province, 'x' | 'y'>, radius = 60.5) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${p.x + radius * Math.cos(a)},${p.y + radius * Math.sin(a)}`;
  }).join(' ');
}
