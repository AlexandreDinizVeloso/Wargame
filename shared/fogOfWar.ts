import type { GameState } from './types';
type World = Pick<
  GameState,
  'players' | 'provinces' | 'battalions' | 'relations' | 'turn' | 'phase' | 'winnerId'
> &
  Partial<Pick<GameState, 'matchConfig' | 'visionContracts'>>;
export function verticalRules(state: unknown): boolean {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as { matchConfig?: { verticalSlice?: boolean } }).matchConfig?.verticalSlice === true
  );
}
export function visionPartners(
  state: Pick<World, 'players' | 'relations'>,
  viewer: string,
): Set<string> {
  const ids = new Set([viewer]);
  const me = state.players.find((p) => p.id === viewer);
  for (const p of state.players) {
    if (
      p.subjectOfId === viewer ||
      me?.subjectOfId === p.id ||
      (me?.subjectOfId && p.subjectOfId === me.subjectOfId) ||
      state.relations.some(
        (r) => r.allied && ((r.a === viewer && r.b === p.id) || (r.b === viewer && r.a === p.id)),
      )
    )
      ids.add(p.id);
  }
  return ids;
}
export function computeVisibleProvinces(state: World, viewerPlayerId: string | null): Set<string> {
  if (!viewerPlayerId || state.phase === 'finished' || state.winnerId !== null)
    return new Set(state.provinces.map((p) => p.id));
  const partners = visionPartners(state, viewerPlayerId);
  const anchors = new Set(
    state.provinces
      .filter((p) => partners.has(p.ownerId ?? '') || partners.has(p.occupierId ?? ''))
      .map((p) => p.id),
  );
  for (const army of state.battalions) if (partners.has(army.ownerId)) anchors.add(army.provinceId);
  const visible = new Set(anchors);
  for (const province of state.provinces)
    if (anchors.has(province.id)) for (const neighbor of province.neighbors) visible.add(neighbor);
  for (const contract of state.visionContracts ?? [])
    if (contract.buyerId === viewerPlayerId && contract.untilTurn >= state.turn) {
      for (const p of state.provinces)
        if (p.ownerId === contract.targetId || p.occupierId === contract.targetId)
          visible.add(p.id);
      for (const a of state.battalions)
        if (a.ownerId === contract.targetId) visible.add(a.provinceId);
    }
  return visible;
}
