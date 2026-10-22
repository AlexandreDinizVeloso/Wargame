import type { Battalion, GameState, Province } from './types';
export const MARITIME_CAP = 12;
export const BOMBARDMENT_COST = 6;
export const SEA_TRADE_VALUE: Record<string, number> = {
  'north-atlantic': 6,
  'south-atlantic': 5,
  'caribbean-sea': 4,
  'north-pacific': 4,
  'south-pacific': 3,
  'western-med': 5,
  'eastern-med': 5,
  baltic: 4,
  arctic: 3,
  'indian-west': 6,
  'indian-east': 5,
  'south-china-sea': 6,
  'east-asian-sea': 5,
};
type NavalWorld = Pick<GameState, 'provinces' | 'battalions' | 'players' | 'wars'>;
const enemies = (g: Pick<GameState, 'wars'>, a: string, b: string) =>
  g.wars.some(
    (w) =>
      w.active &&
      ((w.attackerIds.includes(a) && w.defenderIds.includes(b)) ||
        (w.defenderIds.includes(a) && w.attackerIds.includes(b))),
  );
export function seaTradeNodes(g: NavalWorld) {
  const active = new Set(
    g.provinces.filter((p) => p.kind === 'LAND' && p.ownerId).map((p) => p.ownerId),
  );
  return g.provinces
    .filter((p) => p.kind === 'SEA_ZONE')
    .map((sea) => {
      const fleets = g.battalions.filter(
        (a) =>
          a.isFleet &&
          !a.stranded &&
          !a.embarkedArmyId &&
          a.morale >= 25 &&
          a.provinceId === sea.id &&
          active.has(a.ownerId),
      );
      const contenders = [...new Set(fleets.map((f) => f.ownerId))]
        .map((ownerId) => {
          const group = fleets.filter((f) => f.ownerId === ownerId),
            warships = group.reduce((n, a) => n + a.warships, 0),
            transports = group.reduce((n, a) => n + a.transports, 0);
          return { ownerId, warships, transports, power: warships * 2 + transports };
        })
        .filter((c) => c.warships >= 1 && c.transports >= 1)
        .sort((a, b) => b.power - a.power || a.ownerId.localeCompare(b.ownerId));
      const leading = contenders[0],
        tie = !!leading && contenders[1]?.power === leading.power;
      const contested =
        !!leading &&
        (tie ||
          g.battalions.some(
            (f) =>
              f.isFleet &&
              !f.stranded &&
              f.warships > 0 &&
              f.provinceId === sea.id &&
              enemies(g, leading.ownerId, f.ownerId),
          ));
      return {
        seaId: sea.id,
        name: sea.name,
        value: SEA_TRADE_VALUE[sea.id] ?? 3,
        ownerId: leading && !contested ? leading.ownerId : null,
        contested,
        contenders,
      };
    });
}
export const maritimeIncome = (g: NavalWorld, id: string) =>
  Math.min(
    MARITIME_CAP,
    seaTradeNodes(g).reduce((n, s) => n + (s.ownerId === id ? s.value : 0), 0),
  );
export function bombardmentBlock(
  g: NavalWorld & Pick<GameState, 'turn'>,
  a: Battalion,
  target: Province,
) {
  const sea = g.provinces.find((p) => p.id === a.provinceId);
  const owner = target.occupierId ?? target.ownerId;
  if (!a.isFleet || a.stranded || a.warships < 3 || a.morale < 25)
    return 'Bombardeio exige frota operacional com três navios de guerra e moral ≥25.';
  if (
    sea?.kind !== 'SEA_ZONE' ||
    target.kind !== 'LAND' ||
    !target.isCoastal ||
    !sea.neighbors.includes(target.id)
  )
    return 'A frota precisa estar no mar adjacente à costa.';
  if (owner === a.ownerId || (owner && !enemies(g, a.ownerId, owner)))
    return 'Alvo deve ser neutro ou uma costa inimiga em guerra.';
  if (
    g.battalions.some(
      (f) =>
        f.isFleet && f.warships > 0 && f.provinceId === sea.id && enemies(g, a.ownerId, f.ownerId),
    )
  )
    return 'Elimine ou afaste a frota hostil antes de bombardear.';
  if (target.coastalBombardment?.startedTurn === g.turn)
    return 'Esta costa já recebeu bombardeio nesta rodada.';
  return null;
}
