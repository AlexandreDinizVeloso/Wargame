import { subjugationEligible } from '../shared/development';
import { goldRules } from '../shared/factions';
import { bombardmentBlock, seaTradeNodes } from '../shared/maritime';
import { commanderFor } from '../shared/military';
import { friendlyRest, isDisorganized } from '../shared/morale';
import { crossingOptions } from '../shared/naval';
import {
  atWar,
  canTransit,
  controller,
  orderCost,
  orderKey,
  orderProvinceId,
  realmEconomy,
  reservedResources,
  supplyLimit,
  unitCount,
  unitPath,
} from '../shared/rules';
import type { GameState, Player, PlayerOrder } from '../shared/types';
import { instantArmyAction, recruitCommander, unlockSkill } from './armies';
import { combatPowers } from './combat';
import { answerOffer, declareWar, offerPeace, updateWarScores } from './diplomacy';
import { botThreat } from './goldWorld';
import { playerOf, provinceOf } from './state';
import { coalitionWar, joinCoalition } from './world';

export function computeProvinceThreat(g: GameState, provinceId: string, ownerId?: string): number {
  const province = g.provinces.find((p) => p.id === provinceId);
  if (!province) return 0;
  const owner = ownerId ?? controller(province);
  if (!owner) return 0;
  return g.battalions
    .filter(
      (a) =>
        !a.isFleet &&
        !a.embarkedOnId &&
        !a.stranded &&
        (a.provinceId === provinceId || province.neighbors.includes(a.provinceId)) &&
        a.ownerId !== owner &&
        (atWar(g, owner, a.ownerId) || (a.ownerId === 'NEUTRAL' && a.provinceId === provinceId)),
    )
    .reduce((n, a) => n + unitCount(a), 0);
}
const outbound = (g: GameState, a: import('../shared/types').Battalion) =>
  a.pathQueue.length > 0 ||
  (g.orders[a.ownerId] ?? []).some(
    (o) =>
      'battalionId' in o &&
      o.battalionId === a.id &&
      ['MOVE_BATTALION', 'AUTO_TRANSPORT', 'EMBARK_BATTALION', 'NAVAL_BRIDGE'].includes(o.type),
  );
export function canLeaveDefendedProvince(
  g: GameState,
  army: import('../shared/types').Battalion,
): boolean {
  const p = g.provinces.find((p) => p.id === army.provinceId);
  if (!p || p.ownerId !== army.ownerId) return true;
  const threat = computeProvinceThreat(g, p.id, army.ownerId);
  if (!threat) return true;
  const remaining = g.battalions
    .filter(
      (a) =>
        a.id !== army.id &&
        a.ownerId === army.ownerId &&
        a.provinceId === p.id &&
        !a.isFleet &&
        !a.embarkedOnId &&
        !outbound(g, a),
    )
    .reduce((n, a) => n + unitCount(a), 0);
  return remaining >= Math.max(2, Math.ceil(threat * 0.8));
}
export function priorityProvince(g: GameState, p: Player): string | null {
  const sieged = g.provinces.find((q) => q.siege?.attackerOwnerId === p.id);
  if (sieged) return sieged.id;
  const previous = g.provinces.find(
    (q) => q.id === p.botTargetProvinceId && controller(q) !== p.id,
  );
  const armies = g.battalions
    .filter((a) => a.ownerId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded)
    .sort((a, b) => unitCount(b) - unitCount(a));
  const main = armies[0];
  if (!main) return null;
  const candidates = g.provinces
    .filter(
      (q) =>
        q.kind === 'LAND' &&
        controller(q) !== p.id &&
        (!controller(q) || atWar(g, p.id, controller(q)!) || p.botArchetype === 'Militarist'),
    )
    .map((q) => ({ q, path: unitPath(g, main, q.id) }))
    .filter((v) => v.path?.length)
    .sort(
      (a, b) =>
        Number(b.q.id === previous?.id) - Number(a.q.id === previous?.id) ||
        Number(!!controller(b.q) && atWar(g, p.id, controller(b.q)!)) -
          Number(!!controller(a.q) && atWar(g, p.id, controller(a.q)!)) ||
        a.path!.length - b.path!.length ||
        b.q.baseTax - a.q.baseTax ||
        a.q.id.localeCompare(b.q.id),
    );
  return candidates[0]?.q.id ?? null;
}
function tryOrder(
  g: GameState,
  p: Player,
  o: PlayerOrder,
  estimatedNet: number,
  submitOrder: (g: GameState, id: string, order: PlayerOrder) => void,
) {
  try {
    const cost = orderCost(
        o,
        g.provinces.find((q) => q.id === orderProvinceId(o, g)),
        p,
        g,
      ),
      reserved = reservedResources(g, p.id, orderKey(o));
    if (cost.gold > 0 && p.gold - reserved.gold - cost.gold + estimatedNet < 2) return false;
    submitOrder(g, p.id, o);
    return true;
  } catch {
    return false;
  }
}
function botPeace(g: GameState, p: Player) {
  if (goldRules(g)) updateWarScores(g);
  for (const war of g.wars.filter(
    (w) => w.active && [w.attackerLeaderId, w.defenderLeaderId].includes(p.id),
  )) {
    const score = war.warScore * (war.attackerLeaderId === p.id ? 1 : -1);
    try {
      if (goldRules(g) && score <= -40 && p.warExhaustion >= 25) {
        if (g.offers.some((o) => o.kind === 'peace' && o.warId === war.id && o.from === p.id))
          continue;
        const occupiers = war.attackerLeaderId === p.id ? war.defenderIds : war.attackerIds;
        const ceded = g.provinces
          .filter((q) => q.ownerId === p.id && q.occupierId && occupiers.includes(q.occupierId))
          .slice(0, Math.floor(-score / 20))
          .map((q) => q.id);
        offerPeace(
          g,
          p.id,
          war.id,
          ceded.length
            ? [{ type: 'CEDE_PROVINCES', provinceIds: ceded }]
            : [{ type: 'WAR_REPARATIONS', immediateTribute: 0 }],
          true,
        );
        continue;
      }
      const loserId = war.attackerLeaderId === p.id ? war.defenderLeaderId : war.attackerLeaderId;
      const chosen = p.secretObjectives.find((c) => c.id === p.selectedObjectiveId);
      if (
        score >= 85 &&
        p.nationId === 'aurelia' &&
        chosen?.kind === 'PAX' &&
        g.players.filter((q) => q.subjectOfId === p.id).length < 2 &&
        subjugationEligible(g, p.id, loserId)
      ) {
        offerPeace(g, p.id, war.id, [{ type: goldRules(g) ? 'SUBJUGATE_VASSAL' : 'SUBJUGATE' }]);
        continue;
      }
      const otherIds = war.attackerLeaderId === p.id ? war.defenderIds : war.attackerIds;
      const occupied = g.provinces.filter(
        (q) => q.ownerId && otherIds.includes(q.ownerId) && q.occupierId === p.id,
      );
      if (occupied.length && score >= 20) {
        const provinceIds: string[] = [];
        let cost = 0;
        for (const q of occupied) {
          const next = goldRules(g) ? 20 : 12 + q.baseTax;
          if (cost + next <= score) {
            provinceIds.push(q.id);
            cost += next;
          }
        }
        if (provinceIds.length) {
          offerPeace(g, p.id, war.id, [{ type: 'CEDE_PROVINCES', provinceIds }]);
          continue;
        }
      }
      if (p.warExhaustion >= 35 || g.turn - war.startedTurn >= 7) offerPeace(g, p.id, war.id, []);
    } catch {
      continue;
    }
  }
}
export function planBot(
  g: GameState,
  p: Player,
  submitOrder: (g: GameState, id: string, order: PlayerOrder) => void,
) {
  if (!g.provinces.some((q) => q.ownerId === p.id)) return;
  for (const offer of [...g.offers.filter((o) => o.to === p.id)])
    try {
      if (offer.kind === 'peace') {
        const war = g.wars.find((w) => w.id === offer.warId);
        if (
          war &&
          (goldRules(g) ||
            p.warExhaustion >= 25 ||
            (offer.terms?.length === 0 && g.turn - war.startedTurn >= 4))
        )
          answerOffer(g, p.id, offer.id, true);
      } else answerOffer(g, p.id, offer.id, true);
    } catch {
      continue;
    }
  for (const target of g.players.filter(
    (q) => q.id !== p.id && botThreat(g, p, q) && !p.subjectOfId,
  )) {
    try {
      let c = g.coalitions.find((c) => c.targetId === target.id);
      if (!c?.memberIds.includes(p.id)) joinCoalition(g, p.id, target.id);
      c = g.coalitions.find((c) => c.targetId === target.id);
      if (c && !c.warId && c.memberIds.length >= 2) coalitionWar(g, p.id, target.id);
    } catch {}
  }
  p.ready = false;
  const primary =
    p.nationId === 'vespera'
      ? 'NAV'
      : p.nationId === 'turan'
        ? 'CAV'
        : p.nationId === 'kaldor'
          ? 'ART'
          : 'INF';
  const branchOrder = [primary, ...['INF', 'CAV', 'ART', 'NAV'].filter((b) => b !== primary)];
  for (const branch of branchOrder) {
    const choice = p.botArchetype === 'Merchant' ? 'B' : 'A';
    for (const id of [
      `${branch}_T1`,
      `${branch}_T2${choice}`,
      `${branch}_T3`,
    ] as import('../shared/types').SkillId[])
      try {
        unlockSkill(g, p.id, id);
      } catch {}
  }
  for (const c of g.commanders.filter((c) => c.ownerId === p.id && !c.assignedBattalionId)) {
    const a = g.battalions
      .filter((a) => a.ownerId === p.id && a.isFleet === c.isAdmiral && !commanderFor(g, a))
      .sort((a, b) => unitCount(b) - unitCount(a))[0];
    if (a) c.assignedBattalionId = a.id;
  }
  botPeace(g, p);
  const estimatedNet = realmEconomy(g, p.id).net;
  const tryPlan = (o: PlayerOrder) => tryOrder(g, p, o, estimatedNet, submitOrder);
  // Stabilize threatened borders before committing an offensive order.
  const capital = g.provinces.find(
    (q) => q.id === p.originalCapitalId && q.ownerId === p.id && !q.occupierId,
  );
  const landForces = g.battalions
    .filter((a) => a.ownerId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded)
    .sort((a, b) => unitCount(b) - unitCount(a));
  for (const a of landForces)
    if (!canLeaveDefendedProvince(g, a)) {
      a.pathQueue = [];
      g.orders[p.id] = g.orders[p.id].filter(
        (o) =>
          !(
            'battalionId' in o &&
            o.battalionId === a.id &&
            ['MOVE_BATTALION', 'AUTO_TRANSPORT'].includes(o.type)
          ),
      );
    }
  if (capital) {
    const threat = computeProvinceThreat(g, capital.id, p.id);
    let guards = landForces
      .filter((a) => a.provinceId === capital.id)
      .reduce((n, a) => n + unitCount(a), 0);
    if (threat > guards) {
      const guard = landForces.find((a) => a.provinceId === capital.id);
      tryPlan({
        type: 'RECRUIT_BATTALION',
        provinceId: capital.id,
        infantry: 2,
        ...(guard ? { battalionId: guard.id } : {}),
      });
      for (const a of landForces.filter(
        (a) => a.provinceId !== capital.id && canLeaveDefendedProvince(g, a),
      )) {
        const path = unitPath(g, a, capital.id);
        if (
          path?.length &&
          path.length <= 3 &&
          tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, path })
        ) {
          guards += unitCount(a);
          if (guards >= threat * 1.1) break;
        }
      }
    }
  }
  // Merge colocated friendly forces and rally small detachments around a principal army.
  for (const a of [...landForces])
    if (
      g.battalions.includes(a) &&
      !outbound(g, a) &&
      !provinceOf(g, a.provinceId).siege &&
      g.battalions
        .filter(
          (b) =>
            b.ownerId === p.id &&
            !b.isFleet &&
            b.provinceId === a.provinceId &&
            !b.embarkedOnId &&
            !b.stranded,
        )
        .reduce((n, b) => n + unitCount(b), 0) <= 18
    )
      try {
        instantArmyAction(g, p.id, { type: 'MERGE_ALL', battalionId: a.id });
      } catch {}
  const principal = g.battalions
    .filter((a) => a.ownerId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded)
    .sort((a, b) => unitCount(b) - unitCount(a))[0];
  if (principal && unitCount(principal) >= 10 && !commanderFor(g, principal) && p.gold > 120)
    try {
      const leader = recruitCommander(g, p.id, false, 'SIEGE_MASTER');
      leader.assignedBattalionId = principal.id;
    } catch {}
  const focus = priorityProvince(g, p);
  p.botTargetProvinceId = focus ?? undefined;
  for (const a of [
    ...g.battalions.filter(
      (a) => a.ownerId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded,
    ),
  ]) {
    if (a.pathQueue.length || outbound(g, a)) continue;
    const from = provinceOf(g, a.provinceId);
    if (!canLeaveDefendedProvince(g, a)) {
      if (a.training < 1.3) tryPlan({ type: 'TRAIN_BATTALION', battalionId: a.id });
      continue;
    }
    if (principal && a.id !== principal.id && unitCount(a) < 10 && !from.siege) {
      const path = unitPath(g, a, principal.provinceId);
      if (
        path?.length &&
        path.length <= 3 &&
        tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, path })
      )
        continue;
    }
    if (
      principal &&
      a.id === principal.id &&
      unitCount(a) < 10 &&
      from.ownerId === p.id &&
      !from.siege
    ) {
      tryPlan({ type: 'TRAIN_BATTALION', battalionId: a.id });
      continue;
    }

    if (isDisorganized(a)) {
      if (!friendlyRest(g, a.ownerId, from) && !from.siege) {
        const retreat = g.provinces
          .filter((q) => friendlyRest(g, a.ownerId, q))
          .map((q) => unitPath(g, a, q.id))
          .filter((path): path is string[] => !!path && path.length > 0)
          .sort((a, b) => a.length - b.length)[0];
        if (retreat) tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, path: retreat });
      }
      continue;
    }
    if (from.siege?.attackerOwnerId === p.id) {
      if (a.training < 1.3) tryPlan({ type: 'TRAIN_BATTALION', battalionId: a.id });
      continue;
    }
    const neighbors = from.neighbors
      .map((id) => provinceOf(g, id))
      .filter((q) => q.kind === 'LAND' && controller(q) !== p.id && (!focus || q.id === focus))
      .sort(
        (q, r) =>
          Number(!!controller(r) && atWar(g, p.id, controller(r)!)) -
            Number(!!controller(q) && atWar(g, p.id, controller(q)!)) ||
          g.battalions
            .filter((a) => a.provinceId === q.id && !a.isFleet)
            .reduce((n, a) => n + unitCount(a), 0) -
            g.battalions
              .filter((a) => a.provinceId === r.id && !a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0),
      );
    let moved = false;
    for (const q of neighbors) {
      const target = controller(q),
        enemies = g.battalions.filter(
          (b) => b.provinceId === q.id && !b.isFleet && !b.embarkedOnId,
        );
      const estimate = combatPowers(g, [a], enemies, q);
      if (
        unitCount(a) < Math.max(2, Math.max(0, q.fortLevel - a.artillery) * 3) ||
        (enemies.length > 0 && estimate.ratio < (p.botArchetype === 'Militarist' ? 1.04 : 1.2))
      )
        continue;
      if (target && target !== p.id && !atWar(g, p.id, target)) {
        if (
          p.subjectOfId ||
          g.wars.some((w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(p.id))
        )
          continue;
        if (
          p.botArchetype !== 'Militarist' &&
          !['turan', 'ferro_norte', 'sol_invicto'].includes(p.nationId) &&
          g.turn % 4 !== 0
        )
          continue;
        try {
          declareWar(
            g,
            p.id,
            target,
            p.faith !== playerOf(g, target).faith && p.faith === 'SOLAR' ? 'HOLY_WAR' : 'CONQUEST',
          );
        } catch {
          continue;
        }
      }
      if (tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, targetProvinceId: q.id })) {
        moved = true;
        break;
      }
    }
    if (!moved && unitCount(a) >= 5) {
      const candidates = g.provinces
        .filter(
          (q) =>
            q.kind === 'LAND' &&
            (!focus || q.id === focus) &&
            controller(q) !== p.id &&
            (!controller(q) || atWar(g, p.id, controller(q)!)),
        )
        .map((q) => ({ q, path: unitPath(g, a, q.id) }))
        .filter((v) => v.path && v.path.length > 0)
        .sort(
          (a, b) =>
            Number(!!controller(b.q) && atWar(g, p.id, controller(b.q)!)) -
              Number(!!controller(a.q) && atWar(g, p.id, controller(a.q)!)) ||
            a.path!.length - b.path!.length,
        );
      const next = candidates.find(
        ({ q }) =>
          combatPowers(
            g,
            [a],
            g.battalions.filter((b) => b.provinceId === q.id && !b.isFleet && !b.embarkedOnId),
            q,
          ).ratio >= (p.botArchetype === 'Militarist' ? 1.04 : 1.2),
      );
      if (next) moved = tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, path: next.path! });
    }
    if (!moved && from.isCoastal) {
      const targets = g.provinces
        .filter(
          (q) =>
            q.kind === 'LAND' &&
            q.isCoastal &&
            (!focus || q.id === focus) &&
            !controller(q) &&
            crossingOptions(g, a, q, g.orders[p.id]).length,
        )
        .sort(
          (q, r) =>
            g.battalions
              .filter((b) => b.provinceId === q.id && !b.isFleet)
              .reduce((n, b) => n + unitCount(b), 0) -
            g.battalions
              .filter((b) => b.provinceId === r.id && !b.isFleet)
              .reduce((n, b) => n + unitCount(b), 0),
        );
      if (targets[0] && estimatedNet > 0)
        moved = tryPlan({
          type: 'AUTO_TRANSPORT',
          battalionId: a.id,
          targetProvinceId: targets[0].id,
        });
    }
    if (!moved && a.training < 1.4) tryPlan({ type: 'TRAIN_BATTALION', battalionId: a.id });
  }
  for (const f of g.battalions.filter((a) => a.ownerId === p.id && a.isFleet && !a.stranded)) {
    if (!f.embarkedArmyId && !f.pathQueue.length) {
      const target = g.provinces.find(
        (q) => q.siege?.attackerOwnerId === p.id && !bombardmentBlock(g, f, q),
      );
      if (
        target &&
        p.gold > 20 &&
        tryPlan({ type: 'BOMBARD_COAST', battalionId: f.id, targetProvinceId: target.id })
      )
        continue;
      if (f.warships > 0 && f.transports > 0) {
        const nodes = seaTradeNodes(g),
          here = nodes.find((n) => n.seaId === f.provinceId);
        if (here?.ownerId === p.id) continue;
        const trade = nodes
          .filter(
            (n) =>
              !n.contested &&
              (!n.ownerId || n.ownerId === p.id) &&
              n.contenders.every(
                (c) => c.ownerId === p.id || c.power < f.warships * 2 + f.transports,
              ),
          )
          .map((n) => ({ node: n, path: unitPath(g, f, n.seaId) }))
          .filter((x) => x.path && x.path.length)
          .sort(
            (a, b) => b.node.value / (b.path!.length + 1) - a.node.value / (a.path!.length + 1),
          )[0];
        if (trade && tryPlan({ type: 'MOVE_BATTALION', battalionId: f.id, path: trade.path! }))
          continue;
      }
    }
    if (f.embarkedArmyId) {
      const cargo = g.battalions.find((a) => a.id === f.embarkedArmyId);
      if (!cargo) continue;
      const targets = provinceOf(g, f.provinceId)
        .neighbors.map((id) => provinceOf(g, id))
        .filter(
          (q) =>
            q.kind === 'LAND' &&
            q.isCoastal &&
            controller(q) !== p.id &&
            canTransit(g, p.id, q) &&
            g.battalions
              .filter((a) => a.provinceId === q.id && !a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0) *
              1.4 <
              unitCount(cargo),
        );
      if (targets[0]) {
        tryPlan({
          type: 'EMBARK_BATTALION',
          battalionId: cargo.id,
          disembarkProvinceId: targets[0].id,
        });
        continue;
      }
      if (!f.pathQueue.length) {
        const coasts = g.provinces.filter(
          (q) =>
            q.kind === 'LAND' && q.isCoastal && controller(q) !== p.id && canTransit(g, p.id, q),
        );
        const routes = coasts
          .flatMap((q) =>
            q.neighbors
              .map((id) => provinceOf(g, id))
              .filter((s) => s.kind === 'SEA_ZONE')
              .map((s) => unitPath(g, f, s.id)),
          )
          .filter((r): r is string[] => !!r && r.length > 0)
          .sort((a, b) => a.length - b.length);
        if (routes[0]) tryPlan({ type: 'MOVE_BATTALION', battalionId: f.id, path: routes[0] });
      }
    } else if (!f.pathQueue.length) {
      const pHere = provinceOf(g, f.provinceId);
      const load = g.battalions.find(
        (a) =>
          a.ownerId === p.id &&
          !a.isFleet &&
          !a.embarkedOnId &&
          !a.pathQueue.length &&
          !a.stranded &&
          canLeaveDefendedProvince(g, a) &&
          unitCount(a) <= f.transports * 4 &&
          (a.provinceId === f.provinceId || pHere.neighbors.includes(a.provinceId)) &&
          provinceOf(g, a.provinceId).portLevel > 0,
      );
      if (
        load &&
        !g.orders[p.id].some(
          (o) => 'battalionId' in o && o.battalionId === load.id && o.type === 'MOVE_BATTALION',
        )
      )
        tryPlan({ type: 'EMBARK_BATTALION', battalionId: load.id, fleetId: f.id });
    }
  }
  for (const q of g.provinces.filter((q) => q.kind === 'LAND' && controller(q) === p.id)) {
    const guard = g.battalions
      .filter(
        (a) =>
          a.ownerId === p.id &&
          a.provinceId === q.id &&
          !a.isFleet &&
          !a.embarkedOnId &&
          !a.stranded,
      )
      .sort((a, b) => unitCount(b) - unitCount(a))[0];
    const choices: PlayerOrder[] = [];
    const threat = computeProvinceThreat(g, q.id, p.id);
    if (threat > 0 && (!guard || unitCount(guard) < threat))
      choices.push({
        type: 'RECRUIT_BATTALION',
        provinceId: q.id,
        infantry: 2,
        ...(guard ? { battalionId: guard.id } : {}),
      });
    if (q.barracksLevel === 0 && (p.manpower < 12 || !guard || unitCount(guard) < 10))
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'BARRACKS' });
    if (estimatedNet < 15) {
      if (q.marketLevel < 2) choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      else if (q.isCoastal && q.portLevel < 2)
        choices.push({ type: 'BUILD_PORT', provinceId: q.id });
    }

    if (
      q.portLevel > 0 &&
      q.ownerId === p.id &&
      !q.occupierId &&
      estimatedNet > 2 &&
      p.gold > 35 &&
      !g.battalions.some(
        (a) => a.ownerId === p.id && a.isFleet && a.warships > 0 && a.transports > 0,
      )
    ) {
      const fleet = g.battalions.find(
        (a) => a.ownerId === p.id && a.isFleet && a.provinceId === q.id && !a.embarkedArmyId,
      );
      choices.push({
        type: 'RECRUIT_BATTALION',
        provinceId: q.id,
        isFleet: true,
        warships: fleet?.warships ? 0 : 1,
        transports: fleet?.transports ? 0 : 1,
        ...(fleet ? { battalionId: fleet.id } : {}),
      });
    }
    if (q.templeLevel === 0 && (q.unrest > 45 || q.pacification < 65))
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'TEMPLE' });
    if (q.barracksLevel === 0 && p.manpower < 12)
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'BARRACKS' });
    if (q.foundryLevel === 0 && p.nationId === 'kaldor')
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'FOUNDRY' });
    if (q.unrest > 55 || q.pacification < 65) choices.push({ type: 'PACIFY', provinceId: q.id });
    if (q.ownerId === p.id && !q.occupierId) {
      if (p.botArchetype === 'Merchant' && q.marketLevel < 2)
        choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      if (p.botArchetype === 'Theocrat' && q.religion !== p.faith)
        choices.push({ type: 'CONVERT', targetProvinceId: q.id });
      if (!guard || unitCount(guard) < Math.min(18, supplyLimit(q) - 1))
        choices.push({
          type: 'RECRUIT_BATTALION',
          provinceId: q.id,
          infantry: p.nationId === 'turan' && (q.barracksLevel || q.foundryLevel) ? 0 : 2,
          cavalry:
            p.nationId === 'turan' && (q.barracksLevel || q.foundryLevel)
              ? Math.min(3, q.barracksLevel >= 2 || q.foundryLevel ? 7 : 4)
              : 0,
          artillery:
            (q.barracksLevel || q.foundryLevel) &&
            p.nationId !== 'turan' &&
            (p.nationId === 'kaldor' || (guard && guard.artillery < 1))
              ? 1
              : 0,
          ...(guard ? { battalionId: guard.id, isMercenary: guard.isMercenary } : {}),
        });
      if (q.marketLevel < 2) choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      if (q.fortLevel < 1 && p.botArchetype === 'Diplomat')
        choices.push({ type: 'BUILD_FORT', provinceId: q.id });
    }
    for (const o of choices) if (tryPlan(o)) break;
  }
  p.ready = true;
}
