import type { Battalion, Composition, GameState, Player, Province } from '../shared/types';
import {
  atWar,
  canUnitVisit,
  compositionOf,
  getRelation,
  landCount,
  nationOf,
  sameWarSide,
  UNIT_KEYS,
  unitCount,
} from '../shared/rules';
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function playerOf(g: Pick<GameState, 'players'>, id: string) {
  const p = g.players.find((p) => p.id === id);
  assert(p, 'Reino não encontrado.');
  return p;
}
export function provinceOf(g: Pick<GameState, 'provinces'>, id: string) {
  const p = g.provinces.find((p) => p.id === id);
  assert(p, 'Província não encontrada.');
  return p;
}
export function battalionOf(g: Pick<GameState, 'battalions'>, id: string) {
  const a = g.battalions.find((a) => a.id === id);
  assert(a, 'Batalhão não encontrado.');
  return a;
}
export const nextId = (g: GameState, prefix: string) => `${prefix}-${g.nextId++}`;
export function log(g: GameState, text: string, kind: GameState['log'][number]['kind'] = 'system') {
  g.log.push({ id: (g.log.at(-1)?.id ?? 0) + 1, turn: g.turn, text, kind });
}
export const relation = getRelation;
export const activeAlliances = (g: GameState, id: string) =>
  g.relations.filter((r) => r.allied && (r.a === id || r.b === id));
export const canAttack = (g: GameState, a: string, b: string | null) =>
  !b || a === b || atWar(g, a, b);
export const canEnter = (g: GameState, a: string, b: string | null) =>
  a === b || !!(b && (getRelation(g, a, b)?.militaryAccess.includes(a) || sameWarSide(g, a, b)));
export function roll(g: Pick<GameState, 'seed' | 'turn'>, salt: string) {
  let h = (g.seed + g.turn * 7919) | 0;
  for (const c of salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
export function createBattalion(
  g: GameState,
  ownerId: string,
  provinceId: string,
  composition: Composition,
  options: Partial<
    Pick<Battalion, 'isFleet' | 'isMercenary' | 'name' | 'training' | 'morale'>
  > = {},
): Battalion {
  const army: Battalion = {
    ...compositionOf(composition),
    id: nextId(g, 'army'),
    ownerId,
    provinceId,
    name:
      options.name ??
      `${options.isFleet ? 'Armada' : 'Batalhão'} ${g.battalions.filter((a) => a.ownerId === ownerId).length + 1}`,
    isFleet: options.isFleet ?? false,
    isMercenary: options.isMercenary ?? false,
    morale: options.morale ?? 70,
    training: options.training ?? 1.1,
    entrenched: false,
    pathQueue: [],
    stranded: false,
  };
  g.battalions.push(army);
  return army;
}
export function mergeBattalions(target: Battalion, source: Battalion) {
  const a = unitCount(target),
    b = unitCount(source),
    total = a + b;
  if (total) {
    target.morale = Math.round((target.morale * a + source.morale * b) / total);
    target.training = (target.training * a + source.training * b) / total;
  }
  for (const key of UNIT_KEYS) target[key] += source[key];
}
export function removeUnits(army: Battalion, count: number, exposed = false): Composition {
  const original = unitCount(army),
    losses = compositionOf({});
  if (!original || count <= 0) return losses;
  count = Math.min(original, Math.ceil(count));
  let allocated = 0;
  for (const k of UNIT_KEYS) {
    losses[k] = Math.min(army[k], Math.floor((count * army[k]) / original));
    allocated += losses[k];
  }
  for (const k of ['infantry', 'cavalry', 'warships', 'transports', 'artillery'] as const) {
    if (allocated >= count) break;
    const extra = Math.min(count - allocated, army[k] - losses[k]);
    losses[k] += extra;
    allocated += extra;
  }
  if (exposed && army.infantry < army.artillery) {
    const base = Math.max(losses.artillery, Math.ceil((count * army.artillery) / original));
    losses.artillery = Math.min(army.artillery, Math.ceil(base * 1.75));
  }
  for (const k of UNIT_KEYS) army[k] -= losses[k];
  return losses;
}
export function destroyBattalion(g: GameState, a: Battalion) {
  if (a.embarkedArmyId) g.battalions = g.battalions.filter((b) => b.id !== a.embarkedArmyId);
  if (a.embarkedOnId) {
    const fleet = g.battalions.find((f) => f.id === a.embarkedOnId);
    if (fleet) delete fleet.embarkedArmyId;
  }
  g.battalions = g.battalions.filter((b) => b.id !== a.id);
}
export function syncCargo(g: GameState, fleet: Battalion) {
  if (fleet.embarkedArmyId) {
    const a = g.battalions.find((a) => a.id === fleet.embarkedArmyId);
    if (a) a.provinceId = fleet.provinceId;
  }
}
export function freeResources(
  g: GameState,
  id: string,
  reserved: { gold: number; manpower: number; influence: number },
) {
  const p = playerOf(g, id);
  return {
    gold: p.gold - reserved.gold,
    manpower: p.manpower - reserved.manpower,
    influence: p.influence - reserved.influence,
  };
}
export function canStand(g: GameState, a: Battalion, p: Province) {
  const host = p.occupierId ?? p.ownerId;
  if (p.kind === 'LAND' && host && getRelation(g, a.ownerId, host)?.allied)
    return !a.isFleet || p.portLevel > 0;
  return canUnitVisit(g, a, p);
}
export function setNation(p: Player, id: Player['nationId']) {
  const n = nationOf(id);
  p.nationId = id;
  p.nation = n.name;
  p.color = n.color;
  p.faith = n.religion;
}
export function coalitionMorale(g: GameState, id: string) {
  return g.wars.some((w) => w.active && w.imperialBanAgainstId && w.defenderIds.includes(id))
    ? 1.2
    : 1;
}
export const liveArmySize = (g: GameState, id: string) =>
  g.battalions.filter((a) => a.ownerId === id && !a.isFleet).reduce((n, a) => n + landCount(a), 0);
