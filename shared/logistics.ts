import type { Battalion, GameState } from './types';
import { atWar, controller, getRelation, sameWarSide } from './rules';
export function supplyConnected(
  g: Pick<GameState, 'provinces' | 'battalions' | 'wars' | 'relations' | 'players'>,
  army: Battalion,
) {
  const own = g.provinces.filter(
    (p) => p.kind === 'LAND' && p.ownerId === army.ownerId && !p.occupierId,
  );
  if (!own.length) return false;
  const roots = new Set(own.map((p) => p.id)),
    lookup = new Map(g.provinces.map((p) => [p.id, p]));
  const friendly = (id: string | null) =>
    id === army.ownerId ||
    !!(
      id &&
      (getRelation(g, army.ownerId, id)?.allied ||
        sameWarSide(g, army.ownerId, id) ||
        g.players.find((p) => p.id === id)?.subjectOfId === army.ownerId)
    );
  const hostileSea = (id: string) =>
    g.battalions.some(
      (f) =>
        f.isFleet && f.warships > 0 && f.provinceId === id && atWar(g, army.ownerId, f.ownerId),
    );
  const suppliedSeas = new Set(
    g.provinces
      .filter(
        (p) =>
          p.kind === 'SEA_ZONE' &&
          !hostileSea(p.id) &&
          (g.battalions.some(
            (f) => f.isFleet && friendly(f.ownerId) && !f.stranded && f.provinceId === p.id,
          ) ||
            p.neighbors.some((id) => {
              const q = lookup.get(id);
              return q && friendly(controller(q)) && q.portLevel > 0;
            })),
      )
      .map((p) => p.id),
  );
  const queue = [army.provinceId],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const p = lookup.get(queue[i]);
    if (!p) continue;
    if (roots.has(p.id)) return true;
    for (const id of p.neighbors) {
      const q = lookup.get(id);
      if (!q || seen.has(id)) continue;
      if (q.kind === 'SEA_ZONE' ? !suppliedSeas.has(q.id) : !friendly(controller(q))) continue;
      const strait = p.straitSeaIds?.[q.id];
      if (strait && hostileSea(strait)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  return false;
}
