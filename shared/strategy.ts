import { goldRules } from './factions';
import type {
  Battalion,
  GameState,
  GameView,
  GlobalEventId,
  Player,
  SecretObjective,
  Season,
  StrategicResource,
} from './types';
import { atWar, controller, getRelation, unitCount } from './rules';
export const SEASONS: Record<Season, { icon: string; name: string; effect: string }> = {
  SPRING: { icon: '🌱', name: 'Primavera', effect: '+10% recuperação de moral' },
  SUMMER: { icon: '☀️', name: 'Verão', effect: 'Campanhas sem penalidade sazonal' },
  AUTUMN: { icon: '🍂', name: 'Outono', effect: '+15% receita nas terras com trigo' },
  WINTER: {
    icon: '❄️',
    name: 'Inverno',
    effect: 'Atrito hostil dobrado; −25% suprimento e navegação',
  },
};
export const EVENTS: Record<GlobalEventId, { name: string; effect: string }> = {
  GOLD_RUSH: { name: 'Corrida do Ouro', effect: '+50% renda nas Minas de Ouro' },
  HARSH_WINTER: { name: 'Inverno Rigoroso', effect: 'Efeitos de inverno durante duas rodadas' },
  CRUSADE: {
    name: 'Zelo de Cruzada',
    effect: '+10% ataque em guerras entre religiões diferentes',
  },
  MERCENARY_CRISIS: {
    name: 'Crise Mercenária',
    effect: '−40% custo de contratação de mercenários',
  },
  REBEL_AGITATORS: {
    name: 'Agitadores Rebeldes',
    effect: '+12 revolta por rodada em terras não pacificadas',
  },
};
export const RESOURCES: Record<
  NonNullable<StrategicResource>,
  { icon: string; name: string; effect: string }
> = {
  GOLD: { icon: '🪙', name: 'Ouro', effect: 'Receita mineral e especialização comercial' },
  TIMBER: { icon: '🪵', name: 'Madeira', effect: '+10% comércio local de porto' },
  SPICES: { icon: '🌶️', name: 'Especiarias', effect: '+2 comércio local' },
  GRAIN: { icon: '🌾', name: 'Trigo', effect: '+6 suprimento local e +2 suprimento nacional' },
  IRON: {
    icon: '⚒️',
    name: 'Ferro',
    effect: '+8% ataque de infantaria (máx.24%); recrutamento local −15%',
  },
  HORSES: {
    icon: '🐎',
    name: 'Cavalos',
    effect: '+10% ataque de cavalaria (máx.30%); custo local −20%',
  },
  GOLD_MINE: { icon: '🪙', name: 'Mina de Ouro', effect: '+5 imposto base' },
  RELIC: { icon: '🏛️', name: 'Relíquia', effect: '+3 ouro e +10% recuperação nacional de moral' },
};
export const seasonAt = (turn: number): Season =>
  (['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const)[(turn - 1) % 4];
export const winterActive = (g: Pick<GameState, 'season' | 'globalEvent' | 'turn'>) =>
  g.season === 'WINTER' ||
  (g.globalEvent?.id === 'HARSH_WINTER' && g.globalEvent.endsTurn >= g.turn);
export const resourceCount = (
  g: Pick<GameState, 'provinces'>,
  id: string,
  resource: StrategicResource,
) =>
  g.provinces.filter(
    (p) => p.kind === 'LAND' && controller(p) === id && p.strategicResource === resource,
  ).length;
export const globalSupplyBonus = (g: Pick<GameState, 'provinces'>, id: string) =>
  resourceCount(g, id, 'GRAIN') * 2;
export const coalitionFighter = (g: Pick<GameState, 'wars'>, id: string) =>
  g.wars.some((w) => w.active && w.casusBelli === 'COALITION' && w.attackerIds.includes(id));
export const hegemonicThreat = (g: Pick<GameState, 'provinces' | 'players'>, id: string) =>
  (g.players.find((p) => p.id === id)?.aggressiveExpansion ?? 0) >= (goldRules(g) ? 55 : 60) ||
  g.provinces.filter((p) => p.kind === 'LAND' && controller(p) === id).length /
    Math.max(1, g.provinces.filter((p) => p.kind === 'LAND').length) >=
    0.4;
export const isCamouflaged = (g: Pick<GameState, 'provinces' | 'players'>, a: Battalion) =>
  g.players.find((p) => p.id === a.ownerId)?.nationId === 'veridia' &&
  !a.isFleet &&
  !a.embarkedOnId &&
  g.provinces.some(
    (p) =>
      p.id === a.provinceId &&
      p.ownerId === a.ownerId &&
      controller(p) === a.ownerId &&
      ['forest', 'hills'].includes(p.terrain),
  );
export function objectiveCards(g: GameState, p: Player): SecretObjective[] {
  const land = g.provinces.filter((q) => q.kind === 'LAND'),
    n = land.length;
  const special = land.filter(
    (q) => q.strategicResource === 'GOLD_MINE' || q.strategicResource === 'RELIC',
  ).length;
  const coast = land.filter((q) => q.isCoastal).length;
  const rivals = g.players.filter((q) => q.id !== p.id);
  const rival = rivals[(g.seed + g.players.indexOf(p)) % rivals.length];
  const req = (key: string, label: string, target: number) => ({ key, label, target });
  const cards: SecretObjective[] = [
    {
      id: `${p.id}-WEALTH`,
      kind: 'WEALTH',
      name: 'Senhor das Riquezas',
      requirements: [
        req('land', 'Províncias controladas', Math.max(5, Math.ceil(n * 0.4))),
        req('special', 'Minas de Ouro ou Relíquias', Math.min(2, Math.max(1, special - 1))),
        req('gold', 'Ouro no tesouro', g.mode === 'quick' ? 450 : 900),
        req('pacified', 'Todas as províncias pacificadas (≥80)', 1),
      ],
    },
    {
      id: `${p.id}-SEAS`,
      kind: 'SEAS',
      name: 'Império dos Mares',
      requirements: [
        req('coast', 'Províncias costeiras', Math.max(4, Math.ceil(coast * 0.45))),
        req('ports', 'Províncias com porto', Math.max(3, Math.ceil(coast * 0.3))),
        req('navy', 'Maior frota naval (sem empate)', 1),
        req('warships', 'Navios de guerra', 6),
      ],
    },
    {
      id: `${p.id}-RIVALRY`,
      kind: 'RIVALRY',
      name: 'Rivalidade Mortal & Expansão',
      rivalId: rival.id,
      capitalId: rival.originalCapitalId ?? undefined,
      requirements: [
        req('rival', 'Capital original rival ocupada ou anexada', 1),
        req('share', 'Percentual de terras', 55),
      ],
    },
    {
      id: `${p.id}-PAX`,
      kind: 'PAX',
      name: 'Pax Hegemônica',
      requirements: [
        req('partners', 'Vassalos ou aliados com confiança ≥30', Math.min(2, g.players.length - 1)),
        req('share', 'Percentual de terras', 55),
        req('streak', 'Rodadas com maior exército e estabilidade ≥85', 3),
        req('stability', 'Estabilidade', 85),
      ],
    },
  ];
  const preferred =
    p.nationId === 'vespera'
      ? 'SEAS'
      : p.nationId === 'aurelia'
        ? 'PAX'
        : p.nationId === 'turan' || p.nationId === 'ferro_norte'
          ? 'RIVALRY'
          : 'WEALTH';
  const first = cards.find((c) => c.kind === preferred)!;
  const rest = cards.filter((c) => c !== first);
  return [first, rest[(g.seed + g.players.indexOf(p)) % rest.length]];
}
export function objectiveProgress(
  g: Pick<GameState, 'provinces' | 'players' | 'battalions' | 'relations'> | GameView,
  p: Player,
  card: SecretObjective,
) {
  const owned = g.provinces.filter((q) => q.kind === 'LAND' && controller(q) === p.id),
    land = g.provinces.filter((q) => q.kind === 'LAND');
  const size = (id: string, naval: boolean) =>
    g.battalions
      .filter((a) => a.ownerId === id && a.isFleet === naval)
      .reduce((n, a) => n + unitCount(a), 0);
  const values: Record<string, number> = {
    land: owned.length,
    special: owned.filter(
      (q) => q.strategicResource === 'GOLD_MINE' || q.strategicResource === 'RELIC',
    ).length,
    gold: p.gold,
    pacified: Number(owned.length > 0 && owned.every((q) => q.pacification >= 80 && q.unrest < 50)),
    coast: owned.filter((q) => q.isCoastal).length,
    ports: owned.filter((q) => q.isCoastal && q.portLevel > 0).length,
    navy: Number(
      size(p.id, true) > 0 &&
        g.players.filter((q) => q.id !== p.id).every((q) => size(p.id, true) > size(q.id, true)),
    ),
    rival: Number(!!card.rivalId && !!card.capitalId && owned.some((q) => q.id === card.capitalId)),
    share: (owned.length / Math.max(1, land.length)) * 100,
    partners: g.players.filter(
      (q) =>
        q.id !== p.id &&
        (q.subjectOfId === p.id ||
          (getRelation(g, p.id, q.id)?.allied && (getRelation(g, p.id, q.id)?.trust ?? 0) >= 30)),
    ).length,
    streak: p.paxStreak,
    stability: p.stability,
    warships: g.battalions
      .filter((a) => a.ownerId === p.id && a.isFleet)
      .reduce((n, a) => n + a.warships, 0),
  };
  return card.requirements.map((r) => ({
    ...r,
    value: values[r.key] ?? 0,
    progress: Math.min(1, (values[r.key] ?? 0) / r.target),
  }));
}
export function hasReligiousWar(g: Pick<GameState, 'players' | 'wars'>, id: string) {
  const p = g.players.find((q) => q.id === id);
  return !!p && g.players.some((q) => q.faith !== p.faith && atWar(g, id, q.id));
}

export function effectiveSupply(
  g: Pick<GameState, 'provinces' | 'players' | 'season' | 'globalEvent' | 'turn'>,
  id: string,
  p: import('./types').Province,
) {
  const ironNorth = g.players.find((q) => q.id === id)?.nationId === 'ferro_norte';
  const local =
    p.baseSupplyLimit +
    (p.strategicResource === 'GRAIN' ? 6 : 0) +
    p.fortLevel * 3 +
    (p.isCoastal ? p.portLevel * 4 : 0) +
    (p.pacification >= 80 ? 2 : 0) +
    (ironNorth && p.terrain === 'forest' ? Math.max(0, 18 - p.baseSupplyLimit) : 0);
  return (local + globalSupplyBonus(g, id)) * (winterActive(g) && !ironNorth ? 0.75 : 1);
}
