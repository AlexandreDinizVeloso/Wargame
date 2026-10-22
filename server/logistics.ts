import { markDisorganized } from '../shared/morale';
import type { GameState, TurnResolutionReport } from '../shared/types';
import { atWar, clamp, unitCount, supplyLimit } from '../shared/rules';
import { commanderFor } from '../shared/military';
import { supplyConnected } from '../shared/logistics';
import { destroyBattalion, removeUnits } from './state';
import { notify } from './notifications';
export function applyEncirclement(g: GameState, report: TurnResolutionReport) {
  for (const a of [...g.battalions]) {
    a.encircled = false;
    if (a.isFleet || a.embarkedOnId || a.ownerId === 'NEUTRAL') continue;
    const p = g.provinces.find((p) => p.id === a.provinceId)!;
    const hostile = !!p.ownerId && p.ownerId !== a.ownerId && atWar(g, a.ownerId, p.ownerId);
    if (!hostile || supplyConnected(g, a)) continue;
    a.encircled = true;
    const count = unitCount(a);
    a.morale = clamp(a.morale - 20);
    markDisorganized(a);
    removeUnits(a, commanderFor(g, a)?.trait === 'QUARTERMASTER' ? 0 : Math.ceil(count * 0.15));
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
