import type { GameState, GameView, PeaceTerm, War } from './types';
export function treatyCost(terms: PeaceTerm[]) {
  return terms.reduce(
    (n, t) =>
      n +
      (t.type === 'WHITE_PEACE'
        ? 0
        : t.type === 'CEDE_PROVINCES'
          ? t.provinceIds.length * 20
          : t.type === 'WAR_REPARATIONS'
            ? 25
            : t.type === 'HUMILIATE_DEMILITARIZE'
              ? 30
              : t.type === 'SUBJUGATE_VASSAL'
                ? 75
                : Infinity),
    0,
  );
}
export function treatyPerspective(war: War, actorId: string, concession = false) {
  const attacker = war.attackerLeaderId === actorId;
  const own = attacker ? war.attackerIds : war.defenderIds,
    other = attacker ? war.defenderIds : war.attackerIds;
  const targetId = attacker ? war.defenderLeaderId : war.attackerLeaderId;
  return {
    score: war.warScore * (attacker ? 1 : -1) * (concession ? -1 : 1),
    winnerIds: concession ? other : own,
    loserIds: concession ? own : other,
    targetId,
    winnerId: concession ? targetId : actorId,
    loserId: concession ? actorId : targetId,
  };
}
export function goldWarScore(g: GameState | GameView, w: War) {
  const occupation = g.provinces.reduce((sum, p) => {
    if (!p.ownerId || !p.occupierId) return sum;
    const points = g.players.find((a) => a.id === p.ownerId)?.originalCapitalId === p.id ? 25 : 12;
    return (
      sum +
      (w.attackerIds.includes(p.occupierId) && w.defenderIds.includes(p.ownerId)
        ? points
        : w.defenderIds.includes(p.occupierId) && w.attackerIds.includes(p.ownerId)
          ? -points
          : 0)
    );
  }, 0);
  const blockade = g.provinces
    .filter((p) => p.kind === 'LAND' && p.portLevel > 0 && p.ownerId)
    .reduce((sum, p) => {
      const ownAtt = w.attackerIds.includes(p.ownerId!),
        enemy = ownAtt ? w.defenderIds : w.attackerIds;
      if (!ownAtt && !w.defenderIds.includes(p.ownerId!)) return sum;
      const blocked = g.battalions.some(
        (a) =>
          a.isFleet &&
          !a.stranded &&
          a.warships > 0 &&
          enemy.includes(a.ownerId) &&
          p.neighbors.includes(a.provinceId) &&
          g.provinces.some((q) => q.id === a.provinceId && q.kind === 'SEA_ZONE'),
      );
      return sum + (blocked ? (ownAtt ? -5 : 5) : 0);
    }, 0);
  const battle = Math.max(-40, Math.min(40, (w.battleWins ?? 0) * 4));
  return { score: Math.max(-100, Math.min(100, occupation + battle + blockade)), battle, blockade };
}
