import type {
  Battalion,
  CommanderTrait,
  Commander,
  GameState,
  InstantArmyAction,
} from '../shared/types';
import { reservedResources, UNIT_KEYS, unitCount } from '../shared/rules';
import { SKILLS, commanderFor, skillBlock } from '../shared/military';
import {
  assert,
  battalionOf,
  createBattalion,
  destroyBattalion,
  log,
  mergeBattalions,
  nextId,
  playerOf,
} from './state';
export function recruitCommander(
  g: GameState,
  id: string,
  isAdmiral: boolean,
  trait: CommanderTrait,
  name?: string,
  free = false,
): Commander {
  const p = playerOf(g, id);
  assert(g.commanders.filter((c) => c.ownerId === id).length < 3, 'Limite de três líderes ativos.');
  assert(
    isAdmiral ? ['SEA_WOLF', 'QUARTERMASTER', 'IRON_WALL'].includes(trait) : trait !== 'SEA_WOLF',
    'Traço incompatível com o tipo de líder.',
  );
  if (!free) {
    const reserved = reservedResources(g, id);
    assert(!p.ready, 'Reabra suas ordens antes de recrutar um líder.');
    assert(
      p.gold - reserved.gold >= 60 && p.influence - reserved.influence >= 15,
      'Líder exige 60 ouro e 15 influência livres.',
    );
    p.gold -= 60;
    p.influence -= 15;
  }
  const c = {
    id: nextId(g, 'commander'),
    ownerId: id,
    isAdmiral,
    trait,
    name:
      name?.trim().slice(0, 40) ||
      `${isAdmiral ? 'Almirante' : 'General'} ${g.commanders.filter((c) => c.ownerId === id).length + 1} de ${p.nation}`,
    stars: 1 as const,
    xp: 0,
    assignedBattalionId: null,
    lastStandUsed: false,
  };
  g.commanders.push(c);
  return c;
}
export function commanderXP(g: GameState, a: Battalion, amount: number) {
  const c = commanderFor(g, a);
  if (c) {
    c.xp += amount;
    c.stars = c.xp >= 100 ? 3 : c.xp >= 40 ? 2 : 1;
  }
}
function cancelArmyOrders(g: GameState, id: string, armyIds: string[]) {
  g.orders[id] = g.orders[id].filter(
    (o) =>
      !('battalionId' in o && !!o.battalionId && armyIds.includes(o.battalionId)) &&
      !('targetBattalionId' in o && armyIds.includes(o.targetBattalionId)),
  );
}
export function combine(g: GameState, target: Battalion, source: Battalion) {
  const leader = commanderFor(g, source),
    existing = commanderFor(g, target);
  if (leader && !existing) leader.assignedBattalionId = target.id;
  target.movementCredit = Math.min(target.movementCredit, source.movementCredit);
  target.pathQueue = [];
  cancelArmyOrders(g, target.ownerId, [target.id, source.id]);
  mergeBattalions(target, source);
  destroyBattalion(g, source);
}
export function instantArmyAction(g: GameState, id: string, action: InstantArmyAction) {
  const p = playerOf(g, id);
  assert(g.phase === 'planning' && !p.ready, 'Reabra as ordens para reorganizar suas tropas.');
  const a = battalionOf(g, action.battalionId);
  assert(a.ownerId === id, 'Batalhão de outra nação.');
  if (action.type === 'ASSIGN_LEADER') {
    const previous = commanderFor(g, a);
    if (action.commanderId === null) {
      if (previous) previous.assignedBattalionId = null;
      return;
    }
    const c = g.commanders.find((c) => c.id === action.commanderId && c.ownerId === id);
    assert(c && c.isAdmiral === a.isFleet, 'Líder indisponível ou incompatível.');
    if (previous) previous.assignedBattalionId = null;
    c.assignedBattalionId = a.id;
    return;
  }
  assert(
    !a.embarkedOnId && !a.embarkedArmyId && !a.stranded,
    'Desembarque/reagrupe antes de reorganizar.',
  );
  if (action.type === 'SPLIT_BATTALION') {
    assert(g.battalions.filter((b) => b.ownerId === id).length < 80, 'Limite de formações.');
    for (const k of UNIT_KEYS)
      assert(
        Number.isInteger(action.composition[k]) &&
          action.composition[k] >= 0 &&
          action.composition[k] <= a[k],
        'Divisão inválida.',
      );
    assert(
      unitCount(action.composition) > 0 && unitCount(action.composition) < unitCount(a),
      'Deixe tropas em ambas as formações.',
    );
    cancelArmyOrders(g, id, [a.id]);
    a.pathQueue = [];
    for (const k of UNIT_KEYS) a[k] -= action.composition[k];
    const b = createBattalion(g, id, a.provinceId, action.composition, {
      name: action.name,
      isFleet: a.isFleet,
      isMercenary: a.isMercenary,
      training: a.training,
      morale: a.morale,
    });
    b.movementCredit = a.movementCredit;
    b.movementPoints = a.movementPoints;
    b.infantryPower = a.infantryPower;
    b.artilleryPower = a.artilleryPower;
    b.autoMerge = a.autoMerge;
    b.disorganized = a.disorganized || a.morale < 25;
    b.entrenched = a.entrenched;
    return;
  }
  const compatible = (b: Battalion) =>
    b.id !== a.id &&
    b.ownerId === id &&
    b.provinceId === a.provinceId &&
    b.isFleet === a.isFleet &&
    b.isMercenary === a.isMercenary &&
    !b.embarkedOnId &&
    !b.embarkedArmyId &&
    !b.stranded;
  if (action.type === 'MERGE_BATTALIONS') {
    const target = battalionOf(g, action.targetBattalionId);
    assert(compatible(target), 'Formações incompatíveis.');
    combine(g, target, a);
  } else for (const b of [...g.battalions.filter(compatible)]) combine(g, a, b);
}
export function autoMerge(g: GameState, moved?: Set<string>) {
  const units = [...g.battalions].sort((a, b) => a.id.localeCompare(b.id));
  for (const a of units) {
    if (
      !g.battalions.includes(a) ||
      !a.autoMerge ||
      a.embarkedArmyId ||
      a.embarkedOnId ||
      a.stranded
    )
      continue;
    for (const b of units)
      if (
        g.battalions.includes(b) &&
        b.id !== a.id &&
        b.autoMerge &&
        b.ownerId === a.ownerId &&
        b.provinceId === a.provinceId &&
        b.isFleet === a.isFleet &&
        b.isMercenary === a.isMercenary &&
        !b.stranded &&
        !b.embarkedArmyId &&
        !b.embarkedOnId
      ) {
        if (moved && (moved.has(a.id) || moved.has(b.id))) moved.add(a.id);
        combine(g, a, b);
      }
  }
}
export function unlockSkill(g: GameState, id: string, skillId: import('../shared/types').SkillId) {
  const p = playerOf(g, id);
  assert(!p.ready, 'Reabra as ordens antes de pesquisar.');
  const blocked = skillBlock(p, skillId);
  assert(!blocked, blocked ?? 'Doutrina indisponível.');
  const s = SKILLS.find((s) => s.id === skillId)!;
  p.militaryXP -= s.cost;
  p.unlockedSkills.push(skillId);
  log(g, `${p.nation} adotou ${s.name}.`);
}
