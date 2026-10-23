import type { GameState, NationId } from './types';
export interface FactionTrait {
  name: string;
  effects: string[];
}
export const FACTION_TRAITS: Record<NationId, FactionTrait> = {
  vespera: {
    name: 'Talassocracia Mercante',
    effects: [
      'Portos adjacentes: +50% poder nos nós marítimos',
      'Fretamento pela metade (aprox. 8 ouro)',
      'Mercado: +1 recrutamento de infantaria/mercenários',
    ],
  },
  aurelia: {
    name: 'Pax Hegemônica Solar',
    effects: [
      '+50% velocidade de pacificação',
      'Templos: +2 estabilidade extra por nível',
      'Início em templo de fé Solar: moral máxima 110',
    ],
  },
  kaldor: {
    name: 'Mestres da Artilharia de Cerco',
    effects: [
      'Artilharia: −25% recrutamento e manutenção',
      'Com Fundição: +1 progresso em todos os cercos',
      'Com Fundição: +15% poder de artilharia',
    ],
  },
  turan: {
    name: 'Senhores da Horda Nômade',
    effects: [
      'Cavalaria sem Quartel; −20% manutenção de cavalaria',
      'Maioria de cavalaria: −25% consumo de suprimento',
      'Maioria de cavalaria: +20% ataque em planícies',
    ],
  },
  ferro_norte: {
    name: 'Invasores de Fiordes',
    effects: [
      'Florestas não aumentam o custo de marcha; congelamento sazonal afeta todas as nações',
      'Travessias e desembarques sem penalidade adicional',
      'Infantaria: +15% choque no primeiro turno de guerra',
    ],
  },
  sapiencia: {
    name: 'Vanguarda Científica & Doutrinária',
    effects: [
      '+35% experiência em batalhas e cercos',
      'Mercados, Quartéis, Fortes e Fundições: −15% construção/melhoria',
    ],
  },
  sol_invicto: {
    name: 'Bastião Zelote Inquebrável',
    effects: [
      'Fortes: +25% defesa e +1 resistência de cerco',
      'Defesa da Pátria: recarga de seis turnos',
      'Mobilização: moral 100 e treinamento 1,25',
    ],
  },
  veridia: {
    name: 'Guerrilha & Emboscada Nativa',
    effects: [
      'Florestas/montanhas: +20% ataque e defesa',
      'Invasores em terras próprias pacificadas/originais: atrito dobrado',
    ],
  },
};
export const goldRules = (g: unknown): boolean =>
  !!g &&
  typeof g === 'object' &&
  (g as { matchConfig?: { ruleset?: string } }).matchConfig?.ruleset === 'GOLD_098';
export const FRIEND_PASS = { enabled: true, guestsNeedPurchase: false, maximumPlayers: 8 } as const;
export const factionXP = (g: unknown, nation: NationId, amount: number) =>
  amount * (goldRules(g) && nation === 'sapiencia' ? 1.35 : 1);
export const hasFoundry = (g: Pick<GameState, 'provinces'>, id: string) =>
  g.provinces.some((p) => (p.occupierId ?? p.ownerId) === id && p.foundryLevel > 0);
