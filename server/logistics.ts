import { markDisorganized } from '../shared/morale';
import type { GameState, TurnResolutionReport } from '../shared/types';
import { atWar, clamp, unitCount, supplyLimit } from '../shared/rules';
import { commanderFor } from '../shared/military';
import { supplyConnected, invasionAttrition, hasWinterShelter } from '../shared/logistics';
import { winterActive } from '../shared/strategy';
import { SEASON_RULES } from '../shared/world';
import { destroyBattalion, removeUnits } from './state';
import { notify } from './notifications';
export function applyWinterAttrition(
  g: GameState,
  report: TurnResolutionReport,
  beforeLogistics: ReadonlyMap<string, number>,
) {
  if (!winterActive(g)) return;
  const cold = SEASON_RULES.WINTER;
  for (const army of [...g.battalions]) {
    if (army.ownerId === 'NEUTRAL' || !g.battalions.includes(army) || hasWinterShelter(g, army))
      continue;
    const baseline = beforeLogistics.get(army.id) ?? unitCount(army),
      priorLosses = report.attritionLosses
        .filter((loss) => loss.armyId === army.id)
        .reduce((sum, loss) => sum + loss.losses, 0),
      extra = Math.max(0, Math.ceil(baseline * cold.winterAttritionRate) - priorLosses),
      before = unitCount(army);
    removeUnits(army, extra);
    army.morale = clamp(army.morale - cold.winterMoraleLoss);
    markDisorganized(army);
    const losses = before - unitCount(army);
    if (losses)
      report.attritionLosses.push({
        armyId: army.id,
        ownerId: army.ownerId,
        provinceId: army.provinceId,
        troopsBefore: before,
        supplyLimit: supplyLimit(g.provinces.find((p) => p.id === army.provinceId)!),
        losses,
      });
    report.events.push(
      `${army.name}: geada de inverno, ${losses} baixa(s) adicionais para o mínimo de 20% de atrito e −15 moral; procure território próprio pacificado.`,
    );
    if (!unitCount(army)) destroyBattalion(g, army);
  }
}
export function applyEncirclement(g: GameState, report: TurnResolutionReport) {
  for (const a of [...g.battalions]) {
    a.encircled = a.supplySabotagedUntilTurn === g.turn;
    if (a.isFleet || a.embarkedOnId || a.ownerId === 'NEUTRAL') continue;
    const p = g.provinces.find((p) => p.id === a.provinceId)!;
    const hostile = !!p.ownerId && p.ownerId !== a.ownerId && atWar(g, a.ownerId, p.ownerId);
    if (!hostile || supplyConnected(g, a)) continue;
    a.encircled = true;
    const count = unitCount(a);
    a.morale = clamp(a.morale - 20);
    markDisorganized(a);
    removeUnits(
      a,
      commanderFor(g, a)?.trait === 'QUARTERMASTER'
        ? 0
        : Math.ceil(count * 0.15 * invasionAttrition(g, p.id, a.ownerId)),
    );
    report.encirclements.push({
      battalionId: a.id,
      ownerId: a.ownerId,
      provinceId: p.id,
      losses: count - unitCount(a),
    });
    report.attritionLosses.push({
      armyId: a.id,
      ownerId: a.ownerId,
      provinceId: p.id,
      troopsBefore: count,
      supplyLimit: supplyLimit(p),
      losses: count - unitCount(a),
    });
    notify(g, {
      type: 'ENCIRCLEMENT',
      text: `${a.name} está cercado em ${p.name}: −20 moral e 15% de atrito.`,
      involvesPlayerIds: [a.ownerId],
      severity: 'WARNING',
      focusProvinceId: p.id,
    });
    if (!unitCount(a)) destroyBattalion(g, a);
  }
}
