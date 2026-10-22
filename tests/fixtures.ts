import { realmLimits } from '../shared/economy';
import { addPlayer, createGame, startGame } from '../server/game';
import { createBattalion } from '../server/state';
import { compositionOf } from '../shared/rules';
import type { Composition, GameState } from '../shared/types';
export function setup(seed = 42) {
  const g = createGame('RULES', 'campaign', true, seed);
  const players = [
    addPlayer(g, 'A', false, 'vespera'),
    addPlayer(g, 'B', false, 'sol_invicto'),
    addPlayer(g, 'C', false, 'kaldor'),
  ];
  startGame(g);
  g.graceUntilTurn = 0;
  g.battalions = [];
  g.commanders = [];
  for (const p of g.provinces) {
    p.strategicResource = null;
    p.ownerId = null;
    p.occupierId = null;
    p.capitalOf = null;
    p.pacification = 70;
    p.unrest = 10;
    p.portLevel = 0;
    p.baseTax = 4;
  }
  for (const [i, id] of ['portugal', 'castile', 'france'].entries()) {
    const p = g.provinces.find((p) => p.id === id)!;
    p.ownerId = players[i].id;
    players[i].originalCapitalId = id;
    p.religion = players[i].faith;
    p.capitalOf = players[i].id;
    p.pacification = 100;
    p.unrest = 5;
    p.portLevel = p.isCoastal ? 1 : 0;
  }
  for (const a of players) {
    const l = realmLimits(g, a.id);
    a.armyCap = l.armyCap;
    a.manpowerCap = l.manpowerCap;
    a.manpower = Math.min(a.manpower, l.manpowerCap);
  }
  return { g, players };
}
export function army(
  g: GameState,
  ownerId: string,
  provinceId: string,
  composition: Partial<Composition> = { infantry: 5 },
) {
  return createBattalion(g, ownerId, provinceId, compositionOf(composition), {
    training: 1.2,
    morale: 80,
  });
}
