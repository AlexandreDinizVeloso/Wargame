import type { Battalion, GameState, Province } from './types';
import { atWar, canTraverse, unitCount } from './rules';
export function bridgeOptions(
  g: Pick<GameState, 'provinces' | 'battalions' | 'wars' | 'relations' | 'players'>,
  army: Battalion,
  target: Province,
) {
  const source = g.provinces.find((p) => p.id === army.provinceId);
  if (
    army.isFleet ||
    army.embarkedOnId ||
    army.stranded ||
    !source?.isCoastal ||
    source.kind !== 'LAND' ||
    target.kind !== 'LAND' ||
    !target.isCoastal ||
    source.id === target.id
  )
    return [];
  return g.battalions.filter(
    (f) =>
      f.ownerId === army.ownerId &&
      f.isFleet &&
      !f.stranded &&
      !f.embarkedArmyId &&
      f.transports * 4 >= unitCount(army) &&
      g.provinces.some(
        (s) =>
          s.id === f.provinceId &&
          s.kind === 'SEA_ZONE' &&
          s.neighbors.includes(source.id) &&
          s.neighbors.includes(target.id),
      ),
  );
}
export function legalBridge(
  g: Pick<GameState, 'provinces' | 'battalions' | 'wars' | 'relations' | 'players'>,
  army: Battalion,
  target: Province,
  fleetId: string,
) {
  return (
    canTraverse(
      g,
      army,
      g.provinces.find((p) => p.id === army.provinceId)!,
      target,
    ) &&
    bridgeOptions(g, army, target).some((f) => f.id === fleetId) &&
    !g.battalions.some(
      (f) =>
        f.isFleet &&
        f.provinceId === g.battalions.find((a) => a.id === fleetId)?.provinceId &&
        atWar(g, army.ownerId, f.ownerId),
    )
  );
}
