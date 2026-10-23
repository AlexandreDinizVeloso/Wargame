import { BALANCE, ECONOMY_BALANCE } from '../shared/balance';
export { BALANCE } from '../shared/balance';
import { executeSupremeCommand } from './supreme';
import { executeMassRecruitment } from './massRecruitment';
import { realmTurnAnalytics } from '../shared/campaignAnalytics';
import {
  buildingLevel,
  buildingSlots,
  canBuild,
  constructionType,
  setBuildingLevel,
} from '../shared/development';
import {
  getNationAuthority,
  authorityIncome,
  integerEventText,
  moraleRecovery,
  realmLimits,
  recruitedCount,
  recruitmentBlock,
  spendNationAuthority,
  syncNationAuthority,
} from '../shared/economy';
import { goldRules } from '../shared/factions';
import { computeVisibleProvinces, verticalRules, visionPartners } from '../shared/fogOfWar';
import { invasionAttrition, supplyConsumption } from '../shared/logistics';
import { makeMap, WORLD_STARTS } from '../shared/map';
import { bombardmentBlock } from '../shared/maritime';
import { commanderFor, hasSkill, movementAllowance } from '../shared/military';
import { friendlyRest, isDisorganized, markDisorganized, offensiveBlock } from '../shared/morale';
import { bridgeOptions } from '../shared/naval';
import { neutralTarget } from '../shared/neutral';
import {
  attritionLoss,
  atWar,
  canTransit,
  canTraverse,
  clamp,
  compositionOf,
  controller,
  dietSnapshot,
  getRelation,
  isBlockaded,
  landCount,
  livingPlayers,
  nationOf,
  NATIONS,
  orderCost,
  orderKey,
  orderProvinceId,
  realmEconomy,
  reservedResources,
  roundMoney,
  MONEY_EPSILON,
  shortestPath,
  UNIT_KEYS,
  unitCount,
  unitPath,
  victoryStatus,
  zeroComposition,
} from '../shared/rules';
import { SCENARIOS } from '../shared/scenarios';
import { effectiveSupply, isCamouflaged, seasonAt, winterActive } from '../shared/strategy';
import type {
  BotArchetype,
  GameCommand,
  GameMode,
  GameState,
  GameView,
  NationId,
  Player,
  PlayerOrder,
  Province,
  Theater,
  TurnResolutionReport,
} from '../shared/types';
import { emptyTurnReport } from '../shared/types';
import { autoMerge, instantArmyAction, recruitCommander, unlockSkill } from './armies';
import { planBot as planTacticalBot } from './botAI';
import { resolveBattle, safestRetreat } from './combat';
import { parseCommand, parseOrder } from './commands';
import { chooseDilemma, issueDilemmas, resolveUnansweredDilemmas } from './dilemmas';
import {
  answerOffer,
  callToArms,
  declareWar,
  diplomacy,
  offerPeace,
  syncWars,
  updateWarScores,
} from './diplomacy';
import { desertForMaintenance, recordGoldReparations } from './economy';
import { emergencyLevy } from './emergency';
import { eraTransition } from './goldWorld';
import { applyEncirclement } from './logistics';
import { resolveBombardments } from './maritime';
import { canSeeNotification, notify } from './notifications';
import { applyScenario } from './scenarios';
import { advanceSieges, assaultSiege } from './siege';
import {
  assert,
  battalionOf,
  canStand,
  createBattalion,
  destroyBattalion,
  liveArmySize,
  log,
  mergeBattalions,
  playerOf,
  provinceOf,
  removeUnits,
  roll,
  setNation,
  syncCargo,
} from './state';
import { prepareTransport, resolveBridges } from './transport';
import { advanceWorld, coalitionWar, dealObjectives, endWorld, joinCoalition } from './world';
export { assert, canAttack } from './state';
export { parseCommand, parseOrder };

const ARCHETYPES: BotArchetype[] = ['Militarist', 'Merchant', 'Theocrat', 'Diplomat'];
export function createGame(
  code: string,
  mode: GameMode = 'quick',
  demo = false,
  seed?: number,
  theater: Theater = 'EUROPE',
): GameState {
  let hash = 2166136261;
  for (const c of code) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const maxTurns = 0,
    turnSeconds = 60;
  return {
    version: 7,
    allowBotSecretVictory: false,
    graceUntilTurn: 2,
    sandboxContinued: false,
    victoryRecord: null,
    notifications: [],
    notificationReads: {},
    roomName: `Campanha ${code}`,
    isPublic: true,
    enableSecretObjectives: true,
    season: 'SPRING',
    globalEvent: null,
    coalitions: [],
    visionContracts: [],
    firstReadyPlayerName: null,
    turnDeadlineAt: null,
    code,
    hostId: '',
    phase: 'lobby',
    turn: 1,
    maxTurns,
    seed: seed ?? hash >>> 0,
    nextId: 1,
    mode,
    theater,
    matchConfig: {
      mode,
      theater,
      mapId: mode === 'quick' ? `natural-earth-v101-${theater}` : 'natural-earth-v101-world',
      maxTurns,
      turnSeconds,
      createdVersion: '1.0.1',
      allowBotSecretVictory: false,
      enableSecretObjectives: true,
    },
    players: [],
    provinces: makeMap(mode, theater),
    battalions: [],
    commanders: [],
    relations: [],
    offers: [],
    wars: [],
    diet: {
      emperorId: null,
      imperialAuthority: 30,
      memberRealmIds: [],
      peaceTurnsCounter: 0,
      retaliationEdictActive: false,
      votes: {},
      bannedRealmIds: [],
    },
    reparations: [],
    orders: {},
    log: [],
    chat: [],
    winnerId: null,
    winnerObjective: null,
    finishReason: null,
    turnSeconds,
    deadline: null,
    demo,
    paused: false,
    persistenceEnabled: false,
    baseUpkeep: BALANCE.baseUpkeep,
    lastReport: null,
    reports: [],
    history: [],
    pendingDiplomacy: [],
  };
}
export function addPlayer(
  g: GameState,
  name: string,
  bot = false,
  nationId?: NationId,
  archetype?: BotArchetype,
) {
  assert(g.phase === 'lobby', 'A campanha já começou.');
  assert(g.players.length < 8, 'Sala cheia.');
  const available = NATIONS.filter((n) => !g.players.some((p) => p.nationId === n.id));
  const nation = nationId ? available.find((n) => n.id === nationId) : available[0];
  assert(nation, 'Essa nação já foi escolhida.');
  const p: Player = {
    id: `${g.code}-p${g.players.length + 1}`,
    name: name.trim().slice(0, 30) || 'Estrategista',
    nationId: nation.id,
    nation: nation.name,
    color: nation.color,
    faith: nation.religion,
    religiousPolicy: 'TOLERANCE',
    bot,
    botArchetype: archetype ?? ARCHETYPES[g.players.length % 4],
    online: true,
    ready: bot,
    gold: BALANCE.initialGold,
    manpower: BALANCE.initialManpower,
    influence: BALANCE.initialAuthority,
    prestige: 0,
    stability: 100,
    warExhaustion: 0,
    wonBattles: 0,
    conversions: 0,
    tradeEarned: 0,
    subjectOfId: null,
    moraleBonusUntil: 0,
    disarmUntil: 0,
    armyCap: 12,
    manpowerCap: ECONOMY_BALANCE.manpowerCapacityBase,
    emergencyLevyTurn: null,
    homelandDefenseUntil: 0,
    lostProvinceIds: [],
    aggressiveExpansion: 0,
    fervor: 0,
    secretObjectives: [],
    selectedObjectiveId: null,
    objectiveStreak: 0,
    originalCapitalId: null,
    militaryXP: 0,
    authority: 0,
    activeDilemma: null,
    afkStreak: 0,
    afkRegent: false,
    unlockedSkills: [],
    paxStreak: 0,
  };
  for (const other of g.players)
    g.relations.push({
      a: other.id,
      b: p.id,
      allied: false,
      truceUntil: 0,
      trust: 10,
      atWar: false,
      militaryAccess: [],
      embargoes: [],
      tribute: null,
    });
  syncNationAuthority(p);
  g.players.push(p);
  g.orders[p.id] = [];
  if (!g.hostId) g.hostId = p.id;
  return p;
}
export function setMode(g: GameState, mode: GameMode, theater: Theater = g.theater) {
  assert(g.phase === 'lobby', 'Escolha o cenário antes de começar.');
  const scenario = SCENARIOS.find((s) => s.id === g.matchConfig.scenarioId);
  assert(
    !goldRules(g) ||
      ((!scenario?.mode || scenario.mode === mode) &&
        (!scenario?.theater || scenario.theater === theater)),
    'O cenário fixa o mapa e o teatro desta campanha.',
  );
  const config = g.matchConfig;
  const next = createGame(g.code, mode, g.demo, g.seed, theater);
  g.mode = mode;
  g.theater = theater;
  g.provinces = next.provinces;
  g.matchConfig = {
    ...config,
    mode,
    theater,
    mapId: next.matchConfig.mapId,
    enableSecretObjectives: g.enableSecretObjectives,
    allowBotSecretVictory: g.allowBotSecretVictory,
    turnSeconds: g.turnSeconds,
  };
  g.maxTurns = next.maxTurns;
}
export function startGame(g: GameState, _now = 0) {
  assert(
    g.phase === 'lobby' && g.players.length >= 3 && g.players.length <= 8,
    'Reúna de 3 a 8 jogadores.',
  );
  const homes = new Map<string, Province>();
  const reservedHomes = new Set<string>();
  for (const p of g.players) {
    const preferred = g.provinces.find(
      (q) =>
        q.kind === 'LAND' &&
        q.id ===
          (g.mode === 'campaign'
            ? WORLD_STARTS[p.nationId][0]
            : {
                aurelia: 'germany',
                sol_invicto: 'italy',
                kaldor: 'france',
                vespera: 'castile',
                ferro_norte: 'scandinavia',
                turan: 'muscovy',
                sapiencia: 'poland',
                veridia: 'balkans',
              }[p.nationId]) &&
        !reservedHomes.has(q.id),
    );
    if (preferred) {
      homes.set(p.id, preferred);
      reservedHomes.add(preferred.id);
    }
  }
  for (const p of g.players)
    if (!homes.has(p.id)) {
      const home =
        g.provinces.find((q) => q.kind === 'LAND' && q.isCoastal && !reservedHomes.has(q.id)) ??
        g.provinces.find((q) => q.kind === 'LAND' && !reservedHomes.has(q.id));
      assert(home, 'Mapa sem espaço.');
      homes.set(p.id, home);
      reservedHomes.add(home.id);
    }
  if (g.mode === 'quick') {
    const preferences = new Map(homes);
    homes.clear();
    reservedHomes.clear();
    for (const p of g.players) {
      const candidates = g.provinces.filter((q) => q.kind === 'LAND' && !reservedHomes.has(q.id));
      const distance = (q: Province) =>
        homes.size
          ? Math.min(
              ...[...homes.values()].map(
                (h) =>
                  shortestPath(g.provinces, h.id, q.id, (x) => x.kind === 'LAND')?.length ?? 100,
              ),
            )
          : 100;
      const pref = preferences.get(p.id);
      const home =
        pref && !reservedHomes.has(pref.id) && distance(pref) >= 2
          ? pref
          : candidates.sort(
              (a, b) =>
                distance(b) - distance(a) ||
                Number(b.isCoastal) - Number(a.isCoastal) ||
                a.id.localeCompare(b.id),
            )[0];
      assert(home, 'Mapa sem espaço para capitais.');
      homes.set(p.id, home);
      reservedHomes.add(home.id);
    }
  }
  for (const p of g.players) {
    const home = homes.get(p.id)!;
    home.ownerId = p.id;
    home.capitalOf = p.id;
    home.maxBuildingSlots = buildingSlots(home);
    home.pacification = 100;
    home.unrest = 5;
    home.religion = p.faith;
    home.portLevel = home.isCoastal ? 1 : 0;
  }
  const hasSupportTerritories =
    g.provinces.filter((q) => q.kind === 'LAND').length >= g.players.length * 2;
  for (const p of g.players) {
    const nation = nationOf(p.nationId),
      home = homes.get(p.id)!;
    const designated =
      g.mode === 'campaign'
        ? g.provinces.find((q) => q.id === WORLD_STARTS[p.nationId][1] && !q.ownerId)
        : null;
    const support =
      designated ??
      home.neighbors.map((id) => provinceOf(g, id)).find((q) => q.kind === 'LAND' && !q.ownerId) ??
      g.provinces
        .filter((q) => q.kind === 'LAND' && !q.ownerId)
        .sort(
          (a, b) =>
            (shortestPath(g.provinces, home.id, a.id)?.length ?? 999) -
              (shortestPath(g.provinces, home.id, b.id)?.length ?? 999) || a.id.localeCompare(b.id),
        )[0];
    assert(!hasSupportTerritories || support, 'Mapa sem espaço para guarnições.');
    if (hasSupportTerritories && support) {
      support.ownerId = p.id;
      support.pacification = 100;
      support.unrest = 5;
      support.religion = p.faith;
    }
    createBattalion(
      g,
      p.id,
      home.id,
      { ...nation.initial, warships: 0, transports: 0 },
      { name: `Exército de ${home.name}`, morale: 80, training: 1.2 },
    );
    if (hasSupportTerritories && support)
      createBattalion(
        g,
        p.id,
        support.id,
        { ...zeroComposition(), infantry: 3 },
        { name: `Guarda de ${support.name}`, morale: 75, training: 1.15 },
      );
    if (home.portLevel)
      createBattalion(
        g,
        p.id,
        home.id,
        {
          ...zeroComposition(),
          warships: nation.initial.warships,
          transports: nation.initial.transports,
        },
        { name: `Armada de ${p.nation}`, isFleet: true, morale: 80, training: 1.2 },
      );
  }
  for (const p of g.provinces.filter((p) => p.kind === 'LAND' && !p.ownerId))
    createBattalion(
      g,
      'NEUTRAL',
      p.id,
      { ...zeroComposition(), infantry: 2 },
      { name: `Milícia de ${p.name}`, morale: 55, training: 1.05 },
    );
  for (const p of g.players) {
    const a = g.battalions.find((a) => a.ownerId === p.id && !a.isFleet)!;
    const trait =
      p.nationId === 'veridia'
        ? 'FOREST_RANGER'
        : p.nationId === 'turan' || p.nationId === 'ferro_norte'
          ? 'BLITZ_VANGUARD'
          : p.nationId === 'kaldor' || p.nationId === 'sapiencia'
            ? 'SIEGE_MASTER'
            : p.nationId === 'vespera'
              ? 'QUARTERMASTER'
              : 'IRON_WALL';
    recruitCommander(g, p.id, false, trait, undefined, true).assignedBattalionId = a.id;
  }
  // Normalize the fiscal base of each starting capital for the specified opening budget.
  for (const p of g.players) {
    const home = homes.get(p.id)!;
    const before = realmEconomy(g, p.id).net;
    home.baseTax++;
    const delta = realmEconomy(g, p.id).net - before;
    home.baseTax = roundMoney(
      Math.max(1, home.baseTax - 1 + (BALANCE.openingNetTarget - before) / Math.max(0.01, delta)),
    );
  }
  for (const p of g.players) {
    const l = realmLimits(g, p.id);
    p.armyCap = l.armyCap;
    p.manpowerCap = l.manpowerCap;
    p.manpower = Math.min(p.manpower, l.manpowerCap);
  }
  applyScenario(g);
  eraTransition(g);
  g.phase = 'planning';
  g.deadline = null;
  g.turnDeadlineAt = null;
  g.firstReadyPlayerName = null;
  dealObjectives(g);
  g.paused = false;
  log(g, 'A campanha começou. Batalhões e cidades recebem ordens independentes.');
}
export function validateOrder(g: GameState, id: string, o: PlayerOrder) {
  const actor = playerOf(g, id);
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  if (o.type === 'DIPLOMACY') return;
  if ('battalionId' in o && o.type !== 'RECRUIT_BATTALION') {
    const a = battalionOf(g, o.battalionId);
    assert(a.ownerId === id, 'Esse batalhão não pertence a você.');
    assert(!a.stranded, 'A formação isolada precisa se reagrupar.');
    if (o.type !== 'EMBARK_BATTALION')
      assert(!a.embarkedOnId, 'Desembarque o batalhão antes de dar essa ordem.');
    if (o.type === 'MOVE_BATTALION') {
      const destination = g.provinces.find((p) => p.id === (o.path?.at(-1) ?? o.targetProvinceId));
      if (destination) {
        const reason = offensiveBlock(g, a, destination);
        assert(!reason, reason ?? 'Ofensiva bloqueada.');
      }
      assert(
        !a.isFleet ||
          !(g.orders[id] ?? []).some(
            (old) =>
              (old.type === 'NAVAL_BRIDGE' || old.type === 'AUTO_TRANSPORT') &&
              old.fleetId === a.id,
          ),
        'Frota reservada para ponte naval.',
      );
      const path = o.path ?? unitPath(g, a, o.targetProvinceId ?? '');
      assert(
        path && path.length > 0 && path.length <= 100,
        'Não existe uma rota legal até esse destino.',
      );
      let last = a.provinceId;
      const seen = new Set([last]);
      for (const next of path) {
        const p = provinceOf(g, next);
        assert(
          !seen.has(next) &&
            provinceOf(g, last).neighbors.includes(next) &&
            canTraverse(g, a, provinceOf(g, last), p),
          'Caminho inválido ou guerra/acesso não autorizado.',
        );
        seen.add(next);
        last = next;
      }
    } else if (o.type === 'BOMBARD_COAST') {
      const target = provinceOf(g, o.targetProvinceId),
        reason = bombardmentBlock(g, a, target);
      assert(!reason, reason ?? 'Bombardeio indisponível.');
      assert(
        !a.pathQueue.length &&
          !(g.orders[id] ?? []).some(
            (old) =>
              (old.type === 'AUTO_TRANSPORT' || old.type === 'NAVAL_BRIDGE') &&
              old.fleetId === a.id,
          ),
        'Frota reservada para movimento ou transporte.',
      );
    } else if (o.type === 'ASSAULT_SIEGE') {
      assert(!isDisorganized(a), 'Descanse a formação antes de assaltar o cerco.');
      const p = provinceOf(g, a.provinceId);
      assert(
        !a.isFleet && p.siege?.attackerOwnerId === id && a.infantry > 0,
        'Cerco próprio com infantaria exigido.',
      );
    } else if (o.type === 'AUTO_TRANSPORT') {
      assert(
        o.seaPath?.length && (!o.fleetId || g.battalions.some((f) => f.id === o.fleetId)),
        'Travessia não preparada.',
      );
    } else if (o.type === 'NAVAL_BRIDGE') {
      const reason = offensiveBlock(g, a, provinceOf(g, o.targetProvinceId));
      assert(!reason, reason ?? 'Ofensiva bloqueada.');
      const target = provinceOf(g, o.targetProvinceId),
        fleet = battalionOf(g, o.fleetId);
      assert(
        canTraverse(g, a, provinceOf(g, a.provinceId), target) &&
          bridgeOptions(g, a, target).some((f) => f.id === fleet.id),
        'Travessia exige duas costas na mesma zona e frota com capacidade.',
      );
      assert(
        fleet.pathQueue.length === 0 &&
          !(g.orders[id] ?? []).some(
            (old) =>
              (old.type === 'MOVE_BATTALION' || old.type === 'BOMBARD_COAST') &&
              old.battalionId === fleet.id,
          ),
        'Frota da ponte não pode marchar nessa rodada.',
      );
      const used = (g.orders[id] ?? [])
        .filter(
          (old) =>
            (old.type === 'NAVAL_BRIDGE' || old.type === 'AUTO_TRANSPORT') &&
            old.fleetId === fleet.id &&
            old.battalionId !== a.id,
        )
        .reduce(
          (n, old) =>
            n +
            unitCount(
              g.battalions.find(
                (a) => a.id === (old as Extract<PlayerOrder, { type: 'NAVAL_BRIDGE' }>).battalionId,
              ) ?? {},
            ),
          0,
        );
      assert(used + unitCount(a) <= fleet.transports * 4, 'Capacidade da ponte já reservada.');
    } else if (o.type === 'RAZE_PROVINCE') {
      const p = provinceOf(g, a.provinceId);
      assert(
        ['turan', 'ferro_norte'].includes(actor.nationId) &&
          !a.isFleet &&
          controller(p) === id &&
          p.pacification <= 35 &&
          p.razedTurn === null,
        'Arrasar exige conquista recente ainda não saqueada.',
      );
    } else if (o.type === 'MERGE_ALL') {
      assert(!a.embarkedArmyId, 'Desembarque a carga antes da fusão.');
    } else if (o.type === 'TRAIN_BATTALION')
      assert(a.training < 1.5, 'Treinamento já está no máximo.');
    else if (o.type === 'ENTRENCH_BATTALION') assert(!a.isFleet, 'Frotas não se entrincheiram.');
    else if (o.type === 'MERGE_BATTALIONS') {
      const b = battalionOf(g, o.targetBattalionId);
      assert(
        a.id !== b.id &&
          b.ownerId === id &&
          a.provinceId === b.provinceId &&
          a.isFleet === b.isFleet &&
          a.isMercenary === b.isMercenary &&
          !b.embarkedOnId &&
          !a.embarkedArmyId &&
          !b.embarkedArmyId,
        'Formações incompatíveis para fusão.',
      );
    } else if (o.type === 'SPLIT_BATTALION') {
      assert(
        g.battalions.filter((a) => a.ownerId === id).length < 80,
        'Limite de 80 formações por reino.',
      );
      assert(!a.embarkedArmyId, 'Desembarque a carga antes de dividir.');
      for (const k of UNIT_KEYS)
        assert(o.composition[k] <= a[k], 'Composição maior que a formação.');
      assert(
        unitCount(o.composition) > 0 && unitCount(o.composition) < unitCount(a),
        'A divisão precisa deixar tropas dos dois lados.',
      );
    } else if (o.type === 'EMBARK_BATTALION') {
      if (o.disembarkProvinceId) {
        const reason = offensiveBlock(g, a, provinceOf(g, o.disembarkProvinceId));
        assert(!reason, reason ?? 'Ofensiva bloqueada.');
      }
      assert(!a.isFleet, 'Selecione o batalhão terrestre.');
      if (o.fleetId) {
        const fleet = battalionOf(g, o.fleetId),
          p = provinceOf(g, a.provinceId);
        assert(
          !a.embarkedOnId &&
            fleet.ownerId === id &&
            fleet.isFleet &&
            !fleet.stranded &&
            !fleet.embarkedArmyId &&
            fleet.transports * 4 >= unitCount(a),
          'Frota sem capacidade de transporte.',
        );
        assert(
          p.isCoastal &&
            p.portLevel >= 1 &&
            (a.provinceId === fleet.provinceId || p.neighbors.includes(fleet.provinceId)),
          'Embarque exige porto e frota próxima.',
        );
      } else {
        assert(a.embarkedOnId, 'Este batalhão não está embarcado.');
        const fleet = battalionOf(g, a.embarkedOnId),
          target = provinceOf(g, o.disembarkProvinceId!);
        assert(
          target.kind === 'LAND' &&
            target.isCoastal &&
            (fleet.provinceId === target.id ||
              provinceOf(g, fleet.provinceId).neighbors.includes(target.id)) &&
            canTransit(g, id, target),
          'Desembarque sem costa, acesso ou guerra formal.',
        );
      }
    }
  } else {
    const p = provinceOf(g, orderProvinceId(o, g)!);
    assert(p.kind === 'LAND', 'Ação de cidade exige terra.');
    if (o.type === 'CONVERT') {
      assert(p.religion !== actor.faith, 'A província já segue sua fé.');
      assert(
        controller(p) === id ||
          g.provinces.some((q) => controller(q) === id && q.neighbors.includes(p.id)),
        'Missão precisa ser própria ou adjacente.',
      );
      assert(
        !controller(p) || controller(p) === id || !getRelation(g, id, controller(p)!)?.allied,
        'Não envie missão hostil a um aliado.',
      );
    } else {
      assert(controller(p) === id, 'Você não controla essa província.');
      if (o.type !== 'PACIFY')
        assert(
          p.ownerId === id && !p.occupierId,
          'Construção e recrutamento exigem propriedade definitiva.',
        );
      const building = constructionType(o as import('../shared/types').CityOrder);
      if (building)
        assert(
          canBuild(p, building, actor),
          'Edifício exige slot disponível, nível permitido e litoral para porto.',
        );
      if (o.type === 'DEMOLISH_BUILDING')
        assert(buildingLevel(p, o.building) > 0, 'Esse edifício não existe.');
      if (o.type === 'RECRUIT_BATTALION') {
        assert(unitCount(o) > 0 && unitCount(o) <= 50, 'Recrute entre 1 e 50 unidades.');
        assert(
          o.isFleet
            ? landCount(o) === 0 && (o.warships ?? 0) + (o.transports ?? 0) > 0
            : (o.warships ?? 0) + (o.transports ?? 0) === 0 && landCount(o) > 0,
          'Não misture tropas e navios.',
        );
        const recruitReason = recruitmentBlock(p, o, g.turn, actor, g);
        assert(!recruitReason, recruitReason ?? 'Recrutamento inválido.');
        if (o.isMercenary) {
          const pending = (g.orders[id] ?? []).find(
            (old) => old.type === 'RECRUIT_BATTALION' && old.provinceId === p.id,
          );
          if (pending?.type === 'RECRUIT_BATTALION')
            assert(
              recruitedCount(p, g.turn) + unitCount(o) + unitCount(pending) <=
                (p.barracksLevel >= 2 || p.foundryLevel ? 7 : p.barracksLevel ? 4 : 2),
              'Há capacidade reservada para recrutamento regular.',
            );
        }
        if (o.isFleet) assert(p.portLevel >= 1, 'Construa um porto antes de recrutar navios.');
        if (o.isMercenary)
          assert(
            !o.isFleet &&
              (actor.nationId === 'vespera'
                ? p.portLevel > 0 || p.marketLevel > 0
                : p.capitalOf === id || p.pacification >= 80),
            'Mercenários exigem capital ou pacificação de 80.',
          );
        if (actor.disarmUntil >= g.turn && !o.isFleet) {
          const queued = (g.orders[id] ?? [])
            .filter(
              (old) =>
                orderKey(old) !== orderKey(o) && old.type === 'RECRUIT_BATTALION' && !old.isFleet,
            )
            .reduce(
              (n, old) => n + landCount(old as Extract<PlayerOrder, { type: 'RECRUIT_BATTALION' }>),
              0,
            );
          assert(
            liveArmySize(g, id) + queued + landCount(o) <= Math.min(8, realmLimits(g, id).armyCap),
            'O tratado limita seu exército.',
          );
        }
        if (o.battalionId) {
          const a = battalionOf(g, o.battalionId);
          assert(
            a.ownerId === id &&
              a.provinceId === p.id &&
              a.isFleet === !!o.isFleet &&
              a.isMercenary === !!o.isMercenary &&
              !a.embarkedOnId &&
              !a.stranded,
            'Reforço incompatível.',
          );
        }
        assert(
          g.battalions.filter((a) => a.ownerId === id).length < 80 || !!o.battalionId,
          'Limite de 80 formações por reino.',
        );
      }
    }
  }
  const cost = orderCost(
      o,
      g.provinces.find((p) => p.id === orderProvinceId(o, g)),
      actor,
      g,
    ),
    reserved = reservedResources(
      g,
      id,
      o.type === 'RECRUIT_BATTALION' && o.isMercenary ? undefined : orderKey(o),
    );
  assert(
    actor.gold - reserved.gold + MONEY_EPSILON >= cost.gold &&
      actor.manpower - reserved.manpower >= cost.manpower &&
      getNationAuthority(actor) - reserved.influence >= cost.influence,
    'Recursos livres insuficientes.',
  );
}
function recruit(g: GameState, id: string, o: Extract<PlayerOrder, { type: 'RECRUIT_BATTALION' }>) {
  const local = provinceOf(g, o.provinceId);
  const blocked = recruitmentBlock(local, o, g.turn, playerOf(g, id), g);
  assert(!blocked, blocked ?? 'Recrutamento indisponível.');
  local.recruitedThisTurn = recruitedCount(local, g.turn) + unitCount(o);
  local.recruitmentTurn = g.turn;
  const incoming = compositionOf(o),
    city = provinceOf(g, o.provinceId),
    training = Math.min(
      1.5,
      (playerOf(g, id).nationId === 'sapiencia' ? 1.2 : 1) +
        (city.barracksLevel > 0 ? 0.1 : 0) +
        (city.barracksLevel >= 2 || city.foundryLevel >= 1 ? 0.1 : 0),
    ),
    equipment = 1 + 0.1 * city.foundryLevel;
  if (o.battalionId) {
    const target = battalionOf(g, o.battalionId);
    const virtual = {
      ...target,
      ...incoming,
      training,
      infantryPower: equipment,
      artilleryPower: equipment,
      morale: 60,
    };
    mergeBattalions(target, virtual);
  } else
    createBattalion(g, id, o.provinceId, incoming, {
      isFleet: o.isFleet,
      isMercenary: o.isMercenary,
      name: o.name,
      morale: 60,
      training,
      infantryPower: equipment,
      artilleryPower: equipment,
    });
}
export function submitOrder(g: GameState, id: string, raw: PlayerOrder) {
  const o = prepareTransport(g, id, parseOrder(raw));
  validateOrder(g, id, o);
  if (o.type === 'MERGE_BATTALIONS' || o.type === 'SPLIT_BATTALION' || o.type === 'MERGE_ALL') {
    instantArmyAction(g, id, o);
    return;
  }
  if (o.type === 'DIPLOMACY') {
    const authorityCost = orderCost(o, undefined, playerOf(g, id), g).influence;
    diplomacy(g, id, o);
    spendNationAuthority(playerOf(g, id), authorityCost);
    return;
  }
  if (o.type === 'RECRUIT_BATTALION' && o.isMercenary) {
    const actor = playerOf(g, id),
      cost = orderCost(o, provinceOf(g, o.provinceId), actor, g);
    actor.gold = roundMoney(actor.gold - cost.gold);
    recruit(g, id, o);
    return;
  }
  const key = orderKey(o);
  g.orders[id] = [...g.orders[id].filter((old) => orderKey(old) !== key), o];
  playerOf(g, id).ready = false;
}
export function cancelOrder(g: GameState, id: string, key: string) {
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  g.orders[id] = g.orders[id].filter((o) => orderKey(o) !== key);
  if (key.startsWith('army:')) {
    const army = g.battalions.find((a) => a.id === key.slice(5) && a.ownerId === id);
    if (army) army.pathQueue = [];
  }
  playerOf(g, id).ready = false;
}
export function refreshScores(g: GameState) {
  for (const r of g.relations) r.trust = clamp(r.trust, -100, 100);
  for (const p of g.players) syncNationAuthority(p);
}
function resolveLocal(
  g: GameState,
  id: string,
  o: PlayerOrder,
  report: TurnResolutionReport,
  moved: Set<string>,
) {
  const actor = playerOf(g, id),
    p = g.provinces.find((p) => p.id === orderProvinceId(o, g));
  const cost = orderCost(o, p, actor, g);
  if (
    actor.gold < cost.gold ||
    actor.manpower < cost.manpower ||
    getNationAuthority(actor) < cost.influence
  )
    return;
  if (
    o.type === 'DIPLOMACY' ||
    o.type === 'NAVAL_BRIDGE' ||
    o.type === 'AUTO_TRANSPORT' ||
    o.type === 'BOMBARD_COAST'
  )
    return;
  if (o.type === 'CONVERT') {
    if (
      !p ||
      p.religion === actor.faith ||
      (controller(p) !== id && controller(p) && getRelation(g, id, controller(p)!)?.allied)
    )
      return;
    if (p.conversionReligion !== actor.faith) {
      p.conversion = 0;
      p.conversionReligion = actor.faith;
    }
    p.conversion += actor.religiousPolicy === 'INQUISITION' ? 100 : 50;
    if (p.conversion >= 100) {
      const from = p.religion,
        crossBorder = controller(p) !== id;
      p.religion = actor.faith;
      p.conversion = 0;
      p.conversionReligion = null;
      p.conversionInstigatorId = crossBorder ? id : null;
      if (crossBorder) p.unrest = clamp(p.unrest + 20);
      actor.conversions++;
      if (actor.nationId === 'sol_invicto') {
        actor.gold = roundMoney(actor.gold + ECONOMY_BALANCE.conversionGold);
        actor.militaryXP += ECONOMY_BALANCE.authorityFromConversion;
      }
      report.conversions.push({
        provinceId: p.id,
        actorId: id,
        ownerId: p.ownerId,
        from,
        to: actor.faith,
        crossBorder,
      });
    }
  } else if ('battalionId' in o && o.type !== 'RECRUIT_BATTALION') {
    const a = g.battalions.find((a) => a.id === o.battalionId);
    if (!a || a.ownerId !== id) return;
    if (o.type === 'MOVE_BATTALION') {
      a.pathQueue = o.path ?? unitPath(g, a, o.targetProvinceId!) ?? [];
      a.entrenched = false;
    }
    if (o.type === 'ENTRENCH_BATTALION') {
      a.entrenched = true;
      a.pathQueue = [];
    }
    if (o.type === 'RAZE_PROVINCE') {
      moved.add(a.id);
      const q = provinceOf(g, a.provinceId);
      if (q.razedTurn !== null || controller(q) !== id || q.pacification > 35) return;
      q.razedTurn = g.turn;
      q.unrest = clamp(q.unrest + 40);
      q.pacification = 0;
      actor.gold = roundMoney(actor.gold + ECONOMY_BALANCE.razeGold);
      if (actor.nationId === 'ferro_norte') a.morale = clamp(a.morale + 25);
      report.events.push(
        `${actor.nation} arrasou ${q.name} e recebeu ${ECONOMY_BALANCE.razeGold} ouro.`,
      );
    }
    if (o.type === 'ASSAULT_SIEGE') {
      moved.add(a.id);
      assaultSiege(g, a, provinceOf(g, a.provinceId), report);
    }
    if (o.type === 'TRAIN_BATTALION') {
      moved.add(a.id);
      actor.militaryXP += ECONOMY_BALANCE.authorityFromTraining;
      a.training = Math.min(1.5, a.training + 0.1);
      a.morale = clamp(a.morale + 8);
      a.pathQueue = [];
    }
    if (o.type === 'EMBARK_BATTALION') {
      if (o.fleetId) {
        const f = g.battalions.find((b) => b.id === o.fleetId);
        if (!f || f.embarkedArmyId || f.transports * 4 < unitCount(a)) return;
        const from = a.provinceId;
        moved.add(a.id);
        a.embarkedOnId = f.id;
        a.provinceId = f.provinceId;
        f.embarkedArmyId = a.id;
        a.pathQueue = [];
        a.entrenched = false;
        report.movements.push({
          battalionId: a.id,
          ownerId: id,
          fromProvinceId: from,
          toProvinceId: a.provinceId,
          isFleet: false,
          troops: unitCount(a),
        });
      } else if (a.embarkedOnId) {
        if (offensiveBlock(g, a, provinceOf(g, o.disembarkProvinceId!))) {
          report.events.push(`${a.name}: desembarque cancelado por desorganização.`);
          return;
        }
        const f = battalionOf(g, a.embarkedOnId),
          target = provinceOf(g, o.disembarkProvinceId!);
        delete a.embarkedOnId;
        delete f.embarkedArmyId;
        const from = a.provinceId;
        a.provinceId = target.id;
        resolveBattle(g, a, target, report);
        moved.add(a.id);
        report.movements.push({
          battalionId: a.id,
          ownerId: id,
          fromProvinceId: from,
          toProvinceId: target.id,
          isFleet: false,
          troops: unitCount(a),
        });
      }
    }
  } else if (p && controller(p) === id) {
    if (o.type === 'RECRUIT_BATTALION') {
      if (o.battalionId) {
        const target = g.battalions.find((a) => a.id === o.battalionId);
        if (!target || target.ownerId !== id || target.provinceId !== p.id) return;
      }
      if (
        actor.disarmUntil >= g.turn &&
        !o.isFleet &&
        liveArmySize(g, id) + landCount(o) > Math.min(8, realmLimits(g, id).armyCap)
      )
        return;
      if (recruitmentBlock(p, o, g.turn, actor, g)) return;
      recruit(g, id, o);
    }
    const building = constructionType(o as import('../shared/types').CityOrder);
    if (building) {
      if (!canBuild(p, building, actor)) return;
      setBuildingLevel(p, building, buildingLevel(p, building) + 1);
    }
    if (o.type === 'DEMOLISH_BUILDING') setBuildingLevel(p, o.building, 0);
    if (o.type === 'PACIFY') {
      const speed =
        (actor.faith === 'ANCESTRAL' ? 1.15 : 1) *
        (nationOf(actor.nationId).modifiers.pacification ?? 1) *
        (goldRules(g) && actor.nationId === 'aurelia' ? 1.5 : 1) *
        (1 + 0.25 * (p?.templeLevel ?? 0));
      p.pacification = clamp(p.pacification + 35 * speed);
      p.unrest = clamp(p.unrest - 25);
    }
  } else return;
  actor.gold = roundMoney(actor.gold - cost.gold);
  actor.manpower -= cost.manpower;
  spendNationAuthority(actor, cost.influence);
}
function recoverAndRepatriate(
  g: GameState,
  report: TurnResolutionReport,
  moved: Set<string>,
  recover = true,
) {
  for (const a of [...g.battalions]) {
    if ((a.ownerId === 'NEUTRAL' && !a.stranded) || a.embarkedOnId) continue;
    const p = provinceOf(g, a.provinceId);
    if (a.stranded && recover) {
      const safe = safestRetreat(g, a);
      if (safe) {
        const from = a.provinceId;
        a.provinceId = safe.id;
        a.stranded = false;
        a.morale = 15;
        syncCargo(g, a);
        moved.add(a.id);
        report.retreats.push({
          armyId: a.id,
          ownerId: a.ownerId,
          fromProvinceId: from,
          toProvinceId: safe.id,
          survivors: unitCount(a),
          regrouped: unitCount(a),
          dispersed: 0,
          morale: 15,
          stranded: false,
          reason: 'regrouping',
        });
      } else if (a.morale === 0) {
        report.stackwipes.push({
          armyId: a.id,
          ownerId: a.ownerId,
          provinceId: p.id,
          troops: unitCount(a),
          reason: 'zero_morale_no_escape',
        });
        destroyBattalion(g, a);
      } else a.morale = 0;
      continue;
    }
    if (!a.stranded && !canStand(g, a, p)) {
      const safe =
        safestRetreat(g, a) ??
        g.provinces.find(
          (p) =>
            p.kind === 'LAND' && controller(p) === a.ownerId && (!a.isFleet || p.portLevel > 0),
        );
      const from = a.provinceId;
      a.pathQueue = [];
      a.entrenched = false;
      a.morale = 15;
      a.stranded = !safe;
      if (safe) a.provinceId = safe.id;
      syncCargo(g, a);
      moved.add(a.id);
      report.retreats.push({
        armyId: a.id,
        ownerId: a.ownerId,
        fromProvinceId: from,
        toProvinceId: safe?.id ?? null,
        survivors: unitCount(a),
        regrouped: unitCount(a),
        dispersed: 0,
        morale: 15,
        stranded: !safe,
        reason: 'repatriation',
      });
    }
  }
}
function moveBattalions(g: GameState, report: TurnResolutionReport, moved: Set<string>) {
  const marching = g.battalions
    .filter((a) => a.pathQueue.length && !a.embarkedOnId && !a.stranded)
    .sort((a, b) => roll(g, a.id) - roll(g, b.id));
  for (const a of marching) {
    const actor = g.players.find((p) => p.id === a.ownerId),
      immune = actor?.nationId === 'ferro_norte';
    a.movementPoints = movementAllowance(g, a);
    a.movementCredit = Math.min(
      Math.max(2, a.movementPoints),
      (a.movementCredit ?? 0) +
        (a.isFleet &&
        winterActive(g) &&
        !immune &&
        a.blitzUntilTurn !== g.turn &&
        !hasSkill(g, a.ownerId, 'NAV_T3')
          ? 0.75
          : a.movementPoints),
    );
    for (
      let step = 0;
      step < a.movementPoints && a.pathQueue.length && g.battalions.some((b) => b.id === a.id);
      step++
    ) {
      const from = provinceOf(g, a.provinceId),
        target = g.provinces.find((p) => p.id === a.pathQueue[0]);
      if (!target || !from.neighbors.includes(target.id) || !canTraverse(g, a, from, target)) {
        a.pathQueue = [];
        report.events.push(
          `${a.name}: ${target ? (offensiveBlock(g, a, target) ?? 'rota interrompida por fronteira ou tratado.') : 'destino indisponível.'}`,
        );
        break;
      }
      const cost =
        target.terrain === 'forest' &&
        !from.straitNeighbors.includes(target.id) &&
        !a.isFleet &&
        !immune &&
        a.blitzUntilTurn !== g.turn &&
        commanderFor(g, a)?.trait !== 'BLITZ_VANGUARD'
          ? 1.5
          : 1;
      if (a.movementCredit < cost) break;
      if (
        step > 0 &&
        !a.isFleet &&
        !hasSkill(g, a.ownerId, 'CAV_T3') &&
        a.blitzUntilTurn !== g.turn &&
        (!['plains', 'coastal'].includes(from.terrain) ||
          !['plains', 'coastal'].includes(target.terrain) ||
          a.movementPoints < 2)
      )
        break;
      a.movementCredit -= cost;
      a.pathQueue.shift();
      a.entrenched = false;
      a.morale = clamp(a.morale - 6);
      a.previousProvinceId = from.id;
      a.lastMovedTurn = g.turn;
      a.provinceId = target.id;
      moved.add(a.id);
      const battles = report.battles.length;
      resolveBattle(g, a, target, report);
      if (report.battles.length > battles && report.battles.at(-1)?.outcome === 'siege_blocked') {
        a.provinceId = from.id;
        a.pathQueue = [];
        break;
      }
      if (g.battalions.some((b) => b.id === a.id)) syncCargo(g, a);
      report.movements.push({
        battalionId: a.id,
        ownerId: a.ownerId,
        fromProvinceId: from.id,
        toProvinceId: target.id,
        isFleet: a.isFleet,
        troops: unitCount(a),
      });
      if (report.battles.length > battles) break;
    }
  }
}
function stationaryClashes(g: GameState, report: TurnResolutionReport, moved: Set<string>) {
  const considered = new Set<string>(),
    maximum = g.battalions.length;
  for (const province of g.provinces) {
    for (let attempt = 0; attempt < maximum; attempt++) {
      const units = g.battalions.filter(
        (a) => a.provinceId === province.id && !a.embarkedOnId && !a.stranded && unitCount(a) > 0,
      );
      const eligible = units
        .filter(
          (a) =>
            a.ownerId !== 'NEUTRAL' &&
            !considered.has(a.id) &&
            (!isDisorganized(a) || controller(province) === a.ownerId),
        )
        .sort((a, b) => roll(g, `stationary:${a.id}`) - roll(g, `stationary:${b.id}`));
      const army =
        eligible.find(
          (a) =>
            !a.isFleet &&
            !!controller(province) &&
            controller(province) !== a.ownerId &&
            atWar(g, a.ownerId, controller(province)!),
        ) ??
        eligible.find((a) =>
          units.some(
            (b) => a.id !== b.id && a.isFleet === b.isFleet && atWar(g, a.ownerId, b.ownerId),
          ),
        );
      if (!army) break;
      considered.add(army.id);
      const before = report.battles.length;
      resolveBattle(g, army, province, report);
      if (report.battles.length > before) moved.add(army.id);
    }
  }
}
function applySupply(g: GameState, report: TurnResolutionReport) {
  const starving = new Set<string>();
  for (const a of [...g.battalions]) {
    if (a.supplySabotagedUntilTurn !== g.turn || a.embarkedOnId || a.stranded) continue;
    const before = unitCount(a),
      losses = Math.max(1, Math.ceil(before * 0.1));
    removeUnits(a, losses);
    starving.add(a.id);
    report.attritionLosses.push({
      armyId: a.id,
      ownerId: a.ownerId,
      provinceId: a.provinceId,
      troopsBefore: before,
      supplyLimit: 0,
      losses: before - unitCount(a),
    });
    report.events.push(
      `${a.name}: suprimento sabotado, ${before - unitCount(a)} baixa(s) por desabastecimento.`,
    );
    if (!unitCount(a)) destroyBattalion(g, a);
  }
  for (const p of g.provinces) {
    const armies = g.battalions.filter(
      (a) => a.provinceId === p.id && !a.embarkedOnId && !a.stranded,
    );
    for (const id of new Set(armies.map((a) => a.ownerId))) {
      const own = armies.filter((a) => a.ownerId === id),
        total = own.reduce(
          (n, a) => n + supplyConsumption(g, a, g.players.find((p) => p.id === id)?.nationId),
          0,
        );
      const group = own.filter(
          (a) =>
            commanderFor(g, a)?.trait !== 'QUARTERMASTER' &&
            !(a.isFleet && hasSkill(g, id, 'NAV_T3')),
        ),
        count = group.reduce((n, a) => n + unitCount(a), 0);
      const limit =
        effectiveSupply(g, id, p) +
        (own.some((a) => commanderFor(g, a)?.trait === 'QUARTERMASTER') ? 6 : 0);
      if (total <= limit || !count) continue;
      const immune = g.players.find((p) => p.id === id)?.nationId === 'ferro_norte',
        hostile = !!p.ownerId && p.ownerId !== id && atWar(g, id, p.ownerId);
      const losses = Math.min(
        count,
        Math.ceil((attritionLoss(total, limit) * count) / Math.max(1, total)) *
          (winterActive(g) && !immune && hostile ? 2 : 1) *
          invasionAttrition(g, p.id, id),
      );
      const shares = group.map((a) => Math.floor((losses * unitCount(a)) / count));
      let left = losses - shares.reduce((n, x) => n + x, 0);
      for (let i = 0; left > 0 && i < group.length; i++)
        if (shares[i] < unitCount(group[i])) {
          shares[i]++;
          left--;
        }
      for (const [i, a] of group.entries()) {
        starving.add(a.id);
        const before = unitCount(a);
        removeUnits(a, shares[i]);
        if (shares[i])
          report.attritionLosses.push({
            armyId: a.id,
            provinceId: p.id,
            ownerId: id,
            troopsBefore: before,
            supplyLimit: limit,
            losses: before - unitCount(a),
          });
        if (!unitCount(a)) destroyBattalion(g, a);
      }
      if (id !== 'NEUTRAL')
        notify(g, {
          type: 'ECONOMY',
          severity: 'WARNING',
          involvesPlayerIds: [id],
          focusProvinceId: p.id,
          text: `Falta de suprimentos em ${p.name}: ${losses} baixas e −20 moral por formação vulnerável. Divida as forças entre províncias ou amplie o suprimento.`,
        });
    }
  }
  return starving;
}
export function resolveTurn(g: GameState, _now = 0) {
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  issueDilemmas(g);
  const before = new Map(
    g.players.map((p) => [
      p.id,
      g.battalions.filter((a) => a.ownerId === p.id).reduce((n, a) => n + unitCount(a), 0),
    ]),
  );
  for (const a of g.battalions) {
    const province = g.provinces.find((p) => p.id === a.provinceId),
      actor = g.players.find((p) => p.id === a.ownerId);
    if (goldRules(g)) {
      a.moraleCap =
        actor?.nationId === 'aurelia' && province?.religion === 'SOLAR' && province.templeLevel > 0
          ? 110
          : 100;
      if (a.morale >= 100) a.morale = a.moraleCap;
    }
    markDisorganized(a);
  }
  const startLog = g.log.length;
  const startNoticeIds = new Set(g.notifications.map((n) => n.id));
  for (const bot of g.players.filter((p) => p.bot)) planBot(g, bot);
  const report = emptyTurnReport(g.turn, g.diet);
  resolveUnansweredDilemmas(g, report);
  report.diplomaticChanges = g.pendingDiplomacy.splice(0);
  advanceWorld(g, report);
  report.neutralDevelopments = g.provinces
    .filter((p) => p.neutralDevelopmentLevel > 0 && p.neutralDevelopmentTurn === g.turn)
    .map((p) => ({
      provinceId: p.id,
      level: p.neutralDevelopmentLevel,
      targetGarrison: neutralTarget(p),
      fortLevel: p.fortLevel,
    }));
  const moved = new Set<string>();
  const bridgeOrigins = new Map(g.battalions.map((a) => [a.id, a.provinceId]));
  recoverAndRepatriate(g, report, moved);
  const queued = g.players
    .flatMap((p) => (g.orders[p.id] ?? []).map((o) => ({ id: p.id, o })))
    .sort((a, b) => roll(g, orderKey(a.o) + a.id) - roll(g, orderKey(b.o) + b.id));
  for (const { id, o } of queued) resolveLocal(g, id, o, report, moved);
  moveBattalions(g, report, moved);
  for (const a of g.battalions)
    if (a.blitzUntilTurn === g.turn && moved.has(a.id)) a.movementCredit = 0;
  stationaryClashes(g, report, moved);
  resolveBombardments(g, report, moved, bridgeOrigins);
  resolveBridges(g, report, moved, bridgeOrigins);
  for (const b of report.battles)
    for (const id of [...b.attackerBattalionIds, ...b.defenderBattalionIds]) moved.add(id);
  autoMerge(g, moved);
  advanceSieges(g, report);
  const justOccupied = new Set(report.sieges.filter((s) => s.completed).map((s) => s.provinceId));
  for (const retreat of report.retreats) moved.add(retreat.armyId);
  recoverAndRepatriate(g, report, moved, false);
  for (const p of g.provinces.filter((p) => p.kind === 'LAND' && controller(p))) {
    const id = controller(p)!,
      actor = playerOf(g, id);
    const guard = g.battalions
      .filter(
        (a) =>
          a.ownerId === id &&
          a.provinceId === p.id &&
          !a.isFleet &&
          !a.embarkedOnId &&
          !moved.has(a.id) &&
          !justOccupied.has(p.id) &&
          !a.stranded,
      )
      .reduce((n, a) => n + unitCount(a), 0);
    if (guard >= 3) {
      p.pacification = clamp(
        p.pacification +
          15 *
            (actor.faith === 'ANCESTRAL' ? 1.15 : 1) *
            (nationOf(actor.nationId).modifiers.pacification ?? 1) *
            (goldRules(g) && actor.nationId === 'aurelia' ? 1.5 : 1) *
            (1 + 0.25 * p.templeLevel),
      );
      p.unrest = clamp(p.unrest - 10);
    }
    const total = g.battalions
      .filter(
        (a) =>
          a.ownerId === id && a.provinceId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded,
      )
      .reduce((n, a) => n + unitCount(a), 0);
    if (p.templeLevel > 0) {
      p.unrest = clamp(p.unrest - 15 * p.templeLevel);

      actor.stability = clamp(
        actor.stability + (goldRules(g) && actor.nationId === 'aurelia' ? 4 : 2) * p.templeLevel,
      );
    }
    if (p.pacification < 50 && total < 2) p.unrest = clamp(p.unrest + 15);
  }
  for (const p of g.players) {
    const active = g.wars.some(
      (w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(p.id),
    );
    const losses = report.battles.reduce((n, b) => n + (b.casualtiesByRealm[p.id] ?? 0), 0);
    p.warExhaustion = roundMoney(
      clamp(
        p.warExhaustion +
          (active
            ? BALANCE.exhaustionPerWarTurn +
              (BALANCE.exhaustionCasualtyFactor * losses) / Math.max(1, before.get(p.id) ?? 0)
            : -BALANCE.peaceRecovery),
      ),
    );
    if (g.globalEvent?.id === 'REBEL_AGITATORS')
      for (const q of g.provinces.filter((q) => controller(q) === p.id && q.pacification < 80))
        q.unrest = clamp(q.unrest + 12);
    if (!active) p.stability = clamp(p.stability + 1);
    p.armyCap = realmLimits(g, p.id).armyCap;
    for (const q of g.provinces.filter((q) => q.kind === 'LAND' && controller(q) === p.id)) {
      q.unrest = clamp(
        q.unrest +
          p.warExhaustion * 0.25 +
          (p.religiousPolicy === 'INQUISITION' && q.religion !== p.faith ? 6 : 0),
      );
    }
  }
  for (const p of g.provinces.filter(
    (p) => p.kind === 'LAND' && controller(p) && p.unrest >= 100,
  )) {
    const previousOwnerId = controller(p)!;
    p.ownerId = null;
    p.occupierId = null;
    if (goldRules(g)) p.siege = null;
    p.unrest = 40;
    p.pacification = 0;
    createBattalion(
      g,
      'NEUTRAL',
      p.id,
      { ...zeroComposition(), infantry: 2 },
      { name: `Rebeldes de ${p.name}` },
    );
    report.rebellions.push({ provinceId: p.id, previousOwnerId, rebelTroops: 2 });
    for (const a of g.battalions.filter(
      (a) =>
        a.ownerId === previousOwnerId && a.provinceId === p.id && !a.isFleet && !a.embarkedOnId,
    )) {
      const destination =
        safestRetreat(g, a) ??
        g.provinces.find((q) => controller(q) === previousOwnerId && q.kind === 'LAND');
      a.pathQueue = [];
      a.entrenched = false;
      a.morale = 15;
      a.stranded = !destination;
      if (destination) a.provinceId = destination.id;
      moved.add(a.id);
      report.retreats.push({
        armyId: a.id,
        ownerId: a.ownerId,
        fromProvinceId: p.id,
        toProvinceId: destination?.id ?? null,
        survivors: unitCount(a),
        regrouped: unitCount(a),
        dispersed: 0,
        morale: 15,
        stranded: !destination,
        reason: 'repatriation',
      });
    }
  }
  for (const movement of report.movements) {
    const unit = g.battalions.find((a) => a.id === movement.battalionId);
    if (unit) {
      unit.lastMovedTurn = g.turn;
      unit.previousProvinceId = movement.fromProvinceId;
    }
  }
  const survivingRealms = new Set(livingPlayers(g).map((p) => p.id));
  for (const p of g.players) {
    if (p.subjectOfId && !survivingRealms.has(p.subjectOfId)) p.subjectOfId = null;
    if (!survivingRealms.has(p.id)) {
      g.orders[p.id] = [];
      for (const q of g.provinces) {
        if (q.occupierId === p.id) q.occupierId = null;
        if (q.siege?.attackerOwnerId === p.id) q.siege = null;
      }
      for (const unit of [...g.battalions.filter((a) => a.ownerId === p.id)])
        destroyBattalion(g, unit);
    }
  }
  for (const war of g.wars.filter((w) => w.active)) {
    const attackers = war.attackerIds.filter((id) => survivingRealms.has(id));
    const defenders = war.defenderIds.filter((id) => survivingRealms.has(id));
    if (!attackers.length || !defenders.length) {
      war.active = false;
      war.endedTurn = g.turn;
      report.events.push(`${war.name}: guerra encerrada pela dissolução de um dos lados.`);
    } else {
      if (!survivingRealms.has(war.attackerLeaderId)) war.attackerLeaderId = attackers[0];
      if (!survivingRealms.has(war.defenderLeaderId)) war.defenderLeaderId = defenders[0];
    }
  }
  g.offers = g.offers.filter(
    (o) =>
      survivingRealms.has(o.from) &&
      survivingRealms.has(o.to) &&
      (!o.warId || g.wars.some((w) => w.id === o.warId && w.active)),
  );
  syncWars(g);
  const economies = new Map(g.players.map((p) => [p.id, realmEconomy(g, p.id)]));
  if (goldRules(g)) recordGoldReparations(g, report);
  const starving = applySupply(g, report);
  for (const f of g.battalions.filter((a) => a.isFleet && a.embarkedArmyId)) {
    const cargo = g.battalions.find((a) => a.id === f.embarkedArmyId);
    if (!cargo) continue;
    const excess = unitCount(cargo) - f.transports * 4;
    if (excess > 0) {
      removeUnits(cargo, excess);
      report.events.push(`${excess} tropas perderam transporte por atrito naval.`);
      if (unitCount(cargo) === 0) destroyBattalion(g, cargo);
    }
  }
  for (const p of g.players) {
    const eco = economies.get(p.id)!,
      bankrupt = p.gold + eco.net < 0;
    if (bankrupt) desertForMaintenance(g, p.id, -(p.gold + eco.net), eco.upkeep, report);
    p.gold = roundMoney(Math.max(0, p.gold + eco.net));
    p.armyCap = eco.armyCap;
    p.manpowerCap = eco.manpowerCap;
    if (p.manpower < eco.manpowerCap)
      p.manpower = Math.min(eco.manpowerCap, p.manpower + eco.manpower);
    if (g.provinces.some((q) => q.ownerId === p.id)) {
      const authorityDelta = authorityIncome(g, p.id);
      if (authorityDelta >= 0) p.militaryXP += authorityDelta;
      else if (!spendNationAuthority(p, -authorityDelta)) p.prestige += authorityDelta;
    }

    p.tradeEarned = roundMoney(p.tradeEarned + eco.trade);
    for (const a of g.battalions.filter((a) => a.ownerId === p.id && !a.stranded)) {
      a.morale = clamp(
        a.morale +
          (bankrupt
            ? -12
            : moved.has(a.id)
              ? 0
              : moraleRecovery(g, a) + (commanderFor(g, a)?.trait === 'IRON_WALL' ? 15 : 0)),
        0,
        a.moraleCap ?? 100,
      );
      if (starving.has(a.id)) a.morale = clamp(a.morale - 20);
      markDisorganized(a);
      if (
        !a.isFleet &&
        !bankrupt &&
        !moved.has(a.id) &&
        !starving.has(a.id) &&
        !a.encircled &&
        a.morale >= 25 &&
        friendlyRest(g, a.ownerId, provinceOf(g, a.provinceId))
      )
        a.disorganized = false;
    }
    report.economy.push({
      playerId: p.id,
      turn: g.turn,
      ...{
        taxes: eco.taxes,
        trade: eco.trade,
        maritimeTrade: eco.maritimeTrade,
        tithes: eco.tithes,
        industry: eco.industry,
        administration: eco.administration,
        buildingUpkeep: eco.buildingUpkeep,
        plunder: eco.plunder,
        grossIncome: eco.grossIncome,
        income: eco.income,
        upkeep: eco.upkeep,
        net: eco.net,
      },
      gold: p.gold,
      warExhaustion: p.warExhaustion,
    });
  }
  applyEncirclement(g, report);
  for (const r of g.reparations.filter((r) => !goldRules(g) && r.untilTurn >= g.turn)) {
    const payer = playerOf(g, r.payerId),
      recipient = playerOf(g, r.recipientId),
      amount = Math.min(
        payer.gold,
        roundMoney((economies.get(payer.id)?.grossIncome ?? 0) * r.rate),
      );
    payer.gold = roundMoney(payer.gold - amount);
    recipient.gold = roundMoney(recipient.gold + amount);
    report.diplomaticChanges.push({
      action: 'WAR_REPARATIONS_PAYMENT',
      actorId: payer.id,
      targetId: recipient.id,
      amount,
      provinceId: null,
      covert: false,
      text: `${payer.nation} pagou ${amount} ouro de reparações a ${recipient.nation}.`,
    });
  }
  g.reparations = g.reparations.filter((r) => r.untilTurn > g.turn);
  for (const r of g.relations)
    if (r.tribute) {
      if (r.tribute.untilTurn < g.turn) {
        r.tribute = null;
        continue;
      }
      const payer = playerOf(g, r.tribute.payerId),
        recipient = playerOf(g, r.tribute.recipientId),
        amount = Math.min(payer.gold, r.tribute.amount);
      payer.gold = roundMoney(payer.gold - amount);
      recipient.gold = roundMoney(recipient.gold + amount);
      report.diplomaticChanges.push({
        action: 'TRIBUTE_PAYMENT',
        actorId: payer.id,
        targetId: recipient.id,
        amount,
        provinceId: null,
        covert: false,
        text: `${payer.nation} pagou ${amount} ouro de tributo a ${recipient.nation}.`,
      });
    }
  for (const war of g.wars.filter((w) => w.active)) {
    let delta = 0;
    for (const p of g.provinces.filter((p) => p.kind === 'LAND' && isBlockaded(g, p))) {
      const owner = controller(p)!;
      if (war.defenderIds.includes(owner)) delta += 2;
      if (war.attackerIds.includes(owner)) delta -= 2;
    }
    war.blockadeScore = clamp(war.blockadeScore + delta, -40, 40);
  }
  for (const metric of report.economy) metric.gold = playerOf(g, metric.playerId).gold;
  updateWarScores(g);
  for (const offer of [...g.offers])
    if (offer.expiresTurn <= g.turn) {
      if (offer.kind === 'call_to_arms' && offer.defensive)
        answerOffer(g, offer.to, offer.id, true);
      else g.offers = g.offers.filter((o) => o.id !== offer.id);
    }
  report.diplomaticChanges.push(...g.pendingDiplomacy.splice(0));
  report.diet = dietSnapshot(g.diet, g.turn);
  report.world = {
    season: g.season,
    event: structuredClone(g.globalEvent),
    coalitions: structuredClone(g.coalitions),
  };
  report.events.push(...g.log.slice(startLog).map((e) => e.text));
  endWorld(g, report);
  for (const metric of report.economy) metric.gold = playerOf(g, metric.playerId).gold;
  const win = victoryStatus(g);
  if (win) {
    g.victoryRecord = { ...win, turn: g.turn };
    g.winnerId = win.winnerId;
    g.winnerObjective = win.objective;
    g.finishReason = 'victory';
    g.phase = 'finished';
  } else if (!survivingRealms.size) {
    g.phase = 'finished';
    g.finishReason = 'realm_collapse';
  }
  for (const w of report.stackwipes)
    notify(g, {
      type: 'BATTALION_WIPED',
      text: `Um batalhão de ${w.troops} tropas foi aniquilado.`,
      involvesPlayerIds: [w.ownerId],
      severity: 'CRITICAL',
      focusProvinceId: w.provinceId,
    });
  for (const b of report.battles)
    notify(g, {
      type: 'BATTLE',
      text: `Batalha em ${provinceOf(g, b.provinceId).name}: ${b.attackerCasualties + b.defenderCasualties} baixas.`,
      involvesPlayerIds: [
        b.attackerId,
        ...b.defenderBattalionIds.map(
          (id) => g.battalions.find((a) => a.id === id)?.ownerId ?? b.defenderId ?? '',
        ),
      ],
      severity: 'INFO',
      focusProvinceId: b.provinceId,
    });
  for (const text of report.events)
    notify(g, { type: 'WORLD', text, involvesPlayerIds: [], severity: 'INFO' });
  for (const r of report.rebellions)
    notify(g, {
      type: 'DIPLOMACY',
      text: `Revolta em ${provinceOf(g, r.provinceId).name}.`,
      involvesPlayerIds: [r.previousOwnerId],
      severity: 'WARNING',
      focusProvinceId: r.provinceId,
    });
  report.notifications = g.notifications.filter((n) => !startNoticeIds.has(n.id));
  report.events = report.events.map(integerEventText);
  g.lastReport = report;
  g.reports = [...g.reports, report].slice(-8);
  g.history.push({
    ...structuredClone(report),
    analytics: realmTurnAnalytics(g),
    nations: structuredClone(g.players),
    wars: structuredClone(g.wars),
    control: g.provinces
      .filter((p) => p.kind === 'LAND')
      .map((p) => ({ provinceId: p.id, ownerId: p.ownerId, occupierId: p.occupierId })),
  });
  for (const p of g.players) {
    g.orders[p.id] = [];
    p.ready = p.bot;
  }
  if (g.phase === 'planning') {
    g.turn++;
    g.deadline = null;
    g.turnDeadlineAt = null;
    g.firstReadyPlayerName = null;
    g.season = seasonAt(g.turn);
    advanceWorld(g, emptyTurnReport(g.turn, g.diet), true);
    issueDilemmas(g);
  } else g.deadline = null;
  g.battalions = g.battalions.filter((a) => unitCount(a) > 0);
  for (const p of g.players) syncNationAuthority(p);
  return report;
}
export function planBot(g: GameState, p: Player) {
  return planTacticalBot(g, p, submitOrder);
}
export function allReady(g: GameState) {
  return livingPlayers(g).every((p) => p.bot || p.ready);
}
export function executeCommand(input: GameState, actorId: string, raw: GameCommand, now = 0) {
  const command = parseCommand(raw),
    g = structuredClone(input),
    actor = playerOf(g, actorId);
  const host = () => assert(g.hostId === actorId, 'Somente o anfitrião pode executar esta ação.');
  if (
    ![
      'START_GAME',
      'SET_MODE',
      'SET_IDENTITY',
      'SET_PLAYER_NAME',
      'SET_BOT_NATION',
      'SET_LOBBY_OPTIONS',
      'ADD_BOT',
      'REPLACE_WITH_BOT',
      'CHAT',
      'CONTINUE_SANDBOX',
      'READ_NOTIFICATIONS',
    ].includes(command.type)
  )
    assert(g.phase === 'planning', 'A campanha não está em andamento.');
  switch (command.type) {
    case 'MASS_RECRUIT':
      executeMassRecruitment(g, actorId, command.composition, submitOrder);
      break;
    case 'EXECUTE_SUPREME_COMMAND':
      executeSupremeCommand(g, actorId, command);
      break;
    case 'CHOOSE_DILEMMA':
      issueDilemmas(g);
      chooseDilemma(g, actorId, command.option);
      break;
    case 'EMERGENCY_LEVY':
      emergencyLevy(g, actorId);
      break;
    case 'READ_NOTIFICATIONS':
      g.notificationReads[actorId] = [
        ...new Set([
          ...(g.notificationReads[actorId] ?? []),
          ...command.notificationIds.filter((id) =>
            g.notifications.some((n) => n.id === id && canSeeNotification(n, actorId)),
          ),
        ]),
      ].slice(-500);
      break;
    case 'CONTINUE_SANDBOX':
      host();
      assert(
        g.phase === 'finished' && g.finishReason === 'victory',
        'Aguarde uma vitória para continuar.',
      );
      g.sandboxContinued = true;
      g.phase = 'planning';
      g.finishReason = null;
      g.turn++;
      g.turnDeadlineAt = null;
      g.deadline = null;
      g.firstReadyPlayerName = null;
      for (const p of g.players) p.ready = p.bot;
      break;
    case 'INSTANT_ARMY_ACTION':
      instantArmyAction(g, actorId, command.action);
      break;
    case 'ASSIGN_LEADER':
      instantArmyAction(g, actorId, command);
      break;
    case 'RECRUIT_COMMANDER':
      recruitCommander(g, actorId, command.isAdmiral, command.trait, command.name);
      break;
    case 'UNLOCK_SKILL':
      unlockSkill(g, actorId, command.skillId);
      break;
    case 'SET_AUTO_MERGE':
      assert(!actor.ready, 'Reabra as ordens.');
      {
        const a = battalionOf(g, command.battalionId);
        assert(a.ownerId === actorId, 'Batalhão alheio.');
        a.autoMerge = command.autoMerge;
      }
      break;
    case 'SUBMIT_ORDER':
      submitOrder(g, actorId, command.order);
      break;
    case 'CANCEL_ORDER':
      cancelOrder(g, actorId, command.key);
      break;
    case 'READY':
      assert(
        livingPlayers(g).some((p) => p.id === actorId),
        'Reino eliminado não pode finalizar rodadas.',
      );
      actor.ready = command.ready;
      if (
        command.ready &&
        !actor.bot &&
        livingPlayers(g).some((p) => p.id === actorId) &&
        g.firstReadyPlayerName === null
      ) {
        g.firstReadyPlayerName = actor.name;
        g.turnDeadlineAt = now + g.turnSeconds * 1000;
        g.deadline = g.turnDeadlineAt;
      }
      if (allReady(g)) resolveTurn(g, now);
      break;
    case 'ANSWER_OFFER':
      answerOffer(g, actorId, command.offerId, command.accept);
      break;
    case 'START_GAME':
      host();
      startGame(g, now);
      break;
    case 'SET_MODE':
      host();
      setMode(g, command.mode, command.theater);
      break;
    case 'SET_IDENTITY':
      assert(g.phase === 'lobby', 'Escolha a nação no lobby.');
      assert(
        !g.players.some((p) => p.id !== actorId && p.nationId === command.nationId),
        'Nação já escolhida.',
      );
      setNation(actor, command.nationId);
      if (command.religiousPolicy) actor.religiousPolicy = command.religiousPolicy;
      break;
    case 'SET_PLAYER_NAME':
      actor.name = command.name;
      break;
    case 'SET_BOT_NATION': {
      host();
      assert(g.phase === 'lobby', 'Escolha a nação dos bots antes de iniciar.');
      const target = playerOf(g, command.playerId);
      assert(target.bot, 'Somente bots podem ser configurados pelo anfitrião.');
      const taken = g.players.find((p) => p.id !== target.id && p.nationId === command.nationId);
      assert(!taken || taken.bot, 'Essa nação já foi escolhida por um jogador.');
      if (taken) setNation(taken, target.nationId);
      setNation(target, command.nationId);
      break;
    }
    case 'SET_RELIGIOUS_POLICY':
      actor.religiousPolicy = command.policy;
      break;
    case 'ADD_BOT':
      host();
      addPlayer(g, `Conselho ${g.players.length + 1}`, true);
      break;
    case 'REPLACE_WITH_BOT': {
      host();
      const target = playerOf(g, command.playerId);
      assert(!target.online && !target.bot, 'Somente ausentes podem ser substituídos.');
      target.bot = true;
      target.ready = true;
      if (g.phase === 'planning' && allReady(g)) resolveTurn(g, now);
      break;
    }
    case 'CHAT':
      assert(command.text.trim().length > 0, 'Escreva uma mensagem.');
      g.chat.push({
        id: (g.chat.at(-1)?.id ?? 0) + 1,
        playerId: actorId,
        text: command.text.trim(),
      });
      g.chat = g.chat.slice(-60);
      break;
    case 'DECLARE_WAR':
      if (command.casusBelli === 'COALITION') coalitionWar(g, actorId, command.targetRealmId);
      else
        declareWar(g, actorId, command.targetRealmId, command.casusBelli, command.offensiveAllyIds);
      break;
    case 'OFFER_PEACE':
      offerPeace(g, actorId, command.warId, command.terms, command.concession);
      break;
    case 'CALL_TO_ARMS':
      callToArms(g, actorId, command.warId, command.allyId);
      break;
    case 'JOIN_COALITION':
      joinCoalition(g, actorId, command.targetRealmId);
      break;
    case 'DECLARE_COALITION_WAR':
      coalitionWar(g, actorId, command.targetRealmId);
      break;
    case 'CAST_IMPERIAL_VOTE':
      assert(
        goldRules(g) &&
          g.matchConfig.scenarioId === 'IRON_CROWN_EUROPE' &&
          g.phase === 'planning' &&
          g.diet.memberRealmIds.includes(actorId) &&
          g.diet.memberRealmIds.includes(command.candidateId),
        'Voto imperial indisponível.',
      );
      g.diet.votes[actorId] = command.candidateId;
      break;
    case 'CHOOSE_SECRET_OBJECTIVE':
      assert(
        g.turn === 1 &&
          !actor.ready &&
          actor.secretObjectives.some((c) => c.id === command.objectiveId),
        'Escolha sua carta na primeira rodada antes de finalizar.',
      );
      actor.selectedObjectiveId = command.objectiveId;
      actor.objectiveStreak = 0;
      break;
    case 'SET_LOBBY_OPTIONS':
      host();
      assert(g.phase === 'lobby', 'Configure a sala antes de iniciar.');
      g.roomName = command.roomName;
      g.isPublic = command.isPublic;
      g.enableSecretObjectives = command.enableSecretObjectives;
      g.allowBotSecretVictory = command.allowBotSecretVictory ?? g.allowBotSecretVictory;
      g.matchConfig.allowBotSecretVictory = g.allowBotSecretVictory;
      g.turnSeconds = command.turnTimerSeconds;
      g.matchConfig.enableSecretObjectives = g.enableSecretObjectives;
      g.matchConfig.turnSeconds = g.turnSeconds;
      break;
    case 'DECLARE_WAR_AND_MOVE':
      if (command.casusBelli === 'COALITION') coalitionWar(g, actorId, command.targetRealmId);
      else
        declareWar(g, actorId, command.targetRealmId, command.casusBelli, command.offensiveAllyIds);
      assert(
        controller(provinceOf(g, command.targetProvinceId)) === command.targetRealmId,
        'Destino não pertence ao alvo.',
      );
      submitOrder(
        g,
        actorId,
        battalionOf(g, command.battalionId).embarkedOnId
          ? {
              type: 'EMBARK_BATTALION',
              battalionId: command.battalionId,
              disembarkProvinceId: command.targetProvinceId,
            }
          : command.autoTransport
            ? {
                type: 'AUTO_TRANSPORT',
                battalionId: command.battalionId,
                targetProvinceId: command.targetProvinceId,
              }
            : command.bridgeFleetId
              ? {
                  type: 'NAVAL_BRIDGE',
                  battalionId: command.battalionId,
                  fleetId: command.bridgeFleetId,
                  targetProvinceId: command.targetProvinceId,
                }
              : {
                  type: 'MOVE_BATTALION',
                  battalionId: command.battalionId,
                  targetProvinceId: command.targetProvinceId,
                },
      );
      break;
  }
  refreshScores(g);
  for (const p of g.players) {
    const l = realmLimits(g, p.id);
    p.armyCap = l.armyCap;
    p.manpowerCap = l.manpowerCap;
  }
  return g;
}
export function viewFor(g: GameState, id: string): GameView {
  const {
    orders,
    seed: _seed,
    nextId: _ids,
    pendingDiplomacy: _pending,
    notificationReads: _reads,
    ...publicState
  } = g;
  const result = structuredClone(publicState);
  for (const report of [
    ...result.history,
    ...result.reports,
    ...(result.lastReport ? [result.lastReport] : []),
  ])
    report.events = report.events.map(integerEventText);
  const redact = (report: TurnResolutionReport) => {
    report.notifications = report.notifications.filter((n) => canSeeNotification(n, id));
    for (const c of report.diplomaticChanges) if (c.covert && c.actorId !== id) c.actorId = null;
  };
  if (result.lastReport) redact(result.lastReport);
  result.reports.forEach(redact);
  result.history.forEach(redact);
  const viewer = playerOf(g, id),
    finished = g.phase === 'finished';
  const shared = new Set([
    id,
    ...(verticalRules(g) ? visionPartners(g, id) : []),
    ...g.players.filter((p) => p.subjectOfId === id).map((p) => p.id),
    ...g.visionContracts
      .filter((v) => v.buyerId === id && v.untilTurn >= g.turn)
      .map((v) => v.targetId),
  ]);
  const adjacent = new Set(
    g.provinces.filter((p) => shared.has(controller(p) ?? '')).flatMap((p) => p.neighbors),
  );
  const cleanPlayer = (p: Player) => {
    syncNationAuthority(p);
    if (p.id !== id) p.activeDilemma = null;
    if (!finished && p.id !== id && p.id !== g.victoryRecord?.winnerId) {
      p.secretObjectives = [];
      p.selectedObjectiveId = null;
      p.objectiveStreak = 0;
      p.paxStreak = 0;
    }
  };
  result.notifications = result.notifications.filter((n) => canSeeNotification(n, id));
  result.players.forEach(cleanPlayer);
  result.history.forEach((h) => {
    h.nations.forEach(cleanPlayer);
    if (!finished)
      for (const metric of h.analytics ?? [])
        if (!shared.has(metric.playerId)) {
          delete metric.landTroops;
          delete metric.ships;
        }
  });
  if (!finished) result.visionContracts = result.visionContracts.filter((v) => v.buyerId === id);
  result.battalions = result.battalions.filter(
    (a) => finished || shared.has(a.ownerId) || !isCamouflaged(g, a),
  );
  for (const a of result.battalions)
    if (!shared.has(a.ownerId)) {
      if (viewer.nationId === 'sapiencia' && adjacent.has(a.provinceId)) {
        const queued = (orders[a.ownerId] ?? []).find(
          (o) => 'battalionId' in o && o.battalionId === a.id && o.type !== 'RECRUIT_BATTALION',
        );
        a.pathQueue =
          queued?.type === 'MOVE_BATTALION'
            ? (queued.path ?? unitPath(g, a, queued.targetProvinceId!) ?? [])
            : queued
              ? []
              : a.pathQueue;
      } else a.pathQueue = [];
    }
  if (verticalRules(g) && !finished && g.winnerId === null) {
    const visible = computeVisibleProvinces(g, id),
      partners = visionPartners(g, id);
    const intelligenceText = (text: string) =>
      !g.provinces.some(
        (p) =>
          !visible.has(p.id) &&
          text.includes(p.name) &&
          /baixa|tropa|ataque|defesa|infantaria|cavalaria|artilharia|frota|navio|exército|cerco/i.test(
            text,
          ),
      );
    result.notifications = result.notifications.filter((n) => intelligenceText(n.text));
    const canSee = (owner: string, province: string) =>
      partners.has(owner) || visible.has(province);
    result.battalions = result.battalions.filter((a) => canSee(a.ownerId, a.provinceId));
    const ids = new Set(result.battalions.map((a) => a.id));
    result.commanders = result.commanders.filter(
      (c) => partners.has(c.ownerId) || (c.assignedBattalionId && ids.has(c.assignedBattalionId)),
    );
    const filterReport = (report: TurnResolutionReport) => {
      report.notifications = report.notifications.filter((n) => intelligenceText(n.text));
      report.movements = report.movements.filter(
        (m) =>
          partners.has(m.ownerId) || visible.has(m.fromProvinceId) || visible.has(m.toProvinceId),
      );
      report.battles = report.battles.filter(
        (b) =>
          partners.has(b.attackerId) ||
          partners.has(b.defenderId ?? '') ||
          visible.has(b.provinceId),
      );
      report.attritionLosses = report.attritionLosses.filter((a) =>
        canSee(a.ownerId, a.provinceId),
      );
      report.desertions = report.desertions.filter((a) => canSee(a.ownerId, a.provinceId));
      report.encirclements = report.encirclements.filter((a) => canSee(a.ownerId, a.provinceId));
      report.stackwipes = report.stackwipes.filter((a) => canSee(a.ownerId, a.provinceId));
      report.sieges = report.sieges.filter((s) => canSee(s.attackerOwnerId, s.provinceId));
      report.rebellions = report.rebellions.filter((r) => canSee(r.previousOwnerId, r.provinceId));
      report.retreats = report.retreats.filter((a) => canSee(a.ownerId, a.fromProvinceId));
      report.events = report.events.filter(
        (text) =>
          !g.provinces.some(
            (p) =>
              !visible.has(p.id) &&
              text.includes(p.name) &&
              /baixa|tropa|ataque|defesa|infantaria|cavalaria|artilharia|frota|navio|exército|cerco/i.test(
                text,
              ),
          ),
      );
    };
    if (result.lastReport) filterReport(result.lastReport);
    result.reports.forEach(filterReport);
    result.history.forEach(filterReport);
    result.log = result.log.filter(
      (entry) =>
        entry.kind !== 'battle' ||
        !g.provinces.some((p) => !visible.has(p.id) && entry.text.includes(p.name)),
    );
    for (const province of result.provinces) if (!visible.has(province.id)) province.siege = null;
  }
  return {
    ...result,
    readNotificationIds: structuredClone(g.notificationReads[id] ?? []),
    plannedOrders: structuredClone(orders[id] ?? []),
  };
}
