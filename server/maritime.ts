import type { GameState, TurnResolutionReport } from '../shared/types';
import { bombardmentBlock, BOMBARDMENT_COST } from '../shared/maritime';
import { roundMoney } from '../shared/rules';
import { notify } from './notifications';
export function resolveBombardments(
  g: GameState,
  report: TurnResolutionReport,
  moved: Set<string>,
  origins: ReadonlyMap<string, string>,
) {
  for (const actor of g.players)
    for (const order of g.orders[actor.id] ?? []) {
      if (order.type !== 'BOMBARD_COAST') continue;
      const a = g.battalions.find((a) => a.id === order.battalionId && a.ownerId === actor.id),
        p = g.provinces.find((p) => p.id === order.targetProvinceId);
      if (
        !a ||
        !p ||
        a.provinceId !== origins.get(a.id) ||
        bombardmentBlock(g, a, p) ||
        actor.gold < BOMBARDMENT_COST
      ) {
        report.events.push('Bombardeio cancelado: frota, alvo ou recursos indisponíveis.');
        continue;
      }
      actor.gold = roundMoney(actor.gold - BOMBARDMENT_COST);
      a.morale = Math.max(0, a.morale - 8);
      moved.add(a.id);
      const before = p.fortLevel;
      p.fortLevel = Math.max(0, p.fortLevel - 1);
      p.coastalBombardment = { ownerId: actor.id, startedTurn: g.turn, untilTurn: g.turn + 1 };
      report.bombardments.push({
        fleetId: a.id,
        ownerId: actor.id,
        provinceId: p.id,
        fortBefore: before,
        fortAfter: p.fortLevel,
        cost: BOMBARDMENT_COST,
      });
      const text = `${actor.nation} bombardeou ${p.name}: ${before - p.fortLevel} nível de forte destruído e −15% de defesa contra esta nação até a rodada ${g.turn + 1}.`;
      report.events.push(text);
      notify(g, {
        type: 'BOMBARDMENT',
        severity: 'WARNING',
        involvesPlayerIds: [actor.id, ...(p.ownerId ? [p.ownerId] : [])],
        text,
        focusProvinceId: p.id,
      });
    }
}
