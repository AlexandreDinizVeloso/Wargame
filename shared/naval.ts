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
export interface CrossingOption {
  seaPath: string[];
  fleetId?: string;
  cost: number;
}
export function crossingOptions(
  g: Pick<GameState, 'provinces' | 'battalions' | 'wars' | 'relations' | 'players'> &
    Partial<Pick<GameState, 'turn' | 'graceUntilTurn'>>,
  army: Battalion,
  target: Province,
  orders: import('./types').PlayerOrder[] = [],
  allowDeclaration = false,
): CrossingOption[] {
  const source = g.provinces.find((p) => p.id === army.provinceId);
  if (
    !source ||
    army.isFleet ||
    army.embarkedOnId ||
    army.stranded ||
    !source.isCoastal ||
    !target.isCoastal ||
    source.kind !== 'LAND' ||
    target.kind !== 'LAND' ||
    source.id === target.id ||
    !(
      canTraverse(g, army, source, target) ||
      (allowDeclaration &&
        (g.turn ?? 0) > (g.graceUntilTurn ?? 0) &&
        canTraverse(g, army, source, { ...target, ownerId: null, occupierId: null }))
    )
  )
    return [];
  const seas = g.provinces.filter((s) => s.kind === 'SEA_ZONE'),
    paths: string[][] = [];
  for (const from of seas.filter((s) => s.neighbors.includes(source.id))) {
    if (from.neighbors.includes(target.id)) paths.push([from.id]);
    for (const to of seas.filter(
      (s) => s.id !== from.id && from.neighbors.includes(s.id) && s.neighbors.includes(target.id),
    ))
      paths.push([from.id, to.id]);
  }
  const clear = paths.filter(
    (path) =>
      !g.battalions.some(
        (f) =>
          f.isFleet &&
          f.warships > 0 &&
          path.includes(f.provinceId) &&
          atWar(g, army.ownerId, f.ownerId),
      ),
  );
  const options: CrossingOption[] = [];
  for (const path of clear.sort(
    (a, b) => a.length - b.length || a.join().localeCompare(b.join()),
  )) {
    for (const f of g.battalions.filter(
      (f) =>
        f.isFleet &&
        f.ownerId === army.ownerId &&
        path.includes(f.provinceId) &&
        !f.embarkedArmyId &&
        !f.stranded &&
        !f.pathQueue.length &&
        !orders.some(
          (o) =>
            (o.type === 'MOVE_BATTALION' || o.type === 'BOMBARD_COAST') && o.battalionId === f.id,
        ),
    )) {
      const used = orders
        .filter(
          (o) =>
            (o.type === 'NAVAL_BRIDGE' || o.type === 'AUTO_TRANSPORT') &&
            o.fleetId === f.id &&
            o.battalionId !== army.id,
        )
        .reduce(
          (n, o) =>
            n +
            unitCount(g.battalions.find((a) => 'battalionId' in o && a.id === o.battalionId) ?? {}),
          0,
        );
      if (f.transports * 4 >= unitCount(army) + used)
        options.push({ seaPath: path, fleetId: f.id, cost: 0 });
    }
    if (
      g.provinces.some(
        (p) =>
          p.ownerId === army.ownerId &&
          !p.occupierId &&
          p.isCoastal &&
          (p.portLevel >= 1 || p.capitalOf === army.ownerId),
      )
    )
      options.push({ seaPath: path, cost: 15 });
  }
  return options.sort(
    (a, b) =>
      a.cost - b.cost ||
      a.seaPath.length - b.seaPath.length ||
      (a.fleetId ?? '').localeCompare(b.fleetId ?? ''),
  );
}
