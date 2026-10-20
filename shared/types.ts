import type { ProvinceStaticData, Terrain } from './map';
export type Objective = 'conquest' | 'prosperity' | 'concord' | 'faith';
export type Doctrine = 'tolerant' | 'devout';
export type GameMode = 'quick' | 'campaign';
export type ReligionId =
  'Catolicismo' | 'Anglicanismo' | 'Protestantismo' | 'Ortodoxia' | 'Islã sunita';
export type BotArchetype = 'Militarist' | 'Merchant' | 'Theocrat' | 'Diplomat';
export type MapMode = 'POLITICAL' | 'RELIGIOUS' | 'ECONOMIC_SUPPLY' | 'DIPLOMATIC' | 'UNREST';
export interface ProvinceRuntimeState {
  ownerId: string | null;
  troops: number;
  mercenaries: number;
  morale: number;
  training: number;
  religion: ReligionId;
  pacification: number;
  unrest: number;
  fortLevel: number;
  development: number;
  capital: boolean;
  conversion: number;
  conversionReligion: ReligionId | null;
  conversionInstigatorId: string | null;
}
export type DiplomacyAction =
  | 'PROPOSE_ALLIANCE'
  | 'BREAK_ALLIANCE'
  | 'DEMAND_TRIBUTE'
  | 'EMBARGO'
  | 'FUND_REBELS'
  | 'MILITARY_ACCESS'
  | 'SEND_SUBSIDY';
export interface MoveAttackOrder {
  type: 'MOVE_ATTACK';
  fromProvinceId: string;
  toProvinceId: string;
  troops: number;
}
export interface RecruitOrder {
  type: 'RECRUIT';
  provinceId: string;
  amount: number;
  isMercenary?: boolean;
}
export interface TrainOrder {
  type: 'TRAIN';
  provinceId: string;
}
export interface PacifyOrder {
  type: 'PACIFY';
  provinceId: string;
}
export interface ConvertOrder {
  type: 'CONVERT';
  targetProvinceId: string;
}
export interface BuildFortOrder {
  type: 'BUILD_FORT';
  provinceId: string;
}
export interface DevelopOrder {
  type: 'DEVELOP';
  provinceId: string;
}
export interface DiplomaticOrder {
  type: 'DIPLOMACY';
  action: DiplomacyAction;
  targetRealmId: string;
  amount?: number;
  targetProvinceId?: string;
}
export type PlayerOrder =
  | MoveAttackOrder
  | RecruitOrder
  | TrainOrder
  | PacifyOrder
  | ConvertOrder
  | BuildFortOrder
  | DevelopOrder
  | DiplomaticOrder;
export interface BattleReport {
  id: string;
  turn: number;
  provinceId: string;
  attackerId: string;
  defenderId: string | null;
  winnerId: string | null;
  attackerTroops: number;
  defenderTroops: number;
  attackPower: number;
  defensePower: number;
  ratio: number;
  attackerTraining: number;
  defenderTraining: number;
  terrain: Terrain;
  terrainDefenseBonus: number;
  fortLevel: number;
  fortDefenseMultiplier: number;
  holyWarBonus: number;
  coalitionAttackBonus: number;
  coalitionDefenseBonus: number;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerMoraleBefore: number;
  attackerMoraleAfter: number;
  defenderMoraleBefore: number;
  defenderMoraleAfter: number;
  retreatDestinationId: string | null;
  stackwipe: boolean;
  outcome: 'attacker_victory' | 'defender_victory' | 'siege_blocked';
}
export interface RetreatReport {
  reason?: 'battle' | 'repatriation' | 'regrouping';
  armyId: string;
  ownerId: string | null;
  fromProvinceId: string;
  toProvinceId: string | null;
  survivors: number;
  regrouped: number;
  dispersed: number;
  morale: number;
  stranded: boolean;
}
export interface StackwipeReport {
  armyId: string;
  ownerId: string | null;
  provinceId: string;
  troops: number;
  reason: 'overwhelming_force' | 'zero_morale_no_escape';
}
export interface ConversionReport {
  provinceId: string;
  actorId: string;
  ownerId: string | null;
  from: ReligionId;
  to: ReligionId;
  crossBorder: boolean;
}
export interface RebellionReport {
  provinceId: string;
  previousOwnerId: string;
  rebelTroops: number;
}
export interface DiplomaticChangeReport {
  action: string;
  actorId: string | null;
  targetId: string;
  amount: number;
  provinceId: string | null;
  covert: boolean;
  text: string;
}
export interface AttritionReport {
  armyId: string;
  provinceId: string;
  ownerId: string | null;
  troopsBefore: number;
  supplyLimit: number;
  losses: number;
}
export interface HegemonyAlert {
  playerId: string;
  objective: Objective;
  progress: number;
}
export interface TurnResolutionReport {
  turn: number;
  battles: BattleReport[];
  retreats: RetreatReport[];
  stackwipes: StackwipeReport[];
  conversions: ConversionReport[];
  rebellions: RebellionReport[];
  diplomaticChanges: DiplomaticChangeReport[];
  attritionLosses: AttritionReport[];
  hegemonyAlerts: HegemonyAlert[];
}
export function emptyTurnReport(turn: number): TurnResolutionReport {
  return {
    turn,
    battles: [],
    retreats: [],
    stackwipes: [],
    conversions: [],
    rebellions: [],
    diplomaticChanges: [],
    attritionLosses: [],
    hegemonyAlerts: [],
  };
}
export type GameCommand =
  | { type: 'SUBMIT_ORDER'; order: PlayerOrder }
  | { type: 'CANCEL_ORDER'; key: string }
  | { type: 'READY'; ready: boolean }
  | { type: 'ANSWER_OFFER'; offerId: string; accept: boolean }
  | { type: 'START_GAME' }
  | { type: 'SET_MODE'; mode: GameMode }
  | { type: 'SET_IDENTITY'; objective: Objective; doctrine: Doctrine }
  | { type: 'ADD_BOT' }
  | { type: 'REPLACE_WITH_BOT'; playerId: string }
  | { type: 'CHAT'; text: string };
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
  faith: ReligionId;
  objective: Objective;
  doctrine: Doctrine;
  bot: boolean;
  botArchetype: BotArchetype;
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
  tradeEarned: number;
  stability: number;
  scores: Record<Objective, number>;
  victoryProgress: Record<Objective, number>;
}
export interface Province extends ProvinceStaticData, ProvinceRuntimeState {}
export interface StationedArmy {
  id: string;
  ownerId: string | null;
  provinceId: string;
  troops: number;
  mercenaries: number;
  morale: number;
  training: number;
  stranded: boolean;
}
export interface Relation {
  a: string;
  b: string;
  allied: boolean;
  truceUntil: number;
  trust: number;
  atWar: boolean;
  militaryAccess: string[];
  embargoes: string[];
  tribute: { payerId: string; recipientId: string; amount: number; untilTurn: number } | null;
}
export interface Offer {
  id: string;
  from: string;
  to: string;
  kind: 'alliance' | 'military_access' | 'tribute';
  amount: number;
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
  version: 2;
  code: string;
  hostId: string;
  phase: 'lobby' | 'planning' | 'finished';
  turn: number;
  maxTurns: number;
  seed: number;
  nextId: number;
  players: Player[];
  provinces: Province[];
  relations: Relation[];
  offers: Offer[];
  orders: Record<string, PlayerOrder[]>;
  log: LogEntry[];
  chat: ChatEntry[];
  winnerId: string | null;
  winnerObjective: Objective | null;
  hegemonyLeaderId: string | null;
  mode: GameMode;
  turnSeconds: number;
  deadline: number | null;
  demo: boolean;
  paused: boolean;
  persistenceEnabled: boolean;
  baseUpkeep: number;
  victoryTargets: Record<Objective, number>;
  stationedArmies: StationedArmy[];
  displacedArmies: StationedArmy[];
  lastReport: TurnResolutionReport | null;
  reports: TurnResolutionReport[];
  pendingDiplomacy: DiplomaticChangeReport[];
}
export type GameView = Omit<GameState, 'orders' | 'seed' | 'nextId' | 'pendingDiplomacy'> & {
  myOrders: Order[];
  plannedOrders: PlayerOrder[];
};
export type ClientMessage =
  | { type: 'create'; name: string; mode?: GameMode; objective?: Objective; demo?: boolean }
  | { type: 'join'; code: string; name: string; objective?: Objective }
  | { type: 'resume'; code: string; playerId: string; token: string }
  | { type: 'leave' }
  | { type: 'command'; command: GameCommand };
export type ServerMessage =
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'state'; state: GameView }
  | { type: 'error'; message: string }
  | { type: 'left' };
export const OBJECTIVES: Record<Objective, { name: string; description: string; formula: string }> =
  {
    conquest: {
      name: 'Supremacia',
      description: 'Expanda suas fronteiras e vença batalhas.',
      formula: '1 por província + 0,35 por batalha vencida.',
    },
    prosperity: {
      name: 'Prosperidade',
      description: 'Construa uma economia que sustente seu império.',
      formula: '2 por nível comercial + ouro/30 + comércio acumulado/18.',
    },
    concord: {
      name: 'Concórdia',
      description: 'Estabilize províncias e cultive alianças.',
      formula: '1 por província estável + 0,6 por rodada de paz (até 8) + 1,5 por aliança.',
    },
    faith: {
      name: 'Legado espiritual',
      description: 'Espalhe sua crença e integre as novas comunidades.',
      formula: '1,5 por província estável da sua crença + 1,2 por conversão concluída.',
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
    description: 'Adicione 3 recrutas. Eles começam com treinamento 1,00 e moral 60.',
    gold: 9,
    manpower: 3,
    influence: 0,
  },
  train: {
    name: 'Treinar',
    description: '+0,10 de treinamento (máximo 1,50) e +8 de moral.',
    gold: 6,
    manpower: 0,
    influence: 0,
  },
  develop: {
    name: 'Desenvolver',
    description: '+1 nível (máximo 3). Cada nível acrescenta 1,5 à renda comercial.',
    gold: 16,
    manpower: 0,
    influence: 0,
  },
  pacify: {
    name: 'Pacificar',
    description:
      '+35 pacificação e −25 revolta; estabilidade exige pacificação ≥ 80 e revolta ≤ 25.',
    gold: 8,
    manpower: 0,
    influence: 0,
  },
  convert: {
    name: 'Enviar missão',
    description:
      'Avance 50% na conversão. Duas missões mudam a crença; conversão estrangeira gera 20 de revolta.',
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
] as const;
export { orderCost, incomeOf, economyOf } from './rules';
