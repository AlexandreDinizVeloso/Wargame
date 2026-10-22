import { goldRules, hasFoundry } from './factions';
import type { Battalion, Province, GameState, GameView } from './types';
import { commanderFor, hasSkill } from './military';
import { hasReligiousWar, isCamouflaged, resourceCount } from './strategy';
import { clamp, controller, getRelation, isBlockaded, nationOf } from './rules';
const coalitionMorale = (g: Pick<GameState, 'wars'>, id: string) =>
  g.wars.some((w) => w.active && w.casusBelli === 'COALITION' && w.attackerIds.includes(id))
    ? 1.2
    : 1;
export function compositionPower(
  g: GameState | GameView,
  a: Battalion,
  p: Province,
  defending = false,
  opponents: Battalion[] = [],
) {
  const actor = g.players.find((p) => p.id === a.ownerId),
    nation = actor ? nationOf(actor.nationId) : null,
    c = commanderFor(g, a),
    veteran = 1 + 0.05 * ((c?.stars ?? 1) - 1);
  if (a.isFleet) {
    const morale = clamp(
      a.morale * coalitionMorale(g, a.ownerId) * (hasSkill(g, a.ownerId, 'NAV_T1') ? 1.2 : 1),
    );
    const value =
      a.warships * 3 * (!defending && hasSkill(g, a.ownerId, 'NAV_T2B') ? 1.25 : 1) +
      a.transports * 0.5;
    return (
      value *
      a.training *
      veteran *
      (0.5 + (0.5 * morale) / 100) *
      (defending
        ? (hasSkill(g, a.ownerId, 'NAV_T1') ? 1.2 : 1) * (c?.trait === 'IRON_WALL' ? 1.2 : 1)
        : (c?.trait === 'SEA_WOLF' ? 1.25 : 1) * (nation?.modifiers.navalAttack ?? 1))
    );
  }
  if (p.kind === 'SEA_ZONE') return 0;
  const crusade = actor && hasReligiousWar(g, actor.id),
    zeal = actor?.nationId === 'sol_invicto' && crusade;
  const morale = clamp(
    a.morale *
      coalitionMorale(g, a.ownerId) *
      (zeal ? 1.2 : 1) *
      (actor && actor.moraleBonusUntil >= g.turn ? 1.15 : 1),
    0,
    a.moraleCap ?? 100,
  );
  const flat = ['plains', 'coastal'].includes(p.terrain),
    rough = ['forest', 'hills', 'mountains'].includes(p.terrain),
    pikes = opponents.some((b) => b.infantry > 0 && hasSkill(g, b.ownerId, 'INF_T2A'));
  const cavalryTerrain = defending
    ? 1
    : pikes && flat
      ? 1
      : flat
        ? 1.4
        : rough
          ? hasSkill(g, a.ownerId, 'CAV_T2B')
            ? 1
            : 0.8
          : 1;
  const infantry =
    (actor?.faith === 'SOLAR' && !defending ? 1.15 : 1) *
    (nation?.modifiers.infantry ?? 1) *
    (1 + Math.min(0.24, resourceCount(g, a.ownerId, 'IRON') * 0.08)) *
    (goldRules(g) &&
    actor?.nationId === 'ferro_norte' &&
    !defending &&
    g.wars.some(
      (w) =>
        w.active &&
        w.startedTurn === g.turn &&
        [...w.attackerIds, ...w.defenderIds].includes(a.ownerId),
    )
      ? 1.15
      : 1) *
    a.infantryPower *
    (defending && hasSkill(g, a.ownerId, 'INF_T1') ? 1.12 : 1) *
    (!defending && hasSkill(g, a.ownerId, 'INF_T2B') ? 1.2 : 1) *
    (hasSkill(g, a.ownerId, 'INF_T2A') && opponents.some((b) => b.cavalry > 0) ? 1.3 : 1);
  const cavalry =
    (nation?.modifiers.cavalry ?? 1) *
    (1 + Math.min(0.3, resourceCount(g, a.ownerId, 'HORSES') * 0.1)) *
    cavalryTerrain *
    (!defending && hasSkill(g, a.ownerId, 'CAV_T1') ? 1.12 : 1) *
    (!defending && flat && !pikes && hasSkill(g, a.ownerId, 'CAV_T2A') ? 1.3 : 1) *
    (defending && hasSkill(g, a.ownerId, 'CAV_T2B') ? 1.15 : 1);
  const artillery =
    (actor?.faith === 'REFORMED' ? 1.2 : 1) *
    (nation?.modifiers.artillery ?? 1) *
    (goldRules(g) && actor?.nationId === 'kaldor' && hasFoundry(g, a.ownerId) ? 1.15 : 1) *
    a.artilleryPower *
    (!defending && hasSkill(g, a.ownerId, 'ART_T1') ? 1.15 : 1) *
    (hasSkill(g, a.ownerId, 'ART_T2B') ? 1.25 : 1);
  const value =
    a.infantry * (defending ? 1.2 : 1) * infantry +
    a.cavalry * cavalry +
    a.artillery * (defending ? 0.6 : 2.2) * artillery;
  const coastal =
    p.isCoastal &&
    g.battalions.some(
      (f) =>
        f.isFleet &&
        f.warships > 0 &&
        g.provinces.some((q) => q.id === f.provinceId && q.kind === 'SEA_ZONE') &&
        p.neighbors.includes(f.provinceId) &&
        hasSkill(g, f.ownerId, 'NAV_T2B') &&
        (f.ownerId === a.ownerId || getRelation(g, f.ownerId, a.ownerId)?.allied),
    );
  return (
    value *
    (goldRules(g) && actor?.nationId === 'veridia' && ['forest', 'mountains'].includes(p.terrain)
      ? 1.2
      : 1) *
    (goldRules(g) &&
    actor?.nationId === 'turan' &&
    !defending &&
    p.terrain === 'plains' &&
    a.cavalry > a.infantry + a.artillery
      ? 1.2
      : 1) *
    a.training *
    veteran *
    (0.5 + (0.5 * morale) / 100) *
    (defending && actor?.faith === 'ANCESTRAL' && p.ownerId === a.ownerId ? 1.2 : 1) *
    (zeal && !defending ? 1.2 : 1) *
    (g.globalEvent?.id === 'CRUSADE' && crusade && !defending ? 1.1 : 1) *
    (defending && isCamouflaged(g, a) ? 1.5 : 1) *
    (defending && a.entrenched ? 1.15 : 1) *
    (defending && c?.trait === 'IRON_WALL' ? 1.2 : 1) *
    (defending && actor && actor.homelandDefenseUntil >= g.turn && p.ownerId === a.ownerId
      ? 1.15
      : 1) *
    (!defending &&
    c?.trait === 'BLITZ_VANGUARD' &&
    controller(p) !== a.ownerId &&
    (!p.siege || p.siege.startedTurn === g.turn)
      ? 1.15
      : 1) *
    (rough && c?.trait === 'FOREST_RANGER' ? 1.3 : 1) *
    (coastal ? 1.15 : 1)
  );
}
export function combatPowers(
  g: GameState | GameView,
  attackers: Battalion[],
  defenders: Battalion[],
  p: Province,
) {
  const naval = attackers[0]?.isFleet ?? p.kind === 'SEA_ZONE';
  const artillery = attackers.reduce((n, a) => n + a.artillery, 0),
    master = attackers.some((a) => commanderFor(g, a)?.trait === 'SIEGE_MASTER');
  const neutralizedFortLevels = naval ? 0 : Math.min(p.fortLevel, artillery + (master ? 1 : 0)),
    blockadeModifier = naval ? 1 : isBlockaded(g, p) ? 0.8 : 1;
  const bombardmentModifier =
    !naval &&
    p.coastalBombardment &&
    p.coastalBombardment.untilTurn >= g.turn &&
    attackers.some((a) => a.ownerId === p.coastalBombardment?.ownerId)
      ? 0.85
      : 1;
  const holy = !naval && attackers.some((a) => p.conversionInstigatorId === a.ownerId) ? 1.15 : 1;
  const attackPower =
    attackers.reduce((n, a) => n + compositionPower(g, a, p, false, defenders), 0) * holy;
  const defensePower =
    defenders.reduce((n, a) => n + compositionPower(g, a, p, true, attackers), 0) *
    (naval
      ? 1
      : p.terrainDefenseBonus *
        (goldRules(g) &&
        p.fortLevel > 0 &&
        g.players.find((q) => q.id === p.ownerId)?.nationId === 'sol_invicto'
          ? 1.25
          : 1) *
        (1 + (p.fortLevel - neutralizedFortLevels) * 0.15) *
        blockadeModifier *
        bombardmentModifier);
  return {
    attackPower,
    defensePower,
    ratio: attackPower / Math.max(1, defensePower),
    neutralizedFortLevels,
    blockadeModifier,
    bombardmentModifier,
  };
}
