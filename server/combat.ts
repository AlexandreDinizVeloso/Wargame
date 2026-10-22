import { combatPowers } from '../shared/combat';
export { compositionPower, combatPowers } from '../shared/combat';
import { markDisorganized } from '../shared/morale';
import { commanderFor, hasSkill } from '../shared/military';
import { beginSiege } from './siege';
import type {
  Battalion,
  BattleReport,
  GameState,
  Province,
  TurnResolutionReport,
} from '../shared/types';
import {
  atWar,
  canUnitVisit,
  clamp,
  compositionOf,
  controller,
  getRelation,
  supplyLimit,
  UNIT_KEYS,
  unitCount,
  zeroComposition,
} from '../shared/rules';
import {
  assert,
  destroyBattalion,
  log,
  nextId,
  playerOf,
  provinceOf,
  removeUnits,
  roll,
  syncCargo,
} from './state';
export function safestRetreat(g: GameState, a: Battalion, fromId = a.provinceId) {
  const from = provinceOf(g, fromId);
  return from.neighbors
    .map((id) => provinceOf(g, id))
    .filter((p) => {
      if (a.isFleet) {
        if (
          p.kind === 'LAND' &&
          (p.portLevel < 1 ||
            (!canUnitVisit(g, a, p) &&
              !(controller(p) && getRelation(g, a.ownerId, controller(p)!)?.allied)))
        )
          return false;
        return !g.battalions.some(
          (b) => b.provinceId === p.id && b.isFleet && atWar(g, a.ownerId, b.ownerId),
        );
      }
      if (p.kind !== 'LAND') return false;
      const c = controller(p);
      return (
        (a.ownerId === 'NEUTRAL'
          ? !c
          : c === a.ownerId || !!(c && getRelation(g, a.ownerId, c)?.allied)) &&
        !g.battalions.some((b) => b.provinceId === p.id && atWar(g, a.ownerId, b.ownerId))
      );
    })
    .sort(
      (p, q) =>
        q.terrainDefenseBonus * 10 +
          q.fortLevel * 2 +
          (supplyLimit(q) -
            g.battalions
              .filter((a) => a.provinceId === q.id)
              .reduce((n, a) => n + unitCount(a), 0)) *
            0.2 -
          (p.terrainDefenseBonus * 10 +
            p.fortLevel * 2 +
            (supplyLimit(p) -
              g.battalions
                .filter((a) => a.provinceId === p.id)
                .reduce((n, a) => n + unitCount(a), 0)) *
              0.2) || p.id.localeCompare(q.id),
    )[0];
}
export function retreatArmy(
  g: GameState,
  a: Battalion,
  ratio: number,
  report: TurnResolutionReport,
  pursuit = false,
  pursuitBonus = 1,
) {
  const from = a.provinceId,
    target = safestRetreat(g, a),
    survivors = unitCount(a);
  const c = commanderFor(g, a),
    protectedDefeat = !!(c?.trait === 'IRON_WALL' && !c.lastStandUsed);
  if (protectedDefeat) c!.lastStandUsed = true;
  if (!protectedDefeat && (ratio >= 2.5 || (a.morale === 0 && !target))) {
    report.stackwipes.push({
      armyId: a.id,
      ownerId: a.ownerId,
      provinceId: from,
      troops: survivors,
      reason: ratio >= 2.5 ? 'overwhelming_force' : 'zero_morale_no_escape',
    });
    destroyBattalion(g, a);
    return { wiped: true, destination: null };
  }
  const base = Math.max(1, Math.round(survivors * (0.55 + 0.15 * roll(g, a.id))));
  const regrouped = Math.max(
    1,
    survivors -
      Math.min(survivors - 1, Math.ceil((survivors - base) * (pursuit ? 1.25 * pursuitBonus : 1))),
  );
  removeUnits(a, survivors - regrouped);
  a.morale = 15;
  a.entrenched = false;
  a.pathQueue = [];
  a.stranded = !target;
  if (target) {
    a.provinceId = target.id;
    syncCargo(g, a);
  }
  report.retreats.push({
    armyId: a.id,
    ownerId: a.ownerId,
    fromProvinceId: from,
    toProvinceId: target?.id ?? null,
    survivors,
    regrouped,
    dispersed: survivors - regrouped,
    morale: 15,
    stranded: !target,
    reason: 'battle',
  });
  return { wiped: false, destination: target?.id ?? null };
}
const average = (armies: Battalion[], key: 'morale' | 'training') => {
  const n = armies.reduce((n, a) => n + unitCount(a), 0);
  return n ? armies.reduce((n, a) => n + a[key] * unitCount(a), 0) / n : 0;
};
function battleLosses(g: GameState, armies: Battalion[], rate: number) {
  const losses = zeroComposition();
  for (const a of armies) {
    const original = compositionOf(a),
      count = unitCount(a);
    const lost = removeUnits(
      a,
      Math.min(count - 1, Math.ceil(count * rate)),
      !hasSkill(g, a.ownerId, 'ART_T2B'),
    );
    if (hasSkill(g, a.ownerId, 'INF_T3')) {
      const saved = Math.floor(lost.infantry * 0.25);
      a.infantry += saved;
      lost.infantry -= saved;
    }
    if (unitCount(a) === 0 && count) {
      const restore = UNIT_KEYS.find((k) => original[k] > 0)!;
      a[restore]++;
      lost[restore]--;
    }
    for (const k of UNIT_KEYS) losses[k] += lost[k];
  }
  return losses;
}
export const occupy = beginSiege;
export function resolveBattle(
  g: GameState,
  a: Battalion,
  target: Province,
  report: TurnResolutionReport,
) {
  assert(a.isFleet || target.kind === 'LAND', 'Batalhão terrestre não combate em zona marítima.');
  const fortOwner = g.players.find((q) => q.id === target.ownerId);
  if (
    !a.isFleet &&
    target.fortLevel > 0 &&
    fortOwner?.nationId === 'kaldor' &&
    commanderFor(g, a)?.trait !== 'QUARTERMASTER' &&
    controller(target) === fortOwner.id &&
    fortOwner.id !== a.ownerId &&
    atWar(g, a.ownerId, fortOwner.id) &&
    !report.attritionLosses.some((r) => r.armyId === a.id && r.provinceId === target.id)
  ) {
    const before = unitCount(a);
    removeUnits(a, Math.ceil(before * 0.15));
    report.attritionLosses.push({
      armyId: a.id,
      ownerId: a.ownerId,
      provinceId: target.id,
      troopsBefore: before,
      supplyLimit: supplyLimit(target),
      losses: before - unitCount(a),
    });
    if (!unitCount(a)) {
      destroyBattalion(g, a);
      return false;
    }
  }
  const enemies = g.battalions.filter(
    (b) =>
      b.id !== a.id &&
      b.provinceId === target.id &&
      !b.embarkedOnId &&
      !b.stranded &&
      b.isFleet === a.isFleet &&
      (b.ownerId === 'NEUTRAL' || atWar(g, a.ownerId, b.ownerId)),
  );
  const defendingOwner = controller(target);
  if (
    enemies.length === 0 &&
    defendingOwner &&
    (defendingOwner === a.ownerId || !atWar(g, a.ownerId, defendingOwner))
  )
    return true;
  if (enemies.length === 0) {
    occupy(g, a, target);
    return true;
  }
  const leaders = [a, ...enemies].map((b) => commanderFor(g, b)).filter((c) => !!c);
  const naval = a.isFleet;
  if (!naval) {
    if (a.artillery > 0 && hasSkill(g, a.ownerId, 'ART_T3'))
      for (const b of enemies) b.morale = clamp(b.morale - 12);
    if (enemies.some((b) => b.artillery > 0 && hasSkill(g, b.ownerId, 'ART_T3')))
      a.morale = clamp(a.morale - 12);
  }
  const powers = combatPowers(g, [a], enemies, target),
    defenderId = enemies[0]?.ownerId === 'NEUTRAL' ? null : (enemies[0]?.ownerId ?? defendingOwner);
  const fighters = [a, ...enemies];
  const passengers = fighters.flatMap((f) =>
    f.embarkedArmyId ? g.battalions.filter((b) => b.id === f.embarkedArmyId) : [],
  );
  const participants = [...fighters, ...passengers].map((b) => ({
    id: b.id,
    ownerId: b.ownerId,
    count: unitCount(b),
  }));
  const beforeA = unitCount(a),
    beforeD = enemies.reduce((n, b) => n + unitCount(b), 0),
    beforeMoraleA = a.morale,
    beforeMoraleD = average(enemies, 'morale');
  const battle: BattleReport = {
    id: nextId(g, 'battle'),
    turn: g.turn,
    provinceId: target.id,
    attackerId: a.ownerId,
    defenderId,
    attackerBattalionIds: [a.id],
    defenderBattalionIds: enemies.map((b) => b.id),
    winnerId: defenderId,
    attackerTroops: beforeA,
    defenderTroops: beforeD,
    ...powers,
    attackerTraining: a.training,
    defenderTraining: average(enemies, 'training'),
    terrainDefenseBonus: a.isFleet ? 1 : target.terrainDefenseBonus,
    fortLevel: a.isFleet ? 0 : target.fortLevel,
    infantryModifier: !a.isFleet && playerOf(g, a.ownerId).faith === 'SOLAR' ? 1.15 : 1,
    cavalryModifier: a.isFleet
      ? 1
      : target.terrain === 'plains' || target.terrain === 'coastal'
        ? 1.4
        : target.terrain === 'forest' || target.terrain === 'mountains'
          ? 0.8
          : 1,
    artilleryModifier: !a.isFleet && playerOf(g, a.ownerId).faith === 'REFORMED' ? 1.2 : 1,
    attackerCasualties: 0,
    defenderCasualties: 0,
    attackerCompositionLosses: zeroComposition(),
    defenderCompositionLosses: zeroComposition(),
    casualtiesByRealm: {},
    attackerMoraleBefore: beforeMoraleA,
    attackerMoraleAfter: beforeMoraleA,
    defenderMoraleBefore: beforeMoraleD,
    defenderMoraleAfter: beforeMoraleD,
    retreatDestinationId: null,
    stackwipe: false,
    outcome: 'defender_victory',
    naval: a.isFleet,
  };
  const attackWins = powers.attackPower > powers.defensePower;
  const ratio = attackWins
    ? powers.attackPower / Math.max(1, powers.defensePower)
    : powers.defensePower / Math.max(1, powers.attackPower);
  const winRate = Math.min(0.4125, (0.12 * 1.65) / Math.sqrt(Math.max(1, ratio))),
    loseRate = Math.min(0.9, (0.25 + 0.12 * ratio) * 1.65);
  const aArtillery = a.artillery,
    enArtillery = enemies.reduce((n, b) => n + b.artillery, 0);
  const aLoss = battleLosses(g, [a], attackWins ? winRate : loseRate),
    dLoss = battleLosses(g, enemies, attackWins ? loseRate : winRate);
  a.morale = clamp(
    Math.round(
      a.morale -
        (attackWins
          ? 8 + (unitCount(aLoss) / Math.max(1, beforeA)) * 20
          : 45 * Math.min(1.5, ratio)) *
          (1 + 0.3 * enArtillery),
    ),
  );
  for (const d of enemies)
    d.morale = clamp(
      Math.round(
        d.morale -
          (attackWins
            ? 45 * Math.min(1.5, ratio)
            : 8 + (unitCount(dLoss) / Math.max(1, beforeD)) * 20) *
            (1 + 0.3 * aArtillery),
      ),
    );
  if (!naval) {
    if (
      a.cavalry > 0 &&
      hasSkill(g, a.ownerId, 'CAV_T2A') &&
      ['plains', 'coastal'].includes(target.terrain) &&
      !enemies.some((d) => d.infantry > 0 && hasSkill(g, d.ownerId, 'INF_T2A'))
    )
      for (const d of enemies) d.morale = clamp(d.morale - 10);
    if (
      enemies.some((d) => d.cavalry > 0 && hasSkill(g, d.ownerId, 'CAV_T2A')) &&
      ['plains', 'coastal'].includes(target.terrain) &&
      !(a.infantry > 0 && hasSkill(g, a.ownerId, 'INF_T2A'))
    )
      a.morale = clamp(a.morale - 10);
  }
  battle.attackerCompositionLosses = aLoss;
  battle.defenderCompositionLosses = dLoss;
  battle.attackerCasualties = unitCount(aLoss);
  battle.defenderCasualties = unitCount(dLoss);
  for (const unit of [a, ...enemies]) markDisorganized(unit);
  battle.attackerMoraleAfter = a.morale;
  battle.defenderMoraleAfter = average(enemies, 'morale');
  const winners = attackWins ? [a] : enemies,
    losers = attackWins ? enemies : [a];
  if (attackWins) {
    occupy(g, a, target);
    battle.outcome = 'attacker_victory';
    battle.winnerId = a.ownerId;
  }
  const pursuit =
    ratio >= 2 || losers.some((l) => l.morale <= 25) || winners.some((b) => b.cavalry > 0);
  for (const loser of losers) {
    const count = unitCount(loser);
    const wipedComposition = compositionOf(loser);
    const result = retreatArmy(
      g,
      loser,
      ratio,
      report,
      pursuit,
      winners.some(
        (w) =>
          w.cavalry > 0 &&
          w.cavalry >= Math.ceil(unitCount(w) / 2) &&
          hasSkill(g, w.ownerId, 'CAV_T3'),
      )
        ? 1.35
        : 1,
    );
    battle.retreatDestinationId ??= result.destination;
    battle.stackwipe ||= result.wiped;
    if (result.wiped) {
      if (attackWins) battle.defenderCasualties += count;
      else battle.attackerCasualties += count;
      const compositionLosses = attackWins
        ? battle.defenderCompositionLosses
        : battle.attackerCompositionLosses;
      for (const key of UNIT_KEYS) compositionLosses[key] += wipedComposition[key];
    }
  }
  for (const ownerId of new Set(fighters.map((f) => f.ownerId))) {
    const p = g.players.find((p) => p.id === ownerId);
    if (p) p.militaryXP += 15;
  }
  for (const c of leaders) {
    c.xp += 20;
    c.stars = c.xp >= 100 ? 3 : c.xp >= 40 ? 2 : 1;
  }
  for (const f of fighters)
    if (
      !f.isFleet &&
      f.infantry > 0 &&
      hasSkill(g, f.ownerId, 'INF_T3') &&
      g.battalions.includes(f)
    )
      f.morale = clamp(f.morale + 10);
  const winnerFleet = (attackWins ? [a] : enemies).find(
    (f) => g.battalions.includes(f) && commanderFor(g, f)?.trait === 'SEA_WOLF',
  );
  const lostShips = attackWins
    ? battle.defenderCompositionLosses.warships
    : battle.attackerCompositionLosses.warships;
  if (
    naval &&
    winnerFleet &&
    lostShips > 0 &&
    roll(g, `capture:${battle.id}:${winnerFleet.id}`) < 0.35
  ) {
    winnerFleet.warships++;
    battle.capturedShips = 1;
    report.events.push(`${winnerFleet.name} capturou um navio de guerra.`);
  }
  const winner = g.players.find((p) => p.id === battle.winnerId);
  if (winner) winner.wonBattles++;
  for (const war of g.wars.filter((w) => w.active)) {
    const aSide = war.attackerIds.includes(a.ownerId)
      ? 1
      : war.defenderIds.includes(a.ownerId)
        ? -1
        : 0;
    const opposite =
      defenderId && (aSide === 1 ? war.defenderIds : war.attackerIds).includes(defenderId);
    if (aSide && opposite)
      war.battleScore = clamp(
        war.battleScore +
          (attackWins ? aSide : -aSide) *
            (5 + (battle.attackerCasualties + battle.defenderCasualties) * 0.5),
        -100,
        100,
      );
  }
  for (const fleet of [...g.battalions.filter((b) => b.isFleet && b.embarkedArmyId)]) {
    const cargo = g.battalions.find((c) => c.id === fleet.embarkedArmyId);
    if (!cargo) continue;
    const excess = unitCount(cargo) - fleet.transports * 4;
    if (excess > 0) {
      removeUnits(cargo, excess);
      report.events.push(`${excess} tropas perderam transporte no mar.`);
      if (unitCount(cargo) === 0) destroyBattalion(g, cargo);
    }
  }
  for (const tracked of participants) {
    const lost = tracked.count - unitCount(g.battalions.find((b) => b.id === tracked.id) ?? {});
    battle.casualtiesByRealm[tracked.ownerId] =
      (battle.casualtiesByRealm[tracked.ownerId] ?? 0) + lost;
  }
  for (const id of new Set(fighters.map((f) => f.ownerId))) {
    const p = g.players.find((p) => p.id === id);
    if (p?.nationId === 'ferro_norte') {
      const loot =
        Object.entries(battle.casualtiesByRealm)
          .filter(([enemy]) => enemy === 'NEUTRAL' || atWar(g, id, enemy))
          .reduce((n, [, loss]) => n + loss, 0) * 8;
      p.gold += loot;
    }
  }
  const zealot = g.players.find((p) => p.id === a.ownerId);
  if (
    zealot?.nationId === 'sol_invicto' &&
    defenderId &&
    zealot.faith !== g.players.find((p) => p.id === defenderId)?.faith
  ) {
    for (const p of g.provinces.filter(
      (p) => p.ownerId === defenderId && target.neighbors.includes(p.id),
    ))
      if (roll(g, `religious-uprising:${p.id}:${a.id}`) < 0.2) {
        p.unrest = 100;
        report.events.push(`Fervor sagrado provocou revolta em ${p.name}.`);
      }
  }
  battle.attackerMoraleAfter = g.battalions.includes(a) ? a.morale : 0;
  battle.defenderMoraleAfter = average(
    enemies.filter((d) => g.battalions.includes(d)),
    'morale',
  );
  report.battles.push(battle);
  log(
    g,
    `${playerOf(g, a.ownerId).nation}: batalha em ${target.name}; baixas ${battle.attackerCasualties}/${battle.defenderCasualties}.`,
    'battle',
  );
  return attackWins;
}
