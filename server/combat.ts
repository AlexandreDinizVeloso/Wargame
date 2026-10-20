import type {
  BattleReport,
  GameState,
  Province,
  StationedArmy,
  TurnResolutionReport,
} from '../shared/types';
import { clamp, supplyLimit } from '../shared/rules';
import {
  canAttack,
  canEnter,
  log,
  mergeArmy,
  nextId,
  playerOf,
  provinceOf,
  relation,
  removeTroops,
  roll,
  stationArmy,
  type ArmyStock,
} from './state';

export interface March extends StationedArmy {
  fromProvinceId: string;
}
export function combatPowers(
  g: GameState,
  army: ArmyStock & { ownerId: string | null },
  target: Province,
  defender: ArmyStock = target,
) {
  const holyWarBonus =
    target.ownerId !== army.ownerId && target.conversionInstigatorId === army.ownerId ? 1.15 : 1;
  const coalitionAttackBonus =
    !!target.ownerId && target.ownerId === g.hegemonyLeaderId && army.ownerId !== g.hegemonyLeaderId
      ? 1.1
      : 1;
  const coalitionDefenseBonus =
    !!target.ownerId && army.ownerId === g.hegemonyLeaderId && target.ownerId !== g.hegemonyLeaderId
      ? 1.1
      : 1;
  const attackPower =
    army.troops *
    army.training *
    (0.5 + (0.5 * army.morale) / 100) *
    holyWarBonus *
    coalitionAttackBonus;
  const defensePower =
    defender.troops *
    defender.training *
    target.terrainDefenseBonus *
    (1 + target.fortLevel * 0.15) *
    (0.5 + (0.5 * defender.morale) / 100) *
    coalitionDefenseBonus;
  return {
    attackPower,
    defensePower,
    ratio: attackPower / Math.max(1, defensePower),
    holyWarBonus,
    coalitionAttackBonus,
    coalitionDefenseBonus,
  };
}
export function safestRetreat(
  g: GameState,
  provinceId: string,
  ownerId: string | null,
): Province | undefined {
  const from = provinceOf(g, provinceId);
  const candidates = from.neighbors
    .map((id) => provinceOf(g, id))
    .filter(
      (p) =>
        p.ownerId === ownerId ||
        !!(ownerId && p.ownerId && relation(g, ownerId, p.ownerId)?.allied),
    );
  const safety = (p: Province) =>
    p.terrainDefenseBonus * 10 +
    p.fortLevel * 2 +
    p.troops * 0.15 +
    (supplyLimit(p) - p.troops) * 0.3 -
    p.neighbors.filter((id) => {
      const q = provinceOf(g, id);
      return q.ownerId !== ownerId && !candidates.some((c) => c.id === q.id);
    }).length *
      0.5;
  return candidates.sort((a, b) => safety(b) - safety(a) || a.id.localeCompare(b.id))[0];
}
export function retreatArmy(
  g: GameState,
  army: StationedArmy,
  winningRatio: number,
  report: TurnResolutionReport,
  moved: Set<string>,
) {
  if (army.troops <= 0) return { destination: null, wiped: false };
  const destination = safestRetreat(g, army.provinceId, army.ownerId);
  const wiped = winningRatio >= 2.5 || (army.morale === 0 && !destination);
  if (wiped) {
    report.stackwipes.push({
      armyId: army.id,
      ownerId: army.ownerId,
      provinceId: army.provinceId,
      troops: army.troops,
      reason: winningRatio >= 2.5 ? 'overwhelming_force' : 'zero_morale_no_escape',
    });
    return { destination: null, wiped: true };
  }
  const survivors = army.troops;
  const fraction = 0.55 + 0.15 * roll(g, `retreat:${army.id}:${army.provinceId}`);
  const lower = Math.ceil(survivors * 0.55),
    upper = Math.floor(survivors * 0.7);
  const regrouped = Math.max(
    1,
    lower <= upper
      ? clamp(Math.round(survivors * fraction), lower, upper)
      : Math.round(survivors * fraction),
  );
  const regroupedArmy = {
    ...army,
    troops: regrouped,
    mercenaries: Math.min(regrouped, Math.round((army.mercenaries * regrouped) / survivors)),
    morale: 15,
  };
  if (destination) {
    stationArmy(g, destination, army.ownerId, regroupedArmy);
    moved.add(destination.id);
  } else g.displacedArmies.push({ ...regroupedArmy, stranded: true });
  report.retreats.push({
    armyId: army.id,
    ownerId: army.ownerId,
    fromProvinceId: army.provinceId,
    toProvinceId: destination?.id ?? null,
    survivors,
    regrouped,
    dispersed: survivors - regrouped,
    morale: 15,
    stranded: !destination,
  });
  return { destination: destination?.id ?? null, wiped: false };
}
function applyLosses(stocks: ArmyStock[], losses: number) {
  const total = stocks.reduce((n, a) => n + a.troops, 0);
  let remaining = losses;
  const allocations = stocks.map((a) => Math.floor((losses * a.troops) / Math.max(1, total)));
  remaining -= allocations.reduce((n, x) => n + x, 0);
  for (let i = 0; remaining > 0; i = (i + 1) % stocks.length)
    if (allocations[i] < stocks[i].troops) {
      allocations[i]++;
      remaining--;
    }
  stocks.forEach((a, i) => removeTroops(a, allocations[i]));
}
export function resolveMarch(
  g: GameState,
  army: March,
  report: TurnResolutionReport,
  moved: Set<string>,
  fought: Set<string>,
) {
  const target = provinceOf(g, army.provinceId),
    actor = playerOf(g, army.ownerId!);
  moved.add(target.id);
  if (canEnter(g, actor.id, target.ownerId)) {
    stationArmy(g, target, actor.id, army);
    return;
  }
  if (!canAttack(g, actor.id, target.ownerId)) {
    const from = provinceOf(g, army.fromProvinceId);
    if (from.ownerId === actor.id) stationArmy(g, from, actor.id, army);
    else retreatArmy(g, army, 0, report, moved);
    return;
  }
  const supporters = g.stationedArmies.filter(
    (a) =>
      a.provinceId === target.id &&
      a.ownerId !== actor.id &&
      a.ownerId &&
      target.ownerId &&
      canAttack(g, actor.id, a.ownerId) &&
      relation(g, a.ownerId, target.ownerId)?.allied,
  );
  const stocks: ArmyStock[] = [target, ...supporters];
  const defense: ArmyStock = { troops: 0, mercenaries: 0, morale: 0, training: 1 };
  stocks.forEach((a) => mergeArmy(defense, a));
  const beforeAttack = { ...army },
    beforeDef = { ...defense },
    defenderId = target.ownerId;
  const powers = combatPowers(g, army, target, defense);
  const battle: BattleReport = {
    id: nextId(g, 'battle'),
    turn: g.turn,
    provinceId: target.id,
    attackerId: actor.id,
    defenderId,
    winnerId: defenderId,
    attackerTroops: army.troops,
    defenderTroops: defense.troops,
    ...powers,
    attackerTraining: army.training,
    defenderTraining: defense.training,
    terrain: target.terrain,
    terrainDefenseBonus: target.terrainDefenseBonus,
    fortLevel: target.fortLevel,
    fortDefenseMultiplier: 1 + target.fortLevel * 0.15,
    attackerCasualties: 0,
    defenderCasualties: 0,
    attackerMoraleBefore: army.morale,
    attackerMoraleAfter: army.morale,
    defenderMoraleBefore: defense.morale,
    defenderMoraleAfter: defense.morale,
    retreatDestinationId: null,
    stackwipe: false,
    outcome: 'defender_victory',
  };
  if (army.troops < target.fortLevel * 3) {
    battle.outcome = 'siege_blocked';
    report.battles.push(battle);
    const from = provinceOf(g, army.fromProvinceId);
    if (from.ownerId === actor.id) stationArmy(g, from, actor.id, army);
    else retreatArmy(g, army, 0, report, moved);
    log(
      g,
      `${actor.nation} interrompeu o cerco de ${target.name}: o forte exige ${target.fortLevel * 3} tropas.`,
      'battle',
    );
    return;
  }
  fought.add(actor.id);
  if (defenderId) fought.add(defenderId);
  for (const a of supporters) if (a.ownerId) fought.add(a.ownerId);
  if (defenderId) {
    const r = relation(g, actor.id, defenderId)!;
    r.atWar = true;
    r.trust = clamp(r.trust - 20, -100, 100);
    r.militaryAccess = [];
  }
  const attackWins = powers.attackPower > powers.defensePower;
  const winnerRatio = attackWins
    ? powers.attackPower / Math.max(1, powers.defensePower)
    : powers.defensePower / Math.max(1, powers.attackPower);
  const winnerRate = Math.min(0.25, 0.12 / Math.sqrt(Math.max(1, winnerRatio))),
    loserRate = Math.min(0.65, 0.25 + 0.12 * winnerRatio);
  const aLoss = Math.min(
    army.troops - 1,
    Math.ceil(army.troops * (attackWins ? winnerRate : loserRate)),
  );
  const dLoss = Math.max(
    0,
    Math.min(defense.troops - 1, Math.ceil(defense.troops * (attackWins ? loserRate : winnerRate))),
  );
  removeTroops(army, Math.max(0, aLoss));
  applyLosses(stocks, dLoss);
  const winnerDamage =
    8 +
    (attackWins
      ? aLoss / Math.max(1, beforeAttack.troops)
      : dLoss / Math.max(1, beforeDef.troops)) *
      20;
  const loserDamage = 45 * Math.min(1.5, Math.max(1, winnerRatio));
  army.morale = clamp(Math.round(army.morale - (attackWins ? winnerDamage : loserDamage)));
  for (const stock of stocks)
    stock.morale = clamp(Math.round(stock.morale - (attackWins ? loserDamage : winnerDamage)));
  battle.attackerCasualties = Math.max(0, aLoss);
  battle.defenderCasualties = dLoss;
  battle.attackerMoraleAfter = army.morale;
  const remainingDefense: ArmyStock = { troops: 0, mercenaries: 0, morale: 0, training: 1 };
  stocks.forEach((stock) => mergeArmy(remainingDefense, stock));
  battle.defenderMoraleAfter = remainingDefense.morale;
  if (attackWins) {
    const defeated = stocks.map((stock, i) => ({
      id: i === 0 ? `garrison-${target.id}` : supporters[i - 1].id,
      ownerId: i === 0 ? defenderId : supporters[i - 1].ownerId,
      provinceId: target.id,
      troops: stock.troops,
      mercenaries: stock.mercenaries,
      training: stock.training,
      morale: stock.morale,
      stranded: false,
    }));
    // Detach defeated armies before occupation so allied retreats never turn into gifts.
    g.stationedArmies = g.stationedArmies.filter((a) => !supporters.some((s) => s.id === a.id));
    target.ownerId = actor.id;
    target.troops = army.troops;
    target.mercenaries = army.mercenaries;
    target.training = army.training;
    target.morale = army.morale;
    target.pacification = target.religion === actor.faith ? 20 : 0;
    target.unrest = clamp(target.unrest + 30);
    target.conversion = 0;
    target.conversionReligion = null;
    target.conversionInstigatorId = null;
    for (const defeatedArmy of defeated) {
      const result = retreatArmy(g, defeatedArmy, winnerRatio, report, moved);
      if (result.destination && !battle.retreatDestinationId)
        battle.retreatDestinationId = result.destination;
      if (result.wiped) {
        battle.stackwipe = true;
        battle.defenderCasualties += defeatedArmy.troops;
      }
    }
    battle.outcome = 'attacker_victory';
    battle.winnerId = actor.id;
    actor.wonBattles++;
    log(
      g,
      `${actor.nation} conquistou ${target.name}. ${battle.attackerCasualties} baixas no ataque; ${battle.defenderCasualties} na defesa.${battle.stackwipe ? ' Houve aniquilação.' : ' Os derrotados tentam recuar.'}`,
      'battle',
    );
  } else {
    const result = retreatArmy(g, { ...army, provinceId: target.id }, winnerRatio, report, moved);
    battle.retreatDestinationId = result.destination;
    battle.stackwipe = result.wiped;
    if (result.wiped) battle.attackerCasualties += army.troops;
    if (defenderId) playerOf(g, defenderId).wonBattles++;
    log(
      g,
      `${actor.nation} foi repelido em ${target.name}. ${battle.attackerCasualties} baixas no ataque; ${battle.defenderCasualties} na defesa.${result.wiped ? ' Exército aniquilado.' : ' Recuo com moral 15.'}`,
      'battle',
    );
  }
  report.battles.push(battle);
}
