import { goldRules } from './factions';
import type { GameState } from './types';
export function levyReason(
  g: Pick<GameState, 'players' | 'wars' | 'provinces' | 'battalions' | 'turn' | 'phase'>,
  id: string,
): string | null {
  const p = g.players.find((p) => p.id === id);
  if (!p) return 'Nação inexistente.';
  if (g.phase !== 'planning' || p.ready) return 'Reabra suas ordens para convocar a defesa.';
  const cooldown = goldRules(g) && p.nationId === 'sol_invicto' ? 6 : 8;
  if (p.emergencyLevyTurn !== null && g.turn - p.emergencyLevyTurn < cooldown)
    return `Disponível na rodada ${p.emergencyLevyTurn + cooldown}.`;
  if (!g.wars.some((w) => w.active && w.defenderIds.includes(id)))
    return 'Exige participação em guerra defensiva.';
  if (
    !p.lostProvinceIds.length &&
    !g.provinces.some((q) => q.ownerId === id && (q.siege !== null || !!q.occupierId))
  )
    return 'Exige uma província perdida, ocupada ou sob cerco.';
  if (p.gold < 50 || p.stability < 15) return 'Custa 50 ouro e 15 estabilidade.';
  if (
    !g.provinces.some(
      (q) =>
        q.kind === 'LAND' &&
        q.ownerId === id &&
        !q.occupierId &&
        !g.battalions.some(
          (a) =>
            a.provinceId === q.id &&
            a.ownerId !== id &&
            !a.isFleet &&
            !a.embarkedOnId &&
            g.wars.some(
              (w) =>
                w.active &&
                ((w.attackerIds.includes(a.ownerId) && w.defenderIds.includes(id)) ||
                  (w.defenderIds.includes(a.ownerId) && w.attackerIds.includes(id))),
            ),
        ),
    )
  )
    return 'Sem província própria livre para mobilização.';
  return null;
}
