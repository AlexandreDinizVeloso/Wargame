import type { Province } from './types';
export function independentCity(p: Province) {
  return (
    p.kind === 'LAND' &&
    !p.ownerId &&
    !p.occupierId &&
    (p.baseTax >= 7 ||
      p.resource === 'trade' ||
      p.strategicResource === 'GOLD_MINE' ||
      p.strategicResource === 'RELIC')
  );
}
export const neutralTarget = (p: Province) => 2 + Math.min(5, p.neutralDevelopmentLevel) * 2;
export const nextNeutralTurn = (turn: number) => Math.floor(turn / 4 + 1) * 4;
