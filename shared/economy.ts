import type { Battalion, Composition, GameState, Province, RecruitBattalionOrder } from './types';
export const UNIT_UPKEEP: Composition = {
  infantry: 0.75,
  cavalry: 1.35,
  artillery: 2,
  warships: 1.5,
  transports: 0.5,
};
export const maintenanceOf = (a: Partial<Composition>) =>
  (Object.keys(UNIT_UPKEEP) as (keyof Composition)[]).reduce(
    (n, k) => n + (a[k] ?? 0) * UNIT_UPKEEP[k],
    0,
  );
export function realmLimits(g: Pick<GameState, 'provinces' | 'players'>, id: string) {
  const owned = g.provinces.filter((p) => p.kind === 'LAND' && (p.occupierId ?? p.ownerId) === id);
  const pacified = owned.filter(
    (p) => p.ownerId === id && p.pacification >= 80 && p.unrest < 50,
  ).length;
  const barracks = owned.reduce((n, p) => n + p.barracksLevel, 0);
  return {
    armyCap: 12 + Math.floor(owned.length * 1.5) + barracks * 5,
    manpowerCap: 18 + pacified * 1.5 + barracks * 8,
    manpowerGain:
      (1 + Math.floor(pacified * 0.25) + barracks * 1.5) *
      ((g.players.find((p) => p.id === id)?.warExhaustion ?? 0) >= 25 ? 0.7 : 1),
  };
}
export const provinceRecruitLimit = (p: Pick<Province, 'barracksLevel' | 'foundryLevel'>) =>
  p.barracksLevel >= 2 || p.foundryLevel >= 1 ? 7 : p.barracksLevel === 1 ? 4 : 2;
export const recruitedCount = (p: Province, turn: number) =>
  p.recruitmentTurn === turn ? p.recruitedThisTurn : 0;
export function recruitmentBlock(p: Province, o: RecruitBattalionOrder, turn: number) {
  const count =
    (o.infantry ?? 0) +
    (o.cavalry ?? 0) +
    (o.artillery ?? 0) +
    (o.warships ?? 0) +
    (o.transports ?? 0);
  if (
    !o.isFleet &&
    !p.barracksLevel &&
    !p.foundryLevel &&
    ((o.cavalry ?? 0) > 0 || (o.artillery ?? 0) > 0)
  )
    return 'Construa um Quartel ou Fundição para recrutar Cavalaria/Artilharia.';
  if (recruitedCount(p, turn) + count > provinceRecruitLimit(p))
    return `Capacidade local de ${provinceRecruitLimit(p)} unidades por rodada excedida.`;
  return null;
}
export function moraleRecovery(
  g: Pick<GameState, 'players' | 'relations' | 'wars' | 'provinces'>,
  a: Battalion,
) {
  const p = g.provinces.find((p) => p.id === a.provinceId);
  if (!p) return 0;
  const c = p.occupierId ?? p.ownerId;
  if (p.ownerId === a.ownerId && c === a.ownerId && p.pacification >= 80)
    return p.barracksLevel > 0 ? 45 : 35;
  if (
    c === a.ownerId ||
    g.relations.some(
      (r) => r.allied && ((r.a === a.ownerId && r.b === c) || (r.b === a.ownerId && r.a === c)),
    )
  )
    return 20;
  return 8;
}
