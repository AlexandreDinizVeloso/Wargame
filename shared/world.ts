import type { GameState } from './types';
import { goldRules } from './factions';
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
