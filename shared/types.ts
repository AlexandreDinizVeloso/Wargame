import type { ProvinceStaticData } from './map';
export type GameMode = 'quick' | 'campaign';
export type Continent =
  'EUROPE' | 'NORTH_AMERICA' | 'SOUTH_AMERICA' | 'MENA_AFRICA' | 'ASIA' | 'AMERICAS';
export type Theater = 'EUROPE' | 'AMERICAS' | 'ASIA';
export type ReligionId = 'SOLAR' | 'MERCHANT' | 'REFORMED' | 'ANCESTRAL';
export type ReligiousPolicy = 'INQUISITION' | 'TOLERANCE';
export type Objective = 'DOMINATION' | 'SECRET_OBJECTIVE';
export type BotArchetype = 'Militarist' | 'Merchant' | 'Theocrat' | 'Diplomat';
export type MapMode =
  | 'POLITICAL'
  | 'ECONOMIC'
  | 'LOGISTICS'
  | 'DIPLOMATIC'
  | 'UNREST'
  | 'RELIGIOUS'
  | 'ECONOMIC_SUPPLY';
export type NationId =
  | 'vespera'
  | 'sol_invicto'
  | 'kaldor'
  | 'aurelia'
  | 'ferro_norte'
  | 'sapiencia'
  | 'veridia'
  | 'turan';
export interface Composition {
  infantry: number;
  cavalry: number;
  artillery: number;
  warships: number;
  transports: number;
}
export type RecruitmentComposition = Pick<Composition, 'infantry' | 'cavalry' | 'artillery'>;
export interface Battalion extends Composition {
  blitzUntilTurn?: number;
  supplySabotagedUntilTurn?: number;
  lastMovedTurn?: number;
  previousProvinceId?: string;
  moraleCap?: 100 | 110;
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
  movementCredit: number;
  movementPoints: number;
  autoMerge: boolean;
  infantryPower: number;
  artilleryPower: number;
  encircled: boolean;
  disorganized: boolean;
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
  barracksLevel: number;
  foundryLevel: number;
  templeLevel: number;
  maxBuildingSlots: number;
  siege: Siege | null;
  neutralDevelopmentLevel: number;
  neutralDevelopmentTurn: number;
  coastalBombardment: { ownerId: string; startedTurn: number; untilTurn: number } | null;
  recruitedThisTurn: number;
  recruitmentTurn: number;
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
  | { type: 'CONVERT'; targetProvinceId: string }
  | { type: 'BUILD_BUILDING' | 'DEMOLISH_BUILDING'; provinceId: string; building: BuildingType };
export type BattalionOrder =
  | { type: 'MOVE_BATTALION'; battalionId: string; targetProvinceId?: string; path?: string[] }
  | {
      type: 'ENTRENCH_BATTALION' | 'TRAIN_BATTALION' | 'RAZE_PROVINCE' | 'ASSAULT_SIEGE';
      battalionId: string;
    }
  | { type: 'MERGE_ALL'; battalionId: string }
  | { type: 'BOMBARD_COAST'; battalionId: string; targetProvinceId: string }
  | { type: 'NAVAL_BRIDGE'; battalionId: string; fleetId: string; targetProvinceId: string }
  | {
      type: 'AUTO_TRANSPORT';
      battalionId: string;
      targetProvinceId: string;
      fleetId?: string;
      seaPath?: string[];
    }
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
  | 'SEND_SUBSIDY'
  | 'OFFER_VASSALAGE'
  | 'BUY_VISION_OR_BRIHC';
export interface DiplomaticOrder {
  type: 'DIPLOMACY';
  action: DiplomacyAction;
  targetRealmId: string;
  amount?: number;
  targetProvinceId?: string;
}
export type PlayerOrder = CityOrder | BattalionOrder | DiplomaticOrder;
export type CasusBelli = 'CONQUEST' | 'IMPERIAL_BAN' | 'HOLY_WAR' | 'HUMILIATION' | 'COALITION';
export type PeaceTerm =
  | { type: 'WHITE_PEACE' }
  | { type: 'HUMILIATE_DEMILITARIZE' }
  | { type: 'SUBJUGATE_VASSAL' }
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
  treatyWinnerId?: string;
  treatyScore?: number;
  battleWins?: number;
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
  factionTrait: import('./factions').FactionTrait;
  id: NationId;
  style: string;
  mechanic: string;
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
  manpowerCap: number;
  emergencyLevyTurn: number | null;
  homelandDefenseUntil: number;
  lostProvinceIds: string[];
  aggressiveExpansion: number;
  fervor: number;
  secretObjectives: SecretObjective[];
  selectedObjectiveId: string | null;
  objectiveStreak: number;
  originalCapitalId: string | null;
  authority?: number;
  authorityEarnedTurn?: number;
  authorityEarnedThisTurn?: number;
  dilemmaAttackUntilTurn?: number;
  lastDilemmaTurn?: number;
  lastDilemmaId?: string;
  councilEffects?: import('./councilEffects').CouncilEffect[];
  activeDilemma?: import('./dilemmas').ActiveDilemma | null;
  dilemmaBuildingCredits?: number;
  botTargetProvinceId?: string;
  afkStreak?: number;
  afkRegent?: boolean;
  militaryXP: number;
  unlockedSkills: SkillId[];
  paxStreak: number;
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
export interface PeaceTreatyOffer {
  warId: string;
  terms: PeaceTerm[];
  concession?: boolean;
}
export interface Offer {
  concession?: boolean;
  id: string;
  from: string;
  to: string;
  kind: 'alliance' | 'military_access' | 'tribute' | 'call_to_arms' | 'peace' | 'vassalage';
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
  riverCrossingModifier?: number;
  attackerCompositionBefore?: Composition;
  defenderCompositionBefore?: Composition;
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
  bombardmentModifier?: number;
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
  capturedShips?: number;
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
  viaSeaId?: string;
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
  industry: number;
  administration: number;
  buildingUpkeep: number;
  plunder: number;
  maritimeTrade?: number;
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
  bombardments: {
    fleetId: string;
    ownerId: string;
    provinceId: string;
    fortBefore: number;
    fortAfter: number;
    cost: number;
  }[];
  neutralDevelopments: {
    provinceId: string;
    level: number;
    targetGarrison: number;
    fortLevel: number;
  }[];
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
  sieges: {
    provinceId: string;
    attackerOwnerId: string;
    progress: number;
    required: number;
    completed: boolean;
    assault: boolean;
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
  world: { season: Season; event: GlobalEvent | null; coalitions: Coalition[] };
  events: string[];
  notifications: GameNotification[];
  desertions: { battalionId: string; ownerId: string; provinceId: string; losses: number }[];
  encirclements: { battalionId: string; ownerId: string; provinceId: string; losses: number }[];
}
export interface RealmTurnAnalytics {
  playerId: string;
  landTroops?: number;
  ships?: number;
  fortLevels: number;
  tradeNodes: number;
}
export interface TurnHistory extends TurnResolutionReport {
  analytics?: RealmTurnAnalytics[];
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
  turn?: number;
  id: number;
  playerId: string;
  text: string;
}
export interface MatchConfig {
  verticalSlice?: boolean;
  ruleset?: 'GOLD_098';
  campaignId?: string;
  sourceReport?: { code: string; turn: number };
  scenarioId?: import('./scenarios').ScenarioId;
  mode: GameMode;
  theater: Theater;
  mapId: string;
  maxTurns: number;
  turnSeconds: number;
  createdVersion:
    '0.7.0' | '0.9.0-rc.1' | '0.95.0' | '0.98.0' | '0.99.0' | '1.0.0' | '1.0.1' | '1.1.0' | '1.2.0';
  tutorial?: boolean;
  enableSecretObjectives: boolean;
  allowBotSecretVictory: boolean;
  legacyResult?: {
    winnerId: string | null;
    objective: string | null;
    version: '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0';
  };
}
export interface GameState {
  pendingEraEvent?: string;
  lastEra?: import('./world').CampaignEra;
  botCouncilTurn?: number;
  hegemonyWarned?: string[];
  version: 7;
  allowBotSecretVictory: boolean;
  graceUntilTurn: number;
  sandboxContinued: boolean;
  victoryRecord: { winnerId: string | null; objective: Objective | null; turn: number } | null;
  notifications: GameNotification[];
  notificationReads: Record<string, string[]>;
  code: string;
  roomName: string;
  isPublic: boolean;
  enableSecretObjectives: boolean;
  season: Season;
  globalEvent: GlobalEvent | null;
  coalitions: Coalition[];
  visionContracts: { buyerId: string; targetId: string; untilTurn: number }[];
  firstReadyPlayerName: string | null;
  turnDeadlineAt: number | null;
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
  commanders: Commander[];
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
export type GameView = Omit<
  GameState,
  'orders' | 'seed' | 'nextId' | 'pendingDiplomacy' | 'notificationReads'
> & {
  plannedOrders: PlayerOrder[];
  readNotificationIds: string[];
};
export type SupremeCommandId =
  'BLITZ_MARCH' | 'WAR_BONDS' | 'ELITE_GUARD' | 'SIEGE_BREAKER' | 'SABOTAGE_SUPPLY';
export interface SupremeCommandOrder {
  type: 'EXECUTE_SUPREME_COMMAND';
  command: SupremeCommandId;
  battalionId?: string;
  provinceId?: string;
}
export type GameCommand =
  | SupremeCommandOrder
  | { type: 'MASS_RECRUIT'; composition: RecruitmentComposition }
  | { type: 'CHOOSE_DILEMMA'; option: 0 | 1 }
  | { type: 'EMERGENCY_LEVY' }
  | { type: 'CAST_IMPERIAL_VOTE'; candidateId: string }
  | { type: 'CONTINUE_SANDBOX' }
  | { type: 'READ_NOTIFICATIONS'; notificationIds: string[] }
  | { type: 'SUBMIT_ORDER'; order: PlayerOrder }
  | { type: 'INSTANT_ARMY_ACTION'; action: InstantArmyAction }
  | { type: 'ASSIGN_LEADER'; battalionId: string; commanderId: string | null }
  | { type: 'RECRUIT_COMMANDER'; name?: string; isAdmiral: boolean; trait: CommanderTrait }
  | { type: 'UNLOCK_SKILL'; skillId: SkillId }
  | { type: 'SET_AUTO_MERGE'; battalionId: string; autoMerge: boolean }
  | { type: 'CANCEL_ORDER'; key: string }
  | { type: 'READY'; ready: boolean }
  | { type: 'ANSWER_OFFER'; offerId: string; accept: boolean }
  | { type: 'START_GAME' }
  | { type: 'SET_MODE'; mode: GameMode; theater?: Theater }
  | { type: 'SET_IDENTITY'; nationId: NationId; religiousPolicy?: ReligiousPolicy }
  | { type: 'SET_PLAYER_NAME'; name: string }
  | { type: 'SET_BOT_NATION'; playerId: string; nationId: NationId }
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
  | { type: 'OFFER_PEACE'; warId: string; terms: PeaceTerm[]; concession?: boolean }
  | { type: 'JOIN_COALITION' | 'DECLARE_COALITION_WAR'; targetRealmId: string }
  | { type: 'CHOOSE_SECRET_OBJECTIVE'; objectiveId: string }
  | {
      type: 'SET_LOBBY_OPTIONS';
      roomName: string;
      isPublic: boolean;
      enableSecretObjectives: boolean;
      allowBotSecretVictory?: boolean;
      turnTimerSeconds: number;
    }
  | {
      type: 'DECLARE_WAR_AND_MOVE';
      targetRealmId: string;
      casusBelli: CasusBelli;
      offensiveAllyIds?: string[];
      battalionId: string;
      targetProvinceId: string;
      bridgeFleetId?: string;
      autoTransport?: boolean;
    }
  | { type: 'CALL_TO_ARMS'; warId: string; allyId: string };
export interface MapPing {
  id: string;
  code: string;
  playerId: string;
  provinceId: string;
  note: string;
  expiresAt: number;
}
export type ClientMessage =
  | {
      type: 'create';
      name: string;
      mode?: GameMode;
      theater?: Theater;
      nationId?: NationId;
      demo?: boolean;
      tutorial?: boolean;
      scenarioId?: import('./scenarios').ScenarioId;
      roomName?: string;
      isPublic?: boolean;
      enableSecretObjectives?: boolean;
      allowBotSecretVictory?: boolean;
      turnTimerSeconds?: number;
    }
  | { type: 'join'; code: string; name: string; nationId?: NationId }
  | { type: 'resume'; code: string; playerId: string; token: string }
  | { type: 'leave' }
  | { type: 'command'; command: GameCommand }
  | { type: 'map_ping'; provinceId: string; note?: string }
  | { type: 'export_campaign' }
  | { type: 'import_campaign'; save: unknown };
export interface SeatInvite {
  playerId: string;
  name: string;
  token: string;
  code: string;
}
export interface CampaignSave {
  format: 'CONCORDIA_SAVE_098';
  game: GameState;
  exporterId: string;
}
export type ServerMessage =
  | { type: 'campaign_export'; save: CampaignSave }
  | { type: 'seat_invites'; invites: SeatInvite[] }
  | { type: 'map_ping'; ping: MapPing }
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'state'; state: GameView }
  | { type: 'error'; message: string }
  | { type: 'left' };
export interface MatchTelemetry {
  schemaVersion: 7;
  matchConfig: MatchConfig;
  nations: Player[];
  turnByTurnHistory: TurnHistory[];
  wars: War[];
  battles: BattleReport[];
  dietHistory: DietEvent[];
  worldHistory: TurnResolutionReport['world'][];
  economyMetrics: EconomyMetric[];
  finalState: Omit<GameView, 'history'>;
}
export type BuildingType = 'MARKET' | 'BARRACKS' | 'FORT' | 'FOUNDRY' | 'TEMPLE' | 'PORT';
export interface Siege {
  attackerOwnerId: string;
  progress: number;
  required: number;
  turnsUnderSiege: number;
  startedTurn: number;
  lastProgressTurn: number;
}
export type CommanderTrait =
  'SIEGE_MASTER' | 'BLITZ_VANGUARD' | 'IRON_WALL' | 'FOREST_RANGER' | 'QUARTERMASTER' | 'SEA_WOLF';
export interface Commander {
  id: string;
  name: string;
  ownerId: string;
  isAdmiral: boolean;
  stars: 1 | 2 | 3;
  xp: number;
  trait: CommanderTrait;
  assignedBattalionId: string | null;
  lastStandUsed: boolean;
}
export type SkillBranch = 'INF' | 'CAV' | 'ART' | 'NAV';
export type SkillId =
  | 'INF_T1'
  | 'INF_T2A'
  | 'INF_T2B'
  | 'INF_T3'
  | 'CAV_T1'
  | 'CAV_T2A'
  | 'CAV_T2B'
  | 'CAV_T3'
  | 'ART_T1'
  | 'ART_T2A'
  | 'ART_T2B'
  | 'ART_T3'
  | 'NAV_T1'
  | 'NAV_T2A'
  | 'NAV_T2B'
  | 'NAV_T3';
export interface SkillDefinition {
  id: SkillId;
  branch: SkillBranch;
  tier: 1 | 2 | 3;
  cost: number;
  name: string;
  description: string;
}
export type InstantArmyAction =
  | Extract<BattalionOrder, { type: 'MERGE_BATTALIONS' | 'SPLIT_BATTALION' }>
  | { type: 'MERGE_ALL'; battalionId: string }
  | { type: 'ASSIGN_LEADER'; battalionId: string; commanderId: string | null };
export type StrategicResource =
  'GRAIN' | 'IRON' | 'HORSES' | 'GOLD_MINE' | 'GOLD' | 'TIMBER' | 'SPICES' | 'RELIC' | null;
export type Season = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
export type GlobalEventId =
  'GOLD_RUSH' | 'HARSH_WINTER' | 'CRUSADE' | 'MERCENARY_CRISIS' | 'REBEL_AGITATORS';
export interface GlobalEvent {
  id: GlobalEventId;
  startedTurn: number;
  endsTurn: number;
}
export interface Coalition {
  targetId: string;
  memberIds: string[];
  warId: string | null;
}
export interface SecretObjective {
  id: string;
  kind: 'WEALTH' | 'SEAS' | 'RIVALRY' | 'PAX';
  name: string;
  requirements: { key: string; label: string; target: number }[];
  rivalId?: string;
  capitalId?: string;
}
export interface PublicRoom {
  roomId: string;
  roomName: string;
  hostName: string;
  theater: 'Mapa-Múndi' | 'Europa' | 'Américas' | 'Ásia';
  enableSecretObjectives: boolean;
  playersCount: number;
  maxPlayers: number;
  status: 'LOBBY' | 'IN_GAME';
  turn: number;
  scenario?: string;
  joinable?: boolean;
  replaceableBots?: number;
  humanPlayersCount?: number;
}
export const OBJECTIVES: Record<Objective, { name: string; description: string }> = {
  DOMINATION: {
    name: 'Dominação / Hegemonia',
    description:
      'Controle 75% das terras; vassalos contribuem com metade de suas províncias, ou elimine todos os rivais.',
  },
  SECRET_OBJECTIVE: {
    name: 'Objetivo Secreto',
    description: 'Cumpra todos os requisitos da sua carta de comandante.',
  },
};
export function emptyTurnReport(turn: number, diet: ImperialDiet): TurnResolutionReport {
  return {
    turn,
    battles: [],
    bombardments: [],
    neutralDevelopments: [],
    movements: [],
    retreats: [],
    stackwipes: [],
    sieges: [],
    conversions: [],
    rebellions: [],
    diplomaticChanges: [],
    attritionLosses: [],
    economy: [],
    diet: { turn, ...structuredClone(diet) },
    world: { season: 'SPRING', event: null, coalitions: [] },
    events: [],
    notifications: [],
    encirclements: [],
    desertions: [],
  };
}

export interface GameNotification {
  id: string;
  turn: number;
  type:
    | 'DECLARE_WAR'
    | 'CALL_TO_ARMS'
    | 'SIEGE_STARTED'
    | 'PEACE_OFFER'
    | 'BATTALION_WIPED'
    | 'VICTORY_WARNING'
    | 'BOMBARDMENT'
    | 'BATTLE'
    | 'ENCIRCLEMENT'
    | 'EMERGENCY_LEVY'
    | 'ECONOMY'
    | 'DIPLOMACY'
    | 'WORLD';
  text: string;
  involvesPlayerIds: string[];
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  focusProvinceId?: string;
  offerId?: string;
}
