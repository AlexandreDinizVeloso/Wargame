import { siegeProgressPerTurn } from '../shared/siege';
import { isDisorganized, markDisorganized } from '../shared/morale';
import { notify } from './notifications';
import type { Battalion, GameState, Province, TurnResolutionReport } from '../shared/types';
import { atWar, clamp, controller, unitCount } from '../shared/rules';
import { hasSkill } from '../shared/military';
import { destroyBattalion, log, playerOf } from './state';
import { commanderXP } from './armies';
export function beginSiege(g: GameState, a: Battalion, p: Province) {
  if (
    a.isFleet ||
    a.embarkedOnId ||
    p.kind !== 'LAND' ||
    controller(p) === a.ownerId ||
    (controller(p) && !atWar(g, a.ownerId, controller(p)!))
  )
    return;
  if (
    p.siege?.attackerOwnerId === a.ownerId &&
    g.battalions.some(
      (b) =>
        b.ownerId === p.siege!.attackerOwnerId &&
        b.provinceId === p.id &&
        !b.isFleet &&
        !b.stranded &&
        !b.embarkedOnId,
    )
  )
    return;
  p.siege = {
    attackerOwnerId: a.ownerId,
    progress: 1,
    required: 2 + p.fortLevel * 2,
    turnsUnderSiege: 1,
    startedTurn: g.turn,
    lastProgressTurn: g.turn,
  };
  a.pathQueue = [];
  notify(g, {
    type: 'SIEGE_STARTED',
    text: `Cerco iniciado em ${p.name} (1/${p.siege.required}).`,
    involvesPlayerIds: [a.ownerId, ...(p.ownerId ? [p.ownerId] : [])],
    severity: 'CRITICAL',
    focusProvinceId: p.id,
  });
  log(
    g,
    `${playerOf(g, a.ownerId).nation} iniciou cerco em ${p.name} (1/${p.siege.required}).`,
    'battle',
  );
}
export function completeSiege(g: GameState, id: string, p: Province, report: TurnResolutionReport) {
  const previous = controller(p),
    actor = playerOf(g, id);
  if (p.ownerId && p.ownerId !== id) {
    const defender = playerOf(g, p.ownerId);
    defender.lostProvinceIds = [...new Set([...defender.lostProvinceIds, p.id])];
  }
  if (!p.ownerId) {
    p.ownerId = id;
    p.occupierId = null;
    actor.aggressiveExpansion = clamp(actor.aggressiveExpansion + 4);
  } else p.occupierId = p.ownerId === id ? null : id;
  p.pacification = p.religion === actor.faith ? 20 : 0;
  p.unrest = clamp(p.unrest + 30);
  p.conversion = 0;
  p.conversionReligion = null;
  p.conversionInstigatorId = null;
  if (hasSkill(g, id, 'ART_T2A')) p.fortLevel = Math.max(0, p.fortLevel - 1);
  if (
    actor.nationId === 'ferro_norte' &&
    (p.isCoastal ||
      p.neighbors.some((n) => g.provinces.some((q) => q.id === n && controller(q) === id)))
  )
    for (const a of g.battalions.filter((a) => a.ownerId === id && a.provinceId === p.id))
      a.morale = clamp(a.morale + 20);
  const siege = p.siege;
  if (siege)
    report.sieges.push({
      provinceId: p.id,
      attackerOwnerId: id,
      progress: siege.progress,
      required: siege.required,
      completed: true,
      assault: false,
    });
  p.siege = null;
  log(
    g,
    `${actor.nation} concluiu o cerco e ${previous ? 'ocupou' : 'incorporou'} ${p.name}.`,
    'battle',
  );
}
export function assaultSiege(
  g: GameState,
  a: Battalion,
  p: Province,
  report: TurnResolutionReport,
) {
  if (!p.siege || p.siege.attackerOwnerId !== a.ownerId || isDisorganized(a)) return;
  const loss = Math.min(a.infantry, Math.ceil(a.infantry * (0.15 + p.fortLevel * 0.1)));
  a.infantry -= loss;
  a.morale = clamp(a.morale - 25);
  markDisorganized(a);
  a.pathQueue = [];
  p.siege.progress += 3;
  report.sieges.push({
    provinceId: p.id,
    attackerOwnerId: a.ownerId,
    progress: p.siege.progress,
    required: p.siege.required,
    completed: false,
    assault: true,
  });
  report.events.push(`${a.name} assaltou ${p.name}: ${loss} infantaria perdida e −25 moral.`);
  if (!unitCount(a)) destroyBattalion(g, a);
}
export function advanceSieges(g: GameState, report: TurnResolutionReport) {
  for (const p of g.provinces) {
    const s = p.siege;
    if (!s) continue;
    const troops = g.battalions.filter(
      (a) =>
        a.provinceId === p.id &&
        !a.isFleet &&
        !a.embarkedOnId &&
        !a.stranded &&
        a.ownerId === s.attackerOwnerId,
    );
    const hostile = g.battalions.some(
      (a) =>
        a.provinceId === p.id &&
        !a.isFleet &&
        !a.embarkedOnId &&
        !a.stranded &&
        (a.ownerId === 'NEUTRAL' || atWar(g, s.attackerOwnerId, a.ownerId)),
    );
    if (
      !troops.length ||
      hostile ||
      (controller(p) &&
        controller(p) !== s.attackerOwnerId &&
        !atWar(g, s.attackerOwnerId, controller(p)!))
    ) {
      p.siege = null;
      continue;
    }
    s.required = 2 + p.fortLevel * 2;
    if (s.lastProgressTurn < g.turn) {
      s.progress += siegeProgressPerTurn(g, s.attackerOwnerId, troops, p);
      s.turnsUnderSiege++;
      s.lastProgressTurn = g.turn;
      for (const a of troops) commanderXP(g, a, 5);
    }
    if (s.progress >= s.required && s.startedTurn < g.turn)
      completeSiege(g, s.attackerOwnerId, p, report);
    else
      report.sieges.push({
        provinceId: p.id,
        attackerOwnerId: s.attackerOwnerId,
        progress: s.progress,
        required: s.required,
        completed: false,
        assault: false,
      });
  }
}
