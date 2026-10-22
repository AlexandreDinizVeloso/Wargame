import type { GameState, TurnResolutionReport } from '../shared/types';
import { unitCount } from '../shared/rules';
import { destroyBattalion, removeUnits } from './state';
import { notify } from './notifications';
export function desertForMaintenance(
  g: GameState,
  id: string,
  shortfall: number,
  upkeep: number,
  report: TurnResolutionReport,
) {
  if (shortfall <= 0 || upkeep <= 0) return;
  const fraction = Math.min(0.25, shortfall / upkeep);
  let total = 0;
  for (const a of [...g.battalions.filter((a) => a.ownerId === id)]) {
    if (!g.battalions.includes(a)) continue;
    const before = unitCount(a);
    removeUnits(a, Math.ceil(before * fraction));
    const loss = before - unitCount(a);
    total += loss;
    report.desertions.push({
      battalionId: a.id,
      ownerId: id,
      provinceId: a.provinceId,
      losses: loss,
    });
    if (!unitCount(a)) destroyBattalion(g, a);
  }
  for (const f of g.battalions.filter((f) => f.ownerId === id && f.embarkedArmyId)) {
    const cargo = g.battalions.find((a) => a.id === f.embarkedArmyId);
    if (!cargo) continue;
    const excess = unitCount(cargo) - f.transports * 4;
    if (excess > 0) {
      removeUnits(cargo, excess);
      if (!unitCount(cargo)) destroyBattalion(g, cargo);
    }
  }
  if (total)
    notify(g, {
      type: 'ECONOMY',
      severity: 'WARNING',
      involvesPlayerIds: [id],
      text: `Manutenção sem cobertura: deserção de ${total} tropas. Reforce sua economia ou reduza o exército.`,
    });
}
