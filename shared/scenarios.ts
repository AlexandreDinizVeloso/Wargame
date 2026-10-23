import type { GameMode, Theater } from './types';
export type ScenarioId =
  'CLASSIC' | 'WORLD_GRAND_CAMPAIGN' | 'SHATTERED_EMPIRES' | 'AGE_OF_SAIL' | 'IRON_CROWN_EUROPE';
export const SCENARIOS: {
  id: ScenarioId;
  name: string;
  description: string;
  mode?: GameMode;
  theater?: Theater;
  year: number;
}[] = [
  {
    id: 'WORLD_GRAND_CAMPAIGN',
    name: 'Grande Campanha Global — 1500',
    description:
      '42 territórios e 10 mares; oito nações e bônus pelo domínio dos cinco continentes.',
    mode: 'campaign',
    year: 1500,
  },
  {
    id: 'SHATTERED_EMPIRES',
    name: 'Crise dos Três Impérios — Ação Imediata',
    description:
      'Ato II, quatro províncias por nação, 60 ouro, quartéis, portos e forças ampliadas.',
    mode: 'campaign',
    year: 1550,
  },
  {
    id: 'AGE_OF_SAIL',
    name: 'Era das Grandes Navegações & Talassocracia',
    description: 'Comércio marítimo dobrado; duas frotas por nação costeira e NAV_T1.',
    mode: 'campaign',
    year: 1500,
  },
  {
    id: 'IRON_CROWN_EUROPE',
    name: 'Guerra pela Coroa Continental',
    description: 'Europa com nove territórios, fortes densos, Dieta Imperial e disputa da Coroa.',
    mode: 'quick',
    theater: 'EUROPE',
    year: 1550,
  },
  {
    id: 'CLASSIC',
    name: 'Campanha Clássica — Teatro Livre',
    description: 'Escolha mundo ou teatro, com abertura gradual e regras Gold.',
    year: 1550,
  },
];
export const scenarioOf = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
