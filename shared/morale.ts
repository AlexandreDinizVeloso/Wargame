import type { Battalion, GameState, Province } from './types';
type MoraleWorld = Pick<GameState, 'relations' | 'wars' | 'players'>;
export const isDisorganized = (a: Battalion) => !a.isFleet && (a.disorganized || a.morale < 25);
export function friendlyRest(g: MoraleWorld, id: string, p: Province) {
  const owner = p.occupierId ?? p.ownerId;
  if (!owner || p.kind !== 'LAND') return false;
  return (
    owner === id ||
    g.relations.some(
      (r) => r.allied && ((r.a === id && r.b === owner) || (r.b === id && r.a === owner)),
    ) ||
    g.wars.some(
      (w) =>
        w.active &&
        [w.attackerIds, w.defenderIds].some((side) => side.includes(id) && side.includes(owner)),
    ) ||
    g.players.some((q) => q.id === owner && q.subjectOfId === id)
  );
}
export function offensiveBlock(g: MoraleWorld, a: Battalion, target: Province) {
  return isDisorganized(a) && !friendlyRest(g, a.ownerId, target)
    ? 'Formação desorganizada: descanse uma rodada sem mover ou lutar em território amigo. Ofensivas exigem moral de pelo menos 25.'
    : null;
}
export function markDisorganized(a: Battalion) {
  if (!a.isFleet && a.morale < 25) a.disorganized = true;
}
