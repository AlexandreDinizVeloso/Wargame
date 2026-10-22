import type { GameState, TurnResolutionReport } from '../shared/types';
import { independentCity, neutralTarget } from '../shared/neutral';
import { buildingSlots, usedSlots } from '../shared/development';
import { unitCount, compositionOf } from '../shared/rules';
import { createBattalion, log } from './state';
export function developNeutralCities(g: GameState, report: TurnResolutionReport) {
  if (g.turn % 4 !== 0 || g.phase !== 'planning') return;
  const grown: string[] = [];
  for (const p of g.provinces) {
    if (
      !independentCity(p) ||
      p.neutralDevelopmentTurn === g.turn ||
      p.siege ||
      g.battalions.some(
        (a) => a.provinceId === p.id && !a.isFleet && !a.embarkedOnId && a.ownerId !== 'NEUTRAL',
      )
    )
      continue;
    p.neutralDevelopmentTurn = g.turn;
    const previous = p.neutralDevelopmentLevel;
    p.neutralDevelopmentLevel = Math.min(5, previous + 1);
    const guards = g.battalions.filter(
        (a) => a.ownerId === 'NEUTRAL' && a.provinceId === p.id && !a.isFleet,
      ),
      count = guards.reduce((n, a) => n + unitCount(a), 0);
    const add = Math.min(2, Math.max(0, neutralTarget(p) - count));
    if (add) {
      const guard =
        guards[0] ??
        createBattalion(g, 'NEUTRAL', p.id, compositionOf({}), {
          name: `Guarda independente de ${p.name}`,
          morale: 60,
          training: 1.05,
        });
      guard.infantry += add;
      if (!guards.includes(guard)) guards.push(guard);
    }
    for (const guard of guards) {
      guard.training = Math.max(
        guard.training,
        Math.min(1.2, 1.05 + p.neutralDevelopmentLevel * 0.03),
      );
      guard.morale = Math.max(guard.morale, 60 + p.neutralDevelopmentLevel * 4);
    }
    const desired = p.neutralDevelopmentLevel >= 4 ? 2 : p.neutralDevelopmentLevel >= 2 ? 1 : 0;
    if (p.fortLevel < desired && (p.fortLevel > 0 || usedSlots(p) < buildingSlots(p)))
      p.fortLevel++;
    if (add || previous !== p.neutralDevelopmentLevel) grown.push(p.name);
  }
  if (grown.length) {
    const text = `Cidades independentes reforçadas: ${grown.join(', ')}. Guarnições e fortes disponíveis para inspeção no mapa.`;
    report.events.push(text);
    log(g, text);
  }
}
