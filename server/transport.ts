import type { GameState, PlayerOrder, TurnResolutionReport } from '../shared/types';
import { roundMoney, unitCount } from '../shared/rules';
import { legalBridge, crossingOptions } from '../shared/naval';
import { resolveBattle } from './combat';
import { assert, battalionOf, provinceOf } from './state';
export function prepareTransport(g: GameState, id: string, o: PlayerOrder): PlayerOrder {
  if (o.type !== 'AUTO_TRANSPORT') return o;
  const a = battalionOf(g, o.battalionId),
    target = provinceOf(g, o.targetProvinceId);
  const option = crossingOptions(g, a, target, g.orders[id] ?? [])[0];
  assert(
    option,
    'Travessia exige costa, rota desimpedida e frota disponível ou porto para fretamento.',
  );
  return {
    type: 'AUTO_TRANSPORT',
    battalionId: a.id,
    targetProvinceId: target.id,
    seaPath: option.seaPath,
    ...(option.fleetId ? { fleetId: option.fleetId } : {}),
  };
}
export function resolveBridges(
  g: GameState,
  report: TurnResolutionReport,
  moved: Set<string>,
  origins: ReadonlyMap<string, string>,
) {
  const used = new Map<string, number>();
  for (const p of g.players)
    for (const o of g.orders[p.id] ?? []) {
      if (o.type !== 'NAVAL_BRIDGE' && o.type !== 'AUTO_TRANSPORT') continue;
      const a = g.battalions.find((a) => a.id === o.battalionId && a.ownerId === p.id),
        target = g.provinces.find((q) => q.id === o.targetProvinceId);
      const fleet = o.fleetId ? g.battalions.find((f) => f.id === o.fleetId) : null;
      const option =
        a && target && o.type === 'AUTO_TRANSPORT'
          ? crossingOptions(g, a, target).find(
              (x) =>
                x.fleetId === o.fleetId && (!o.seaPath || x.seaPath.join() === o.seaPath.join()),
            )
          : null;
      const legal =
        !!a &&
        !!target &&
        a.provinceId === origins.get(a.id) &&
        !a.embarkedOnId &&
        !a.stranded &&
        (o.type === 'AUTO_TRANSPORT' ? !!option : !!fleet && legalBridge(g, a, target, fleet.id)) &&
        (o.fleetId
          ? !!fleet &&
            fleet.provinceId === origins.get(fleet.id) &&
            unitCount(a) + (used.get(fleet.id) ?? 0) <= fleet.transports * 4
          : p.gold >= 15);
      if (!legal || !a || !target) {
        report.events.push(
          'Uma travessia foi cancelada: ponte naval indisponível ou fretamento bloqueado.',
        );
        continue;
      }
      if (fleet) used.set(fleet.id, (used.get(fleet.id) ?? 0) + unitCount(a));
      else p.gold = roundMoney(p.gold - 15);
      const from = a.provinceId;
      a.provinceId = target.id;
      a.pathQueue = [];
      a.entrenched = false;
      a.morale = Math.max(0, a.morale - 6);
      moved.add(a.id);
      resolveBattle(g, a, target, report);
      report.movements.push({
        battalionId: a.id,
        ownerId: p.id,
        fromProvinceId: from,
        toProvinceId: target.id,
        isFleet: false,
        troops: unitCount(a),
        viaSeaId: option?.seaPath.join(',') ?? fleet?.provinceId,
      });
    }
}
