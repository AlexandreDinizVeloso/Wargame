import { goldRules } from '../shared/factions';
import { orderKey, reservedResources } from '../shared/rules';
import type { GameView, PlayerOrder } from '../shared/types';
/** Immutable city/formation queues: changing one formation never removes another's order. */
export function replacePlannedOrder(previous: PlayerOrder[], order: PlayerOrder): PlayerOrder[] {
  const key = orderKey(order);
  return [...previous.filter((existing) => orderKey(existing) !== key), order];
}
export function removePlannedOrder(previous: PlayerOrder[], key: string): PlayerOrder[] {
  return previous.filter((order) => orderKey(order) !== key);
}
export function queuedGoldCost(game: GameView, playerId: string): number {
  return reservedResources({ ...game, orders: { [playerId]: game.plannedOrders } }, playerId).gold;
}
export function orderName(o: PlayerOrder, game?: GameView, playerId?: string) {
  switch (o.type) {
    case 'RECRUIT_BATTALION':
      return o.isFleet ? 'Construir frota' : 'Recrutar batalhão';
    case 'MOVE_BATTALION':
      return 'Marchar / navegar';
    case 'AUTO_TRANSPORT':
      return o.fleetId
        ? 'Ponte naval automática (grátis)'
        : `⛵ Travessia Marítima (${goldRules(game) && game?.players.find((p) => p.id === playerId)?.nationId === 'vespera' ? '8' : '15'} Ouro)`;
    case 'BOMBARD_COAST':
      return 'Bombardear costa (6 ouro)';
    case 'NAVAL_BRIDGE':
      return 'Ponte naval';
    case 'ASSAULT_SIEGE':
      return 'Assaltar muralha';
    case 'BUILD_BUILDING':
      return `Construir ${o.building}`;
    case 'DEMOLISH_BUILDING':
      return `Demolir ${o.building}`;
    case 'MERGE_ALL':
      return 'Fundir agora';
    case 'ENTRENCH_BATTALION':
      return 'Entrincheirar';
    case 'TRAIN_BATTALION':
      return 'Treinar batalhão';
    case 'MERGE_BATTALIONS':
      return 'Fundir formações';
    case 'SPLIT_BATTALION':
      return 'Dividir formação';
    case 'EMBARK_BATTALION':
      return o.fleetId ? 'Embarcar' : 'Desembarcar';
    case 'BUILD_FORT':
      return 'Construir forte';
    case 'BUILD_PORT':
      return 'Construir porto';
    case 'BUILD_MARKET':
      return 'Construir mercado';
    case 'PACIFY':
      return 'Pacificar';
    case 'CONVERT':
      return 'Converter fé';
    case 'DIPLOMACY':
      return 'Diplomacia';
  }
}
