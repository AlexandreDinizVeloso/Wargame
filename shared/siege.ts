import { goldRules, hasFoundry } from './factions';
import type { Battalion, GameState, GameView, Province } from './types';
import { atWar, getRelation, sameWarSide } from './rules';
import { commanderFor, hasSkill } from './military';
import { seasonRulesAt } from './world';
/** Progress after the arrival round, before any assault orders. */
export function siegeProgressPerTurn(
  g: GameState | GameView,
  ownerId: string,
  troops: Battalion[],
  p: Province,
) {
  const artillery = troops.reduce((n, a) => n + a.artillery, 0);
  const master = troops.some((a) => commanderFor(g, a)?.trait === 'SIEGE_MASTER');
  const battery = hasSkill(g, ownerId, 'ART_T2A');
  const blockade =
    p.isCoastal &&
    g.battalions.some(
      (a) =>
        a.isFleet &&
        a.warships > 0 &&
        p.neighbors.includes(a.provinceId) &&
        g.provinces.some((q) => q.id === a.provinceId && q.kind === 'SEA_ZONE') &&
        (a.ownerId === ownerId ||
          sameWarSide(g, a.ownerId, ownerId) ||
          getRelation(g, a.ownerId, ownerId)?.allied) &&
        !!p.ownerId &&
        atWar(g, a.ownerId, p.ownerId),
    );
  return (
    1 +
    seasonRulesAt(g.turn).siegeProgressBonus +
    (goldRules(g) && g.turn >= 21 ? 1 : 0) +
    (goldRules(g) &&
    g.players.find((p) => p.id === ownerId)?.nationId === 'kaldor' &&
    hasFoundry(g, ownerId)
      ? 1
      : 0) +
    (artillery > 0 ? (artillery >= 3 || battery ? 2 : 1) : 0) +
    (artillery > 0 && battery ? 1 : 0) +
    (master ? 1 : 0) +
    (blockade ? 1 : 0)
  );
}

export const siegeResistance = (g: GameState | GameView, p: Province) =>
  2 +
  p.fortLevel * 2 +
  (goldRules(g) &&
  p.fortLevel > 0 &&
  g.players.find((q) => q.id === p.ownerId)?.nationId === 'sol_invicto'
    ? 1
    : 0);
