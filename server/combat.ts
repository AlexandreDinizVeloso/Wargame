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
  isBlockaded,
  nationOf,
  supplyLimit,
  UNIT_KEYS,
  unitCount,
  zeroComposition,
} from '../shared/rules';
import {
  coalitionMorale,
  destroyBattalion,
  log,
  nextId,
  playerOf,
  provinceOf,
  removeUnits,
  roll,
  syncCargo,
} from './state';
export function compositionPower(g: GameState, a: Battalion, p: Province, defending = false) {
  const actor = g.players.find((p) => p.id === a.ownerId),
    nation = actor ? nationOf(actor.nationId) : null;
  const morale = Math.min(
    100,
    a.morale *
      coalitionMorale(g, a.ownerId) *
      (actor && actor.moraleBonusUntil >= g.turn ? 1.15 : 1),
  );
  if (a.isFleet)
    return (
      (a.warships * 3 + a.transports * 0.5) *
      a.training *
      (0.5 + (0.5 * morale) / 100) *
      (defending ? 1 : (nation?.modifiers.navalAttack ?? 1))
    );
  const cavalryModifier =
    p.terrain === 'plains' || p.terrain === 'coastal'
      ? 1.4
      : p.terrain === 'mountains' || p.terrain === 'forest'
        ? 0.8
        : 1;
  const infantryModifier =
    (actor?.faith === 'SOLAR' && !defending ? 1.15 : 1) * (nation?.modifiers.infantry ?? 1);
  const artilleryModifier =
    (actor?.faith === 'REFORMED' ? 1.2 : 1) * (nation?.modifiers.artillery ?? 1);
  const value =
    a.infantry * (defending ? 1.2 : 1) * infantryModifier +
    a.cavalry * (defending ? 1 : cavalryModifier) * (nation?.modifiers.cavalry ?? 1) +
    a.artillery * (defending ? 0.6 : 2.2) * artilleryModifier;
  const home = defending && actor?.faith === 'ANCESTRAL' && p.ownerId === a.ownerId ? 1.2 : 1;
  return (
    value *
    a.training *
    (0.5 + (0.5 * morale) / 100) *
    home *
    (defending && a.entrenched ? 1.15 : 1)
  );
}
export function combatPowers(
  g: GameState,
  attackers: Battalion[],
  defenders: Battalion[],
  p: Province,
) {
  const artillery = attackers.reduce((n, a) => n + a.artillery, 0),
    neutralizedFortLevels = Math.min(p.fortLevel, artillery);
  const blockadeModifier = isBlockaded(g, p) ? 0.8 : 1;
  const holy = attackers.some((a) => p.conversionInstigatorId === a.ownerId) ? 1.15 : 1;
  const attackPower = attackers.reduce((n, a) => n + compositionPower(g, a, p), 0) * holy;
  const defensePower =
    defenders.reduce((n, a) => n + compositionPower(g, a, p, true), 0) *
    (p.kind === 'SEA_ZONE' ? 1 : p.terrainDefenseBonus) *
    (1 + (p.fortLevel - neutralizedFortLevels) * 0.15) *
    blockadeModifier;
  return {
    attackPower,
    defensePower,
    ratio: attackPower / Math.max(1, defensePower),
    neutralizedFortLevels,
    blockadeModifier,
  };
}
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
) {
  const from = a.provinceId,
    target = safestRetreat(g, a),
    survivors = unitCount(a);
  if (ratio >= 2.5 || (a.morale === 0 && !target)) {
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
    survivors - Math.min(survivors - 1, Math.ceil((survivors - base) * (pursuit ? 1.25 : 1))),
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
function battleLosses(armies: Battalion[], rate: number) {
  const losses = zeroComposition();
  for (const a of armies) {
    const original = compositionOf(a),
      count = unitCount(a);
    const lost = removeUnits(a, Math.min(count - 1, Math.ceil(count * rate)), true);
    if (unitCount(a) === 0 && count) {
      const restore = UNIT_KEYS.find((k) => original[k] > 0)!;
      a[restore]++;
      lost[restore]--;
    }
    for (const k of UNIT_KEYS) losses[k] += lost[k];
  }
  return losses;
}
export function occupy(g: GameState, a: Battalion, p: Province) {
  const previous = controller(p);
  if (
    a.isFleet ||
    p.kind === 'SEA_ZONE' ||
    previous === a.ownerId ||
    (previous && !atWar(g, a.ownerId, previous))
  )
    return;
  if (!p.ownerId) {
    p.ownerId = a.ownerId;
    p.occupierId = null;
  } else p.occupierId = p.ownerId === a.ownerId ? null : a.ownerId;
  const actor = playerOf(g, a.ownerId);
  p.pacification = p.religion === actor.faith ? 20 : 0;
  p.unrest = clamp(p.unrest + 30);
  p.conversionInstigatorId = null;
  p.conversion = 0;
  p.conversionReligion = null;
  log(g, `${actor.nation} ${p.occupierId ? 'ocupou' : 'incorporou'} ${p.name}.`, 'battle');
}
export function resolveBattle(
  g: GameState,
  a: Battalion,
  target: Province,
  report: TurnResolutionReport,
) {
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
    (a.isFleet || unitCount(a) >= Math.max(0, target.fortLevel - a.artillery) * 3)
  ) {
    occupy(g, a, target);
    return true;
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
  const neutralized = powers.neutralizedFortLevels;
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
    terrainDefenseBonus: target.terrainDefenseBonus,
    fortLevel: target.fortLevel,
    infantryModifier: playerOf(g, a.ownerId).faith === 'SOLAR' ? 1.15 : 1,
    cavalryModifier:
      target.terrain === 'plains' || target.terrain === 'coastal'
        ? 1.4
        : target.terrain === 'forest' || target.terrain === 'mountains'
          ? 0.8
          : 1,
    artilleryModifier: playerOf(g, a.ownerId).faith === 'REFORMED' ? 1.2 : 1,
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
  if (!a.isFleet && beforeA < (target.fortLevel - neutralized) * 3) {
    battle.outcome = 'siege_blocked';
    report.battles.push(battle);
    return false;
  }
  const attackWins = powers.attackPower > powers.defensePower;
  const ratio = attackWins
    ? powers.attackPower / Math.max(1, powers.defensePower)
    : powers.defensePower / Math.max(1, powers.attackPower);
  const winRate = Math.min(0.25, 0.12 / Math.sqrt(Math.max(1, ratio))),
    loseRate = Math.min(0.65, 0.25 + 0.12 * ratio);
  const aArtillery = a.artillery,
    enArtillery = enemies.reduce((n, b) => n + b.artillery, 0);
  const aLoss = battleLosses([a], attackWins ? winRate : loseRate),
    dLoss = battleLosses(enemies, attackWins ? loseRate : winRate);
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
  battle.attackerCompositionLosses = aLoss;
  battle.defenderCompositionLosses = dLoss;
  battle.attackerCasualties = unitCount(aLoss);
  battle.defenderCasualties = unitCount(dLoss);
  battle.attackerMoraleAfter = a.morale;
  battle.defenderMoraleAfter = average(enemies, 'morale');
  const winners = attackWins ? [a] : enemies,
    losers = attackWins ? enemies : [a];
  if (attackWins) {
    occupy(g, a, target);
    battle.outcome = 'attacker_victory';
    battle.winnerId = a.ownerId;
  }
  const pursuit = winners.some((b) => b.cavalry > 0);
  for (const loser of losers) {
    const count = unitCount(loser);
    const wipedComposition = compositionOf(loser);
    const result = retreatArmy(g, loser, ratio, report, pursuit);
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
  report.battles.push(battle);
  log(
    g,
    `${playerOf(g, a.ownerId).nation}: batalha em ${target.name}; baixas ${battle.attackerCasualties}/${battle.defenderCasualties}.`,
    'battle',
  );
  return attackWins;
}
