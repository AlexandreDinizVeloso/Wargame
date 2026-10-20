import type { ProvinceStaticData } from './map';
export type GameMode = 'quick' | 'campaign';
export type Continent = 'EUROPE' | 'AMERICAS' | 'MENA_AFRICA' | 'ASIA';
export type Theater = Exclude<Continent, 'MENA_AFRICA'>;
export type ReligionId = 'SOLAR' | 'MERCHANT' | 'REFORMED' | 'ANCESTRAL';
export type ReligiousPolicy = 'INQUISITION' | 'TOLERANCE';
export type Objective = 'DOMINATION' | 'IMPERIAL_PACIFICATION';
export type BotArchetype = 'Militarist' | 'Merchant' | 'Theocrat' | 'Diplomat';
export type MapMode = 'POLITICAL' | 'RELIGIOUS' | 'ECONOMIC_SUPPLY' | 'DIPLOMATIC' | 'UNREST';
export type NationId =
  'PORTUGAL' | 'CASTILE' | 'FRANCE' | 'AUSTRIA' | 'OTTOMANS' | 'MING' | 'JAPAN' | 'INCA';
export interface Composition {
  infantry: number;
  cavalry: number;
  artillery: number;
  warships: number;
  transports: number;
}
export interface Battalion extends Composition {
  id: string;
  ownerId: string;
  name: string;
  provinceId: string;
  isFleet: boolean;
  embarkedArmyId?: string;
  embarkedOnId?: string;
  morale: number;
  training: number;
  entrenched: boolean;
  pathQueue: string[];
  isMercenary: boolean;
  stranded: boolean;
}
export type ArmyUnit = Battalion;
export interface ProvinceRuntimeState {
  ownerId: string | null;
  occupierId: string | null;
  religion: ReligionId;
  pacification: number;
  unrest: number;
  fortLevel: number;
  portLevel: number;
  marketLevel: number;
  conversion: number;
  conversionReligion: ReligionId | null;
  conversionInstigatorId: string | null;
  capitalOf: string | null;
}
export interface Province extends ProvinceStaticData, ProvinceRuntimeState {}
export interface RecruitBattalionOrder extends Partial<Composition> {
  type: 'RECRUIT_BATTALION';
  provinceId: string;
  battalionId?: string;
  isFleet?: boolean;
  isMercenary?: boolean;
  name?: string;
}
export type CityOrder =
  | RecruitBattalionOrder
  | { type: 'BUILD_FORT' | 'BUILD_PORT' | 'BUILD_MARKET' | 'PACIFY'; provinceId: string }
  | { type: 'CONVERT'; targetProvinceId: string };
export type BattalionOrder =
  | { type: 'MOVE_BATTALION'; battalionId: string; targetProvinceId?: string; path?: string[] }
  | { type: 'ENTRENCH_BATTALION' | 'TRAIN_BATTALION'; battalionId: string }
  | { type: 'MERGE_BATTALIONS'; battalionId: string; targetBattalionId: string }
  | { type: 'SPLIT_BATTALION'; battalionId: string; composition: Composition; name?: string }
  | {
      type: 'EMBARK_BATTALION';
      battalionId: string;
      fleetId?: string;
      disembarkProvinceId?: string;
    };
export type DiplomacyAction =
  | 'PROPOSE_ALLIANCE'
  | 'BREAK_ALLIANCE'
  | 'MILITARY_ACCESS'
  | 'DEMAND_TRIBUTE'
  | 'EMBARGO'
  | 'FUND_REBELS'
  | 'SEND_SUBSIDY';
export interface DiplomaticOrder {
  type: 'DIPLOMACY';
  action: DiplomacyAction;
  targetRealmId: string;
  amount?: number;
  targetProvinceId?: string;
}
export type PlayerOrder = CityOrder | BattalionOrder | DiplomaticOrder;
export type CasusBelli = 'CONQUEST' | 'IMPERIAL_BAN' | 'HOLY_WAR' | 'HUMILIATION';
export type PeaceTerm =
  | { type: 'CEDE_PROVINCES'; provinceIds: string[] }
  | { type: 'WAR_REPARATIONS'; immediateTribute: number }
  | { type: 'HUMILIATE_DISARM' }
  | { type: 'FORCE_EMPIRE_OR_RELIGION'; choice: 'EMPIRE' | 'RELIGION' }
  | { type: 'SUBJUGATE' };
export interface War {
  id: string;
  name: string;
  attackerLeaderId: string;
  defenderLeaderId: string;
  attackerIds: string[];
  defenderIds: string[];
  casusBelli: CasusBelli;
  warScore: number;
  battleScore: number;
  blockadeScore: number;
  startedTurn: number;
  endedTurn: number | null;
  active: boolean;
  imperialBanAgainstId: string | null;
  peaceTerms: PeaceTerm[];
}
export interface ImperialDiet {
  emperorId: string | null;
  imperialAuthority: number;
  memberRealmIds: string[];
  peaceTurnsCounter: number;
  retaliationEdictActive: boolean;
  votes: Record<string, string>;
  bannedRealmIds: string[];
}
export interface NationDefinition {
  id: NationId;
  name: string;
  color: string;
  emblem: string;
  religion: ReligionId;
  ideas: [string, string];
  homeProvinceId: string;
  modifiers: Partial<
    Record<
      | 'navalAttack'
      | 'artillery'
      | 'cavalry'
      | 'infantry'
      | 'trade'
      | 'authority'
      | 'recruitCost'
      | 'fleetCost'
      | 'pacification'
      | 'manpower',
      number
    >
  >;
  initial: Composition;
}
export interface Player {
  id: string;
  name: string;
  nationId: NationId;
  nation: string;
  color: string;
  faith: ReligionId;
  religiousPolicy: ReligiousPolicy;
  bot: boolean;
  botArchetype: BotArchetype;
  online: boolean;
  ready: boolean;
  gold: number;
  manpower: number;
  influence: number;
  prestige: number;
  stability: number;
  warExhaustion: number;
  wonBattles: number;
  conversions: number;
  tradeEarned: number;
  subjectOfId: string | null;
  moraleBonusUntil: number;
  disarmUntil: number;
  armyCap: number;
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
  kind: 'alliance' | 'military_access' | 'tribute' | 'call_to_arms' | 'peace';
  amount: number;
  warId?: string;
  defensive?: boolean;
  terms?: PeaceTerm[];
  expiresTurn: number;
}
export interface Reparation {
  payerId: string;
  recipientId: string;
  untilTurn: number;
  rate: number;
}
export interface BattleReport {
  id: string;
  turn: number;
  provinceId: string;
  attackerId: string;
  defenderId: string | null;
  attackerBattalionIds: string[];
  defenderBattalionIds: string[];
  winnerId: string | null;
  attackerTroops: number;
  defenderTroops: number;
  attackPower: number;
  defensePower: number;
  ratio: number;
  attackerTraining: number;
  defenderTraining: number;
  terrainDefenseBonus: number;
  fortLevel: number;
  neutralizedFortLevels: number;
  blockadeModifier: number;
  infantryModifier: number;
  cavalryModifier: number;
  artilleryModifier: number;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerCompositionLosses: Composition;
  defenderCompositionLosses: Composition;
  casualtiesByRealm: Record<string, number>;
  attackerMoraleBefore: number;
  attackerMoraleAfter: number;
  defenderMoraleBefore: number;
  defenderMoraleAfter: number;
  retreatDestinationId: string | null;
  stackwipe: boolean;
  outcome: 'attacker_victory' | 'defender_victory' | 'siege_blocked';
  naval: boolean;
}
export interface RetreatReport {
  armyId: string;
  ownerId: string;
  fromProvinceId: string;
  toProvinceId: string | null;
  survivors: number;
  regrouped: number;
  dispersed: number;
  morale: number;
  stranded: boolean;
  reason: 'battle' | 'repatriation' | 'regrouping';
}
export interface DiplomaticChangeReport {
  action: string;
  actorId: string | null;
  targetId: string;
  text: string;
  covert: boolean;
  amount: number;
  provinceId: string | null;
}
export interface MovementReport {
  battalionId: string;
  ownerId: string;
  fromProvinceId: string;
  toProvinceId: string;
  isFleet: boolean;
  troops: number;
}
export interface EconomyMetric {
  playerId: string;
  turn: number;
  taxes: number;
  trade: number;
  tithes: number;
  grossIncome: number;
  income: number;
  upkeep: number;
  net: number;
  gold: number;
  warExhaustion: number;
}
export interface DietEvent {
  turn: number;
  emperorId: string | null;
  imperialAuthority: number;
  memberRealmIds: string[];
  peaceTurnsCounter: number;
  retaliationEdictActive: boolean;
  votes: Record<string, string>;
}
export interface TurnResolutionReport {
  turn: number;
  battles: BattleReport[];
  movements: MovementReport[];
  retreats: RetreatReport[];
  stackwipes: {
    armyId: string;
    ownerId: string;
    provinceId: string;
    troops: number;
    reason: 'overwhelming_force' | 'zero_morale_no_escape';
  }[];
  conversions: {
    provinceId: string;
    actorId: string;
    ownerId: string | null;
    from: ReligionId;
    to: ReligionId;
    crossBorder: boolean;
  }[];
  rebellions: { provinceId: string; previousOwnerId: string; rebelTroops: number }[];
  diplomaticChanges: DiplomaticChangeReport[];
  attritionLosses: {
    armyId: string;
    provinceId: string;
    ownerId: string;
    troopsBefore: number;
    supplyLimit: number;
    losses: number;
  }[];
  economy: EconomyMetric[];
  diet: DietEvent;
  events: string[];
}
export interface TurnHistory extends TurnResolutionReport {
  nations: Player[];
  wars: War[];
  control: { provinceId: string; ownerId: string | null; occupierId: string | null }[];
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
export interface MatchConfig {
  mode: GameMode;
  theater: Theater;
  mapId: string;
  maxTurns: number;
  turnSeconds: number;
  createdVersion: '0.3.0';
  legacyResult?: { winnerId: string | null; objective: string | null; version: '0.2.0' };
}
export interface GameState {
  version: 3;
  code: string;
  hostId: string;
  phase: 'lobby' | 'planning' | 'finished';
  turn: number;
  maxTurns: number;
  seed: number;
  nextId: number;
  mode: GameMode;
  theater: Theater;
  matchConfig: MatchConfig;
  players: Player[];
  provinces: Province[];
  battalions: Battalion[];
  relations: Relation[];
  offers: Offer[];
  wars: War[];
  diet: ImperialDiet;
  reparations: Reparation[];
  orders: Record<string, PlayerOrder[]>;
  log: LogEntry[];
  chat: ChatEntry[];
  winnerId: string | null;
  winnerObjective: Objective | null;
  finishReason: 'victory' | 'turn_limit' | 'realm_collapse' | 'legacy_finished' | null;
  turnSeconds: number;
  deadline: number | null;
  demo: boolean;
  paused: boolean;
  persistenceEnabled: boolean;
  baseUpkeep: number;
  lastReport: TurnResolutionReport | null;
  reports: TurnResolutionReport[];
  history: TurnHistory[];
  pendingDiplomacy: DiplomaticChangeReport[];
}
export type GameView = Omit<GameState, 'orders' | 'seed' | 'nextId' | 'pendingDiplomacy'> & {
  plannedOrders: PlayerOrder[];
};
export type GameCommand =
  | { type: 'SUBMIT_ORDER'; order: PlayerOrder }
  | { type: 'CANCEL_ORDER'; key: string }
  | { type: 'READY'; ready: boolean }
  | { type: 'ANSWER_OFFER'; offerId: string; accept: boolean }
  | { type: 'START_GAME' }
  | { type: 'SET_MODE'; mode: GameMode; theater?: Theater }
  | { type: 'SET_IDENTITY'; nationId: NationId; religiousPolicy?: ReligiousPolicy }
  | { type: 'SET_RELIGIOUS_POLICY'; policy: ReligiousPolicy }
  | { type: 'ADD_BOT' }
  | { type: 'REPLACE_WITH_BOT'; playerId: string }
  | { type: 'CHAT'; text: string }
  | {
      type: 'DECLARE_WAR';
      targetRealmId: string;
      casusBelli: CasusBelli;
      offensiveAllyIds?: string[];
    }
  | { type: 'OFFER_PEACE'; warId: string; terms: PeaceTerm[] }
  | { type: 'JOIN_DIET' }
  | { type: 'LEAVE_DIET' }
  | { type: 'VOTE_EMPEROR'; candidateId: string }
  | { type: 'ISSUE_IMPERIAL_EDICT' }
  | { type: 'CALL_TO_ARMS'; warId: string; allyId: string };
export type ClientMessage =
  | {
      type: 'create';
      name: string;
      mode?: GameMode;
      theater?: Theater;
      nationId?: NationId;
      demo?: boolean;
    }
  | { type: 'join'; code: string; name: string; nationId?: NationId }
  | { type: 'resume'; code: string; playerId: string; token: string }
  | { type: 'leave' }
  | { type: 'command'; command: GameCommand };
export type ServerMessage =
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'state'; state: GameView }
  | { type: 'error'; message: string }
  | { type: 'left' };
export interface MatchTelemetry {
  schemaVersion: 3;
  matchConfig: MatchConfig;
  nations: Player[];
  turnByTurnHistory: TurnHistory[];
  wars: War[];
  battles: BattleReport[];
  dietHistory: DietEvent[];
  economyMetrics: EconomyMetric[];
  finalState: Omit<GameView, 'history'>;
}
export const OBJECTIVES: Record<Objective, { name: string; description: string }> = {
  DOMINATION: {
    name: 'Dominação Total',
    description: 'Subjugue os demais reinos ou controle 75% das terras, sem rival acima de 15%.',
  },
  IMPERIAL_PACIFICATION: {
    name: 'Pacificação Imperial',
    description:
      'Como Imperador, reúna 60% das nações vivas e preserve cinco rodadas sem guerras no mundo.',
  },
};
export function emptyTurnReport(turn: number, diet: ImperialDiet): TurnResolutionReport {
  return {
    turn,
    battles: [],
    movements: [],
    retreats: [],
    stackwipes: [],
    conversions: [],
    rebellions: [],
    diplomaticChanges: [],
    attritionLosses: [],
    economy: [],
    diet: { turn, ...structuredClone(diet) },
    events: [],
  };
}
