import { integerEventText } from '../shared/economy';
import type { GameNotification, GameState } from '../shared/types';
import { nextId } from './state';
export function notify(g: GameState, data: Omit<GameNotification, 'id' | 'turn'>) {
  data = { ...data, text: integerEventText(data.text) };
  const ids = [...new Set(data.involvesPlayerIds)].filter((id) =>
    g.players.some((p) => p.id === id),
  );
  const existing = g.notifications.find(
    (n) =>
      n.turn === g.turn &&
      n.type === data.type &&
      n.text === data.text &&
      n.offerId === data.offerId &&
      n.focusProvinceId === data.focusProvinceId &&
      n.involvesPlayerIds.join() === ids.join(),
  );
  if (existing) return existing;
  const n: GameNotification = {
    ...data,
    involvesPlayerIds: ids,
    id: nextId(g, 'notice'),
    turn: g.turn,
  };
  g.notifications.push(n);
  g.notifications = g.notifications.slice(-250);
  return n;
}
export function canSeeNotification(n: GameNotification, id: string) {
  return n.type === 'WORLD' || n.involvesPlayerIds.includes(id);
}
