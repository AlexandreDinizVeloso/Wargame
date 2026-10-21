import type { GameState, TurnResolutionReport } from '../shared/types';
import { unitCount } from '../shared/rules';
import { legalBridge } from '../shared/naval';
import { resolveBattle } from './combat';
export function resolveBridges(
  g: GameState,
  report: TurnResolutionReport,
  moved: Set<string>,
  origins: ReadonlyMap<string, string>,
) {
  const used = new Map<string, number>();
  for (const p of g.players)
    for (const o of g.orders[p.id] ?? []) {
      if (o.type !== 'NAVAL_BRIDGE') continue;
      const a = g.battalions.find((a) => a.id === o.battalionId && a.ownerId === p.id),
        fleet = g.battalions.find((a) => a.id === o.fleetId),
        target = g.provinces.find((q) => q.id === o.targetProvinceId);
      if (
        !a ||
        !fleet ||
        !target ||
        fleet.provinceId !== origins.get(fleet.id) ||
        !legalBridge(g, a, target, fleet.id) ||
        unitCount(a) + (used.get(fleet.id) ?? 0) > fleet.transports * 4
      ) {
        report.events.push('Uma travessia foi cancelada: ponte naval indisponível.');
        continue;
      }
      used.set(fleet.id, (used.get(fleet.id) ?? 0) + unitCount(a));
      const from = a.provinceId;
      a.provinceId = target.id;
      a.pathQueue = [];
      a.entrenched = false;
      moved.add(a.id);
      resolveBattle(g, a, target, report);
      report.movements.push({
        battalionId: a.id,
        ownerId: p.id,
        fromProvinceId: from,
        toProvinceId: target.id,
        isFleet: false,
        troops: unitCount(a),
        viaSeaId: fleet.provinceId,
      });
    }
}
