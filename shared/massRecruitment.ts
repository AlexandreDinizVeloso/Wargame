import { getNationAuthority, realmLimits, recruitmentBlock } from './economy';
import {
  atWar,
  landCount,
  orderCost,
  orderKey,
  reservedResources,
  roundMoney,
  MONEY_EPSILON,
} from './rules';
import type {
  GameState,
  GameView,
  Province,
  RecruitBattalionOrder,
  RecruitmentComposition,
} from './types';

const UNIT_KEYS = ['artillery', 'cavalry', 'infantry'] as const;
const empty = (): RecruitmentComposition => ({ infantry: 0, cavalry: 0, artillery: 0 });
const count = (composition: RecruitmentComposition) =>
  composition.infantry + composition.cavalry + composition.artillery;
export const MAX_MASS_RECRUITMENT = 240;
export type RecruitmentCost = { gold: number; manpower: number; authority: number };
export interface MassRecruitmentPlan {
  orders: RecruitBattalionOrder[];
  requested: RecruitmentComposition;
  allocated: RecruitmentComposition;
  unfilled: RecruitmentComposition;
  cost: RecruitmentCost;
  byProvince: { provinceId: string; composition: RecruitmentComposition; cost: RecruitmentCost }[];
  reasons: string[];
}

/** Pure preview shared by the browser and the authoritative command handler. */
export function planMassRecruitment(
  game: GameState | GameView,
  playerId: string,
  composition: RecruitmentComposition,
): MassRecruitmentPlan {
  const requested = { ...composition };
  const result: MassRecruitmentPlan = {
    orders: [],
    requested,
    allocated: empty(),
    unfilled: { ...requested },
    cost: { gold: 0, manpower: 0, authority: 0 },
    byProvince: [],
    reasons: [],
  };
  if (
    UNIT_KEYS.some((key) => !Number.isInteger(requested[key]) || requested[key] < 0) ||
    count(requested) < 1 ||
    count(requested) > MAX_MASS_RECRUITMENT
  ) {
    result.reasons.push(`Escolha entre 1 e ${MAX_MASS_RECRUITMENT} tropas inteiras.`);
    return result;
  }
  const actor = game.players.find((player) => player.id === playerId);
  if (!actor || game.phase !== 'planning' || actor.ready) {
    result.reasons.push('Reabra suas ordens durante o planejamento para recrutar.');
    return result;
  }
  const state = 'orders' in game ? game : { ...game, orders: { [playerId]: game.plannedOrders } };
  const existing = state.orders[playerId] ?? [];
  const reserved = reservedResources(state, playerId);
  const available = {
    gold: Math.max(0, actor.gold - reserved.gold),
    manpower: Math.max(0, actor.manpower - reserved.manpower),
    authority: Math.max(0, getNationAuthority(actor) - reserved.influence),
  };
  const occupiedKeys = new Set(existing.map(orderKey));
  const embarking = new Set(
    existing.filter((order) => order.type === 'EMBARK_BATTALION').map((order) => order.battalionId),
  );
  const reasons = new Set<string>();
  const candidates: { province: Province; order: RecruitBattalionOrder }[] = [];
  for (const province of [...game.provinces].sort((a, b) => a.id.localeCompare(b.id))) {
    if (province.kind !== 'LAND' || province.ownerId !== playerId) continue;
    if (
      province.occupierId ||
      province.siege ||
      game.battalions.some(
        (army) =>
          army.provinceId === province.id &&
          army.ownerId !== playerId &&
          (army.ownerId === 'NEUTRAL' || atWar(game, playerId, army.ownerId)),
      )
    ) {
      reasons.add('Cidades ocupadas, sitiadas ou com tropas inimigas não podem recrutar.');
      continue;
    }
    if (occupiedKeys.has(`city:${province.id}`)) {
      reasons.add('As ordens de cidade já preparadas foram preservadas.');
      continue;
    }
    const reinforcement = game.battalions
      .filter(
        (army) =>
          army.ownerId === playerId &&
          army.provinceId === province.id &&
          !army.isFleet &&
          !army.isMercenary &&
          !army.embarkedOnId &&
          !army.stranded &&
          !embarking.has(army.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    candidates.push({
      province,
      order: {
        type: 'RECRUIT_BATTALION',
        provinceId: province.id,
        ...empty(),
        warships: 0,
        transports: 0,
        ...(reinforcement ? { battalionId: reinforcement.id } : {}),
      },
    });
  }
  const formations =
    game.battalions.filter((army) => army.ownerId === playerId).length +
    existing.filter((order) => order.type === 'RECRUIT_BATTALION' && !order.battalionId).length;
  const queuedTroops = existing.reduce(
    (sum, order) =>
      sum + (order.type === 'RECRUIT_BATTALION' && !order.isFleet ? landCount(order) : 0),
    0,
  );
  const liveTroops = game.battalions.reduce(
    (sum, army) => sum + (army.ownerId === playerId && !army.isFleet ? landCount(army) : 0),
    0,
  );
  const disarmCapacity =
    actor.disarmUntil >= game.turn
      ? Math.max(0, Math.min(8, realmLimits(game, playerId).armyCap) - liveTroops - queuedTroops)
      : Infinity;
  const costOf = (order: RecruitBattalionOrder, province: Province): RecruitmentCost => {
    const cost = orderCost(order, province, actor, game);
    return { gold: cost.gold, manpower: cost.manpower, authority: cost.influence };
  };
  // Infrastructure-sensitive units reserve their scarce slots first. Favor the
  // cheapest available slot, then spread equal-cost requests across cities.
  for (const unit of UNIT_KEYS) {
    while (result.allocated[unit] < requested[unit]) {
      let changed = false;
      const marginalCost = (city: (typeof candidates)[number]) =>
        roundMoney(
          costOf({ ...city.order, [unit]: (city.order[unit] ?? 0) + 1 }, city.province).gold -
            costOf(city.order, city.province).gold,
        );
      const cities = [...candidates].sort(
        (a, b) =>
          marginalCost(a) - marginalCost(b) ||
          landCount(a.order) - landCount(b.order) ||
          a.province.id.localeCompare(b.province.id),
      );
      for (const candidate of cities) {
        if (result.allocated[unit] >= requested[unit]) break;
        const { province, order } = candidate;
        const next = { ...order, [unit]: (order[unit] ?? 0) + 1 };
        const blocked = recruitmentBlock(province, next, game.turn, actor, game);
        if (blocked) {
          reasons.add(blocked);
          continue;
        }
        if (count(result.allocated) >= disarmCapacity) {
          reasons.add('O tratado de desarmamento limita o total de tropas.');
          continue;
        }
        const newFormations = candidates.filter(
          (city) => !city.order.battalionId && landCount(city.order) > 0,
        ).length;
        if (!order.battalionId && !landCount(order) && formations + newFormations >= 80) {
          reasons.add('O limite de 80 formações exige reforçar um batalhão existente.');
          continue;
        }
        const before = costOf(order, province),
          after = costOf(next, province);
        const total = {
          gold: roundMoney(result.cost.gold - before.gold + after.gold),
          manpower: result.cost.manpower - before.manpower + after.manpower,
          authority: result.cost.authority - before.authority + after.authority,
        };
        if (
          total.gold > available.gold + MONEY_EPSILON ||
          total.manpower > available.manpower ||
          total.authority > available.authority
        ) {
          reasons.add(
            'Ouro, recrutas ou Autoridade livres insuficientes para atender todo o pedido.',
          );
          continue;
        }
        candidate.order = next;
        result.cost = total;
        result.allocated[unit]++;
        changed = true;
        break;
      }
      if (!changed) break;
    }
  }
  result.orders = candidates.filter((city) => landCount(city.order) > 0).map((city) => city.order);
  result.byProvince = result.orders.map((order) => ({
    provinceId: order.provinceId,
    composition: {
      infantry: order.infantry ?? 0,
      cavalry: order.cavalry ?? 0,
      artillery: order.artillery ?? 0,
    },
    cost: costOf(
      order,
      game.provinces.find((province) => province.id === order.provinceId)!,
    ),
  }));
  result.unfilled = {
    infantry: requested.infantry - result.allocated.infantry,
    cavalry: requested.cavalry - result.allocated.cavalry,
    artillery: requested.artillery - result.allocated.artillery,
  };
  if (!candidates.length) reasons.add('Nenhuma cidade própria está livre para este recrutamento.');
  result.reasons = count(result.unfilled) > 0 ? [...reasons] : [];
  return result;
}
