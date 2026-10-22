import type { GameView, Battalion } from './types';
import { canBuild, BUILDINGS } from './development';
import { orderCost, reservedResources } from './rules';
export function unitStatus(g: GameView, a: Battalion) {
  const siege = g.provinces.find((p) => p.id === a.provinceId)?.siege;
  if (a.encircled || a.disorganized || a.morale < 25)
    return { id: 'ALERT', label: '⚠️ Sem Suprimento / Moral Baixa' };
  const orders = g.plannedOrders.filter((o) => 'battalionId' in o && o.battalionId === a.id);
  if (
    orders.some((o) =>
      ['MOVE_BATTALION', 'AUTO_TRANSPORT', 'NAVAL_BRIDGE', 'EMBARK_BATTALION'].includes(o.type),
    ) ||
    a.pathQueue.length
  )
    return { id: 'MARCH', label: '🟢 Em Marcha' };
  if (siege?.attackerOwnerId === a.ownerId)
    return { id: 'SIEGE', label: `🏰 Cercando (${siege.progress}/${siege.required})` };
  if (orders.length || a.embarkedOnId || a.stranded)
    return { id: 'BUSY', label: a.embarkedOnId ? '⛵ Embarcado' : '📜 Ordem preparada' };
  return { id: 'IDLE', label: '💤 Aguardando Ordens' };
}
export function availableConstruction(g: GameView, id: string) {
  const actor = g.players.find((p) => p.id === id);
  if (!actor || actor.ready || g.phase !== 'planning') return [];
  return g.provinces
    .filter(
      (p) =>
        p.ownerId === id &&
        !p.occupierId &&
        (Object.keys(BUILDINGS) as import('./types').BuildingType[]).some((b) => {
          const order = { type: 'BUILD_BUILDING' as const, provinceId: p.id, building: b };
          const reserved = reservedResources(
            { ...g, orders: { [id]: g.plannedOrders } },
            id,
            `city:${p.id}`,
          );
          return (
            canBuild(p, b, actor) &&
            orderCost(order, p, actor, g).gold <= actor.gold - reserved.gold
          );
        }),
    )
    .slice(0, 5);
}
