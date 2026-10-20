export type Objective = 'conquest' | 'prosperity' | 'concord' | 'faith';
export type Doctrine = 'tolerant' | 'devout';
export type GameMode = 'quick' | 'campaign';
export type Action = 'move' | 'recruit' | 'train' | 'develop' | 'pacify' | 'convert';
export interface Order {
  provinceId: string;
  action: Action;
  targetId?: string;
  amount?: number;
}
export interface Player {
  id: string;
  name: string;
  color: string;
  nation: string;
  faith: string;
  objective: Objective;
  doctrine: Doctrine;
  bot: boolean;
  online: boolean;
  gold: number;
  manpower: number;
  influence: number;
  ready: boolean;
  peaceTurns: number;
  wonBattles: number;
  conversions: number;
  score: number;
  warExhaustion: number;
}
export interface Province {
  id: string;
  name: string;
  col: number;
  row: number;
  x: number;
  y: number;
  neighbors: string[];
  resource: 'grain' | 'trade' | 'iron' | 'shrine';
  ownerId: string | null;
  troops: number;
  morale: number;
  training: number;
  unrest: number;
  development: number;
  faith: string;
  conversion: number;
  capital: boolean;
}
export interface Relation {
  a: string;
  b: string;
  allied: boolean;
  truceUntil: number;
  trust: number;
}
export interface Offer {
  id: string;
  from: string;
  to: string;
  kind: 'alliance';
}
export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  kind: 'battle' | 'economy' | 'diplomacy' | 'system';
}
export interface ChatEntry {
  id: number;
  playerId: string;
  text: string;
}
export interface GameState {
  code: string;
  hostId: string;
  phase: 'lobby' | 'planning' | 'finished';
  turn: number;
  maxTurns: number;
  targetScore: number;
  seed: number;
  players: Player[];
  provinces: Province[];
  relations: Relation[];
  offers: Offer[];
  orders: Record<string, Order[]>;
  log: LogEntry[];
  chat: ChatEntry[];
  winnerId: string | null;
  mode: GameMode;
  turnSeconds: number;
  deadline: number | null;
  demo: boolean;
}
export type GameView = Omit<GameState, 'orders' | 'seed'> & { myOrders: Order[] };
export const OBJECTIVES: Record<Objective, { name: string; description: string; formula: string }> =
  {
    conquest: {
      name: 'Supremacia',
      description: 'Expanda suas fronteiras e vença batalhas.',
      formula: '1 ponto por província + 1 a cada 2 batalhas vencidas.',
    },
    prosperity: {
      name: 'Prosperidade',
      description: 'Construa uma economia que sustente seu império.',
      formula: '2 por nível de desenvolvimento + 1 a cada 30 de ouro + 1 por entreposto estável.',
    },
    concord: {
      name: 'Concórdia',
      description: 'Estabilize províncias e cultive alianças.',
      formula: '1 por província estável + até 6 por turnos de paz + 2 por aliança.',
    },
    faith: {
      name: 'Legado espiritual',
      description: 'Espalhe sua crença e integre as novas comunidades.',
      formula: '2 por província estável da sua crença + 1 a cada 2 conversões.',
    },
  };
export const ACTIONS: Record<
  Action,
  { name: string; description: string; gold: number; manpower: number; influence: number }
> = {
  move: {
    name: 'Marchar',
    description: 'Mova tropas para uma vizinha. Entrar em território inimigo inicia combate.',
    gold: 0,
    manpower: 0,
    influence: 0,
  },
  recruit: {
    name: 'Recrutar',
    description: 'Adicione 3 recrutas. Eles começam com treinamento e moral menores.',
    gold: 9,
    manpower: 3,
    influence: 0,
  },
  train: {
    name: 'Treinar',
    description: '+18 de treinamento e +8 de moral para as tropas presentes.',
    gold: 6,
    manpower: 0,
    influence: 0,
  },
  develop: {
    name: 'Desenvolver',
    description: '+1 nível (máximo 3). Cada nível acrescenta 2 à renda base.',
    gold: 16,
    manpower: 0,
    influence: 0,
  },
  pacify: {
    name: 'Pacificar',
    description: 'Reduza a revolta em 25. Uma província com até 25 é estável.',
    gold: 8,
    manpower: 0,
    influence: 0,
  },
  convert: {
    name: 'Enviar missão',
    description:
      'Avance 50% na conversão. Duas missões mudam a crença; cada uma gera 6 de revolta.',
    gold: 8,
    manpower: 0,
    influence: 2,
  },
};
export const FACTIONS = [
  { nation: 'Portugal', color: '#d5ac68', faith: 'Catolicismo' },
  { nation: 'Coroa de Castela', color: '#ce7c83', faith: 'Catolicismo' },
  { nation: 'França', color: '#8bb8d4', faith: 'Catolicismo' },
  { nation: 'Inglaterra', color: '#c995bc', faith: 'Anglicanismo' },
  { nation: 'Sacro Império', color: '#a6b978', faith: 'Catolicismo' },
  { nation: 'República de Veneza', color: '#72b7a5', faith: 'Catolicismo' },
  { nation: 'Império Otomano', color: '#e5a075', faith: 'Islã sunita' },
  { nation: 'Polônia', color: '#9197d1', faith: 'Catolicismo' },
];
export function orderCost(order: Order, province: Province) {
  const cost = { ...ACTIONS[order.action] };
  return {
    gold: cost.gold + (order.action === 'develop' ? province.development * 8 : 0),
    manpower: cost.manpower,
    influence: cost.influence,
  };
}
export function incomeOf(p: Province) {
  const base = { grain: 4, trade: 6, iron: 3, shrine: 3 }[p.resource];
  return Math.max(1, Math.floor((base + p.development * 2) * (1 - p.unrest / 150)));
}
export function economyOf(provinces: Province[], playerId: string) {
  const owned = provinces.filter((p) => p.ownerId === playerId);
  const income = owned.reduce((n, p) => n + incomeOf(p), 0);
  const upkeep = Math.ceil(owned.reduce((n, p) => n + p.troops, 0) / 3);
  return {
    income,
    upkeep,
    net: income - upkeep,
    manpower: owned.reduce((n, p) => n + (p.resource === 'grain' ? 2 : 1), 0),
    owned,
  };
}
