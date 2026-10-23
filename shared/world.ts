import type { GameState, Season } from './types';
import { goldRules } from './factions';
export const SEASON_LENGTH = 3;
export const SEASON_ORDER = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
const ordinarySeason = {
  manpowerMultiplier: 1,
  riverAttackMultiplier: 0.85,
  landMovementBonus: 0,
  landAttackMultiplier: 1,
  siegeProgressBonus: 0,
  tradeMultiplier: 1,
  marketPortCostMultiplier: 1,
  campaignUpkeepMultiplier: 1,
  winterAttritionRate: 0,
  winterMoraleLoss: 0,
};
export const SEASON_RULES = {
  SPRING: {
    ...ordinarySeason,
    icon: '🌱',
    name: 'Primavera',
    title: 'Despertar & Mobilização',
    effect: 'Recrutas ×2; travessias de rio reduzem o ataque em 25%.',
    manpowerMultiplier: 2,
    riverAttackMultiplier: 0.75,
  },
  SUMMER: {
    ...ordinarySeason,
    icon: '☀️',
    name: 'Verão',
    title: 'Era das Grandes Campanhas',
    effect: '+1 alcance terrestre, +15% ataque terrestre e +1 progresso de cerco por rodada.',
    landMovementBonus: 1,
    landAttackMultiplier: 1.15,
    siegeProgressBonus: 1,
  },
  AUTUMN: {
    ...ordinarySeason,
    icon: '🍂',
    name: 'Outono',
    title: 'Colheita & Frota Mercante',
    effect: 'Comércio terrestre e marítimo ×2; construir Mercado ou Porto custa 25% menos.',
    tradeMultiplier: 2,
    marketPortCostMultiplier: 0.75,
  },
  WINTER: {
    ...ordinarySeason,
    icon: '❄️',
    name: 'Inverno',
    title: 'O Grande Inverno Implacável',
    effect:
      'Fora de território próprio pacificado: pelo menos 20% de atrito e −15 moral; manutenção em campanha +50%.',
    campaignUpkeepMultiplier: 1.5,
    winterAttritionRate: 0.2,
    winterMoraleLoss: 15,
  },
} satisfies Record<
  Season,
  typeof ordinarySeason & { icon: string; name: string; title: string; effect: string }
>;
export const seasonAt = (turn: number): Season =>
  SEASON_ORDER[
    Math.floor((Math.max(1, Math.floor(turn)) - 1) / SEASON_LENGTH) % SEASON_ORDER.length
  ];
export function seasonProgress(turn: number) {
  const normalized = Math.max(1, Math.floor(turn)),
    season = seasonAt(normalized),
    index = ((normalized - 1) % SEASON_LENGTH) + 1;
  return {
    season,
    index,
    remaining: SEASON_LENGTH - index,
    nextSeason: SEASON_ORDER[(SEASON_ORDER.indexOf(season) + 1) % SEASON_ORDER.length],
  };
}
export const seasonRulesFor = (season: Season) => SEASON_RULES[season];
export const seasonRulesAt = (turn: number) => seasonRulesFor(seasonAt(turn));
export type CampaignEra = 'ERA_CONSOLIDATION' | 'ERA_EMPIRES' | 'ERA_HEGEMONY';
export const ERAS = {
  ERA_CONSOLIDATION: {
    name: 'Era das Fronteiras',
    act: 'ATO I',
    icon: '🌱',
    description: 'Pacificação e expansão neutra mais baratas; pacto inicial nas rodadas 1–2.',
  },
  ERA_EMPIRES: {
    name: 'Era do Comércio & Impérios',
    act: 'ATO II',
    icon: '⚓',
    description: 'Nós marítimos +35%; neutros fortificados; doutrinas Tier 2 −10%.',
  },
  ERA_HEGEMONY: {
    name: 'Era da Guerra Total & Hegemonia',
    act: 'ATO III',
    icon: '👑',
    description: 'Cerco +1; Autoridade e pontuação de batalha dobrados.',
  },
} as const;
export const campaignEra = (turn: number): CampaignEra =>
  turn <= 8 ? 'ERA_CONSOLIDATION' : turn <= 20 ? 'ERA_EMPIRES' : 'ERA_HEGEMONY';
export const eraTradeMultiplier = (g: unknown) =>
  goldRules(g) && campaignEra((g as { turn: number }).turn) !== 'ERA_CONSOLIDATION' ? 1.35 : 1;
export const technologyCost = (g: Pick<GameState, 'turn'>, tier: number, base: number) =>
  base * (goldRules(g) && tier === 2 && g.turn >= 9 ? 0.9 : 1);
