import type {
  GameState,
  Order,
  PlayerOrder,
  Province,
  Relation,
  ReligionId,
  StationedArmy,
} from './types';

export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function effectiveTax(p: Province, stateReligion: ReligionId) {
  return (
    p.baseTax *
    (p.pacification / 100) *
    (p.religion === stateReligion ? 1.15 : 0.85) *
    (1 - p.unrest / 200)
  );
}
export function supplyLimit(p: Province) {
  return p.baseSupplyLimit + p.fortLevel * 3 + (p.pacification >= 80 ? 2 : 0);
}
export function attritionLoss(troops: number, limit: number) {
  return troops > limit ? Math.max(1, Math.ceil((troops - limit) * 0.15)) : 0;
}
export function armyUpkeep(troops: number, mercenaries: number, limit: number, baseUpkeep = 0.35) {
  if (troops === 0) return 0;
  const excess = Math.max(0, troops - limit);
  return (
    baseUpkeep *
    (Math.min(troops, limit) + Math.pow(excess, 1.25)) *
    (1 + (1.2 * mercenaries) / troops)
  );
}
export function tradeIncomeOf(p: Province) {
  return (p.resource === 'trade' ? 2 : 0) + p.development * 1.5;
}
export function incomeOf(p: Province, religion: ReligionId = p.religion) {
  return effectiveTax(p, religion) + tradeIncomeOf(p);
}
export function economyOf(
  provinces: Province[],
  playerId: string,
  religion?: ReligionId,
  relations: Relation[] = [],
  baseUpkeep = 0.35,
  stationed: StationedArmy[] = [],
) {
  const owned = provinces.filter((p) => p.ownerId === playerId),
    stateReligion =
      religion ?? owned.find((p) => p.capital)?.religion ?? owned[0]?.religion ?? 'Catolicismo';
  let tradeModifier = 1;
  for (const r of relations.filter((r) => r.a === playerId || r.b === playerId))
    for (const actor of r.embargoes) tradeModifier *= actor === playerId ? 0.95 : 0.85;
  const taxes = owned.reduce((sum, p) => sum + effectiveTax(p, stateReligion), 0);
  const trade = owned.reduce((sum, p) => sum + tradeIncomeOf(p), 0) * tradeModifier;
  const foreign = stationed.filter((a) => a.ownerId === playerId);
  const localCost = (p: Province, units: number, mercenaries: number) => {
    const total =
      p.troops +
      stationed.filter((a) => a.provinceId === p.id).reduce((sum, a) => sum + a.troops, 0);
    return total > 0
      ? (armyUpkeep(total, 0, supplyLimit(p), baseUpkeep) * (units + 1.2 * mercenaries)) / total
      : 0;
  };
  const upkeep =
    owned.reduce((sum, p) => sum + localCost(p, p.troops, p.mercenaries), 0) +
    foreign.reduce(
      (sum, a) =>
        sum +
        localCost(
          provinces.find((p) => p.id === a.provinceId)!,
          a.troops,
          a.mercenaries,
        ),
      0,
    );

  return {
    income: roundMoney(taxes + trade),
    taxes: roundMoney(taxes),
    trade: roundMoney(trade),
    tradeModifier,
    upkeep: roundMoney(upkeep),
    net: roundMoney(taxes + trade - upkeep),
    manpower: owned.reduce((n, p) => n + (p.resource === 'grain' ? 2 : 1), 0),
    owned,
  };
}
export function realmEconomy(
  g: Pick<
    GameState,
    'provinces' | 'players' | 'relations' | 'baseUpkeep' | 'stationedArmies' | 'displacedArmies'
  >,
  id: string,
) {
  return economyOf(
    g.provinces,
    id,
    g.players.find((p) => p.id === id)?.faith,
    g.relations,
    g.baseUpkeep,
    [...g.stationedArmies, ...g.displacedArmies],
  );
}
export function normalizeOrder(o: PlayerOrder | Order): PlayerOrder {
  if ('type' in o) return o;
  switch (o.action) {
    case 'move':
      return {
        type: 'MOVE_ATTACK',
        fromProvinceId: o.provinceId,
        toProvinceId: o.targetId ?? '',
        troops: o.amount ?? 0,
      };
    case 'recruit':
      return { type: 'RECRUIT', provinceId: o.provinceId, amount: 3 };
    case 'train':
      return { type: 'TRAIN', provinceId: o.provinceId };
    case 'develop':
      return { type: 'DEVELOP', provinceId: o.provinceId };
    case 'pacify':
      return { type: 'PACIFY', provinceId: o.provinceId };
    case 'convert':
      return { type: 'CONVERT', targetProvinceId: o.provinceId };
  }
}
export function orderProvinceId(o: PlayerOrder) {
  return o.type === 'MOVE_ATTACK'
    ? o.fromProvinceId
    : o.type === 'CONVERT'
      ? o.targetProvinceId
      : o.type === 'DIPLOMACY'
        ? (o.targetProvinceId ?? null)
        : o.provinceId;
}
export function orderKey(o: PlayerOrder) {
  return o.type === 'DIPLOMACY' ? `diplomacy:${o.action}:${o.targetRealmId}` : orderProvinceId(o)!;
}
export function orderCost(raw: PlayerOrder | Order, p?: Province) {
  const o = normalizeOrder(raw);
  switch (o.type) {
    case 'MOVE_ATTACK':
      return { gold: 0, manpower: 0, influence: 0 };
    case 'RECRUIT':
      return {
        gold: o.amount * (o.isMercenary ? 6 : 3),
        manpower: o.isMercenary ? 0 : o.amount,
        influence: 0,
      };
    case 'TRAIN':
      return { gold: 6, manpower: 0, influence: 0 };
    case 'PACIFY':
      return { gold: 8, manpower: 0, influence: 0 };
    case 'CONVERT':
      return { gold: 8, manpower: 0, influence: 2 };
    case 'DEVELOP':
      return { gold: 16 + (p?.development ?? 0) * 8, manpower: 0, influence: 0 };
    case 'BUILD_FORT':
      return { gold: 18 + (p?.fortLevel ?? 0) * 10, manpower: 0, influence: 0 };
    case 'DIPLOMACY':
      return {
        gold: ['FUND_REBELS', 'SEND_SUBSIDY'].includes(o.action) ? (o.amount ?? 0) : 0,
        manpower: 0,
        influence: 0,
      };
  }
}
export function reservedResources(
  g: Pick<GameState, 'orders' | 'provinces'>,
  id: string,
  exceptKey?: string,
) {
  return (g.orders[id] ?? [])
    .filter((o) => orderKey(o) !== exceptKey)
    .reduce(
      (n, o) => {
        const c = orderCost(
          o,
          g.provinces.find((p) => p.id === orderProvinceId(o)),
        );
        return {
          gold: roundMoney(n.gold + c.gold),
          manpower: n.manpower + c.manpower,
          influence: n.influence + c.influence,
        };
      },
      { gold: 0, manpower: 0, influence: 0 },
    );
}
export function legacyOrder(o: PlayerOrder): Order | null {
  switch (o.type) {
    case 'MOVE_ATTACK':
      return {
        action: 'move',
        provinceId: o.fromProvinceId,
        targetId: o.toProvinceId,
        amount: o.troops,
      };
    case 'RECRUIT':
      return { action: 'recruit', provinceId: o.provinceId, amount: o.amount };
    case 'TRAIN':
      return { action: 'train', provinceId: o.provinceId };
    case 'DEVELOP':
      return { action: 'develop', provinceId: o.provinceId };
    case 'PACIFY':
      return { action: 'pacify', provinceId: o.provinceId };
    case 'CONVERT':
      return { action: 'convert', provinceId: o.targetProvinceId };
    default:
      return null;
  }
}
