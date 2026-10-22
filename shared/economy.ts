import { goldRules } from './factions';
import type { Battalion, Composition, GameState, Province, RecruitBattalionOrder } from './types';
export const UNIT_UPKEEP: Composition = {
  infantry: 0.75,
  cavalry: 1.35,
  artillery: 2,
  warships: 1.5,
  transports: 0.5,
};
export const maintenanceOf = (a: Partial<Composition>, nation?: import('./types').NationId) =>
  (Object.keys(UNIT_UPKEEP) as (keyof Composition)[]).reduce(
    (n, k) =>
      n +
      (a[k] ?? 0) *
        UNIT_UPKEEP[k] *
        (nation === 'kaldor' && k === 'artillery'
          ? 0.75
          : nation === 'turan' && k === 'cavalry'
            ? 0.8
            : 1),
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
export const provinceRecruitLimit = (
  p: Pick<Province, 'barracksLevel' | 'foundryLevel'> & Partial<Pick<Province, 'marketLevel'>>,
  actor?: { nationId: string },
  g?: unknown,
  order?: Partial<RecruitBattalionOrder>,
) =>
  (p.barracksLevel >= 2 || p.foundryLevel >= 1 ? 7 : p.barracksLevel === 1 ? 4 : 2) +
  (goldRules(g) &&
  actor?.nationId === 'vespera' &&
  (p.marketLevel ?? 0) > 0 &&
  !order?.isFleet &&
  ((!(order?.cavalry ?? 0) && !(order?.artillery ?? 0)) || order?.isMercenary)
    ? 1
    : 0);
export const recruitedCount = (p: Province, turn: number) =>
  p.recruitmentTurn === turn ? p.recruitedThisTurn : 0;
export function recruitmentBlock(
  p: Province,
  o: RecruitBattalionOrder,
  turn: number,
  actor?: { nationId: string },
  g?: unknown,
) {
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
    (((o.cavalry ?? 0) > 0 && !(goldRules(g) && actor?.nationId === 'turan')) ||
      (o.artillery ?? 0) > 0)
  )
    return 'Construa um Quartel ou Fundição para recrutar Cavalaria/Artilharia.';
  if (recruitedCount(p, turn) + count > provinceRecruitLimit(p, actor, g, o))
    return `Capacidade local de ${provinceRecruitLimit(p, actor, g, o)} unidades por rodada excedida.`;
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

export function goldReparationPayments(
  g: Pick<GameState, 'reparations' | 'players' | 'turn'>,
  economy: (id: string) => { grossIncome: number; income: number },
) {
  const available = new Map<string, number>();
  return g.reparations
    .filter((r) => r.untilTurn >= g.turn)
    .map((r) => {
      const payer = g.players.find((p) => p.id === r.payerId),
        eco = payer ? economy(payer.id) : null;
      const funds = available.get(r.payerId) ?? (payer?.gold ?? 0) + (eco?.income ?? 0);
      const amount =
        Math.round(Math.max(0, Math.min(funds, (eco?.grossIncome ?? 0) * r.rate)) * 100) / 100;
      available.set(r.payerId, funds - amount);
      return { ...r, amount };
    });
}

export type AuthorityNation = Pick<
  import('./types').Player,
  'influence' | 'prestige' | 'militaryXP'
>;
export const integerValue = (value: number) =>
  Number.isFinite(value) ? Math.round(value) || 0 : 0;
export function getNationAuthority(nation: AuthorityNation): number {
  return Math.max(0, integerValue(nation.influence + nation.prestige + nation.militaryXP));
}
export function spendNationAuthority(nation: AuthorityNation, cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0 || getNationAuthority(nation) < Math.ceil(cost))
    return false;
  let remaining = Math.ceil(cost);
  for (const key of ['influence', 'militaryXP', 'prestige'] as const) {
    const amount = Math.min(Math.max(0, nation[key]), remaining);
    nation[key] -= amount;
    remaining -= amount;
  }
  syncNationAuthority(nation);
  return true;
}

export function integerEventText(text: string): string {
  return text.replace(/(?<![\w.])(-?\d+)[.,](\d+)(?![\d.])/g, (value) =>
    String(integerValue(Number(value.replace(',', '.')))),
  );
}

export function syncNationAuthority(nation: AuthorityNation & { authority?: number }) {
  nation.authority = getNationAuthority(nation);
  return nation.authority;
}
export function logisticsPosture(
  g: Pick<GameState, 'provinces' | 'turn'> &
    Partial<Pick<GameState, 'orders'>> & { plannedOrders?: import('./types').PlayerOrder[] },
  army: Battalion,
): { id: 'GARRISON' | 'CAMPAIGN'; multiplier: number; label: string } {
  const province = g.provinces.find((p) => p.id === army.provinceId);
  const orders = g.orders?.[army.ownerId] ?? g.plannedOrders ?? [];
  const marching =
    army.pathQueue.length > 0 ||
    army.lastMovedTurn === g.turn ||
    orders.some(
      (o) =>
        'battalionId' in o &&
        o.battalionId === army.id &&
        ['MOVE_BATTALION', 'AUTO_TRANSPORT', 'NAVAL_BRIDGE', 'EMBARK_BATTALION'].includes(o.type),
    );
  if (
    !army.isFleet &&
    !army.embarkedOnId &&
    !army.stranded &&
    province?.ownerId === army.ownerId &&
    !province.occupierId &&
    province.pacification >= 80 &&
    !province.siege &&
    !marching
  )
    return { id: 'GARRISON', multiplier: 0.5, label: '🛡️ Em Guarnição (-50% custo)' };
  const distant =
    !army.isFleet &&
    province?.kind === 'LAND' &&
    !!province.ownerId &&
    province.ownerId !== army.ownerId &&
    !province.neighbors.some((id) =>
      g.provinces.some((p) => p.id === id && p.ownerId === army.ownerId && !p.occupierId),
    );
  return {
    id: 'CAMPAIGN',
    multiplier: distant ? 1.25 : 1,
    label: distant ? '⚔️ Em Campanha (+25% logística distante)' : '⚔️ Em Campanha (Custo total)',
  };
}
