import type { GameView, PlayerOrder, Province } from '../shared/types';
export function legalDestination(game: GameView, actorId: string, target: Province) {
  if (!target.ownerId || target.ownerId === actorId) return true;
  const r = game.relations.find(
    (r) =>
      (r.a === actorId && r.b === target.ownerId) || (r.b === actorId && r.a === target.ownerId),
  );
  if (r?.militaryAccess.includes(actorId) && !r.atWar) return true;
  return !r?.allied && (r?.truceUntil ?? 0) < game.turn;
}
export function orderName(o: PlayerOrder) {
  switch (o.type) {
    case 'MOVE_ATTACK':
      return 'Marcha';
    case 'RECRUIT':
      return `Recrutar ${o.amount}`;
    case 'TRAIN':
      return 'Treinar exército';
    case 'PACIFY':
      return 'Pacificar';
    case 'CONVERT':
      return 'Missão religiosa';
    case 'BUILD_FORT':
      return 'Construir forte';
    case 'DEVELOP':
      return 'Investir no comércio';
    case 'DIPLOMACY':
      return 'Ação diplomática';
  }
}
