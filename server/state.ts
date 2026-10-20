import type { GameState, Province, Player, ReligionId, StationedArmy } from '../shared/types';
import { clamp } from '../shared/rules';

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function playerOf(g: GameState, id: string) {
  const p = g.players.find((p) => p.id === id);
  assert(p, 'Reino não encontrado.');
  return p;
}
export function provinceOf(g: GameState, id: string) {
  const p = g.provinces.find((p) => p.id === id);
  assert(p, 'Província não encontrada.');
  return p;
}
export function nextId(g: GameState, prefix: string) {
  return `${prefix}-${g.nextId++}`;
}
export function log(g: GameState, text: string, kind: GameState['log'][number]['kind'] = 'system') {
  g.log.push({ id: (g.log.at(-1)?.id ?? 0) + 1, turn: g.turn, text, kind });
  g.log = g.log.slice(-100);
}
export function relation(g: GameState, a: string, b: string) {
  return g.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}
export function activeAlliances(g: GameState, id: string) {
  return g.relations.filter((r) => r.allied && (r.a === id || r.b === id));
}
export function canAttack(g: GameState, a: string, b: string | null) {
  if (!b || a === b) return true;
  const r = relation(g, a, b);
  return !r?.allied && (r?.truceUntil ?? 0) < g.turn;
}
export function canEnter(g: GameState, a: string, b: string | null) {
  return (
    a === b || !!(b && relation(g, a, b)?.militaryAccess.includes(a) && !relation(g, a, b)?.atWar)
  );
}
export function roll(g: Pick<GameState, 'seed' | 'turn'>, salt: string) {
  let h = (g.seed + g.turn * 7919) | 0;
  for (const c of salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
export function setReligion(p: Province, religion: ReligionId) {
  p.religion = religion;
}
export function armyAt(g: GameState, p: Province, ownerId: string) {
  return p.ownerId === ownerId
    ? p
    : g.stationedArmies.find((a) => a.provinceId === p.id && a.ownerId === ownerId);
}
export type ArmyStock = Pick<StationedArmy, 'troops' | 'mercenaries' | 'morale' | 'training'>;
export function removeTroops(army: ArmyStock, count: number): ArmyStock {
  const mercenaries = Math.min(
    count,
    Math.round((army.mercenaries * count) / Math.max(1, army.troops)),
  );
  const result = { troops: count, mercenaries, morale: army.morale, training: army.training };
  army.troops -= count;
  army.mercenaries = clamp(army.mercenaries - mercenaries, 0, army.troops);
  return result;
}
export function mergeArmy(target: ArmyStock, incoming: ArmyStock) {
  const total = target.troops + incoming.troops;
  if (!total) return;
  target.morale = Math.round(
    (target.morale * target.troops + incoming.morale * incoming.troops) / total,
  );
  target.training = (target.training * target.troops + incoming.training * incoming.troops) / total;
  target.troops = total;
  target.mercenaries += incoming.mercenaries;
}
export function stationArmy(g: GameState, at: Province, ownerId: string | null, army: ArmyStock) {
  if (at.ownerId === ownerId) {
    mergeArmy(at, army);
    return;
  }
  let target = g.stationedArmies.find((a) => a.ownerId === ownerId && a.provinceId === at.id);
  if (!target) {
    target = {
      id: nextId(g, 'camp'),
      ownerId,
      provinceId: at.id,
      troops: 0,
      mercenaries: 0,
      morale: 0,
      training: 1,
      stranded: false,
    };
    g.stationedArmies.push(target);
  }
  mergeArmy(target, army);
}
export function objectiveFor(archetype: Player['botArchetype']): Player['objective'] {
  return { Militarist: 'conquest', Merchant: 'prosperity', Theocrat: 'faith', Diplomat: 'concord' }[
    archetype
  ] as Player['objective'];
}
