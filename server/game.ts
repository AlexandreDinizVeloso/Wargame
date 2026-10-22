import { desertForMaintenance } from './economy';
import { WORLD_STARTS } from '../shared/map';
import {
  buildingLevel,
  buildingSlots,
  canBuild,
  constructionType,
  setBuildingLevel,
  subjugationEligible,
} from '../shared/development';
import { commanderFor, hasSkill, movementAllowance } from '../shared/military';
import { bridgeOptions, crossingOptions } from '../shared/naval';
import { instantArmyAction, recruitCommander, unlockSkill, autoMerge } from './armies';
import { assaultSiege, advanceSieges } from './siege';
import { realmLimits, recruitmentBlock, recruitedCount, moraleRecovery } from '../shared/economy';
import { notify, canSeeNotification } from './notifications';
import { applyEncirclement } from './logistics';
import { emergencyLevy } from './emergency';
import { resolveBridges, prepareTransport } from './transport';
import { advanceWorld, endWorld, dealObjectives, joinCoalition, coalitionWar } from './world';
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
import { makeMap } from '../shared/map';
import {
  atWar,
  attritionLoss,
  canTransit,
  canTraverse,
  clamp,
  compositionOf,
  controller,
  dietSnapshot,
  getRelation,
  landCount,
  livingPlayers,
  NATIONS,
  nationOf,
  orderCost,
  orderKey,
  orderProvinceId,
  realmEconomy,
  reservedResources,
  roundMoney,
  shortestPath,
  supplyLimit,
  UNIT_KEYS,
  unitCount,
  unitPath,
  victoryStatus,
  zeroComposition,
  isBlockaded,
} from '../shared/rules';
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
import { combatPowers, resolveBattle, safestRetreat } from './combat';
import {
  answerOffer,
  callToArms,
  declareWar,
  diplomacy,
  offerPeace,
  syncWars,
  updateWarScores,
} from './diplomacy';
import { parseCommand, parseOrder } from './commands';
export { assert, canAttack } from './state';
export { parseOrder, parseCommand };
export const BALANCE = {
  baseUpkeep: 0.75,
  initialGold: 75,
  initialManpower: 18,
  transportCapacity: 4,
  exhaustionPerWarTurn: 4,
  exhaustionCasualtyFactor: 10,
  peaceRecovery: 12,
};
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
    version: 6,
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
      mapId: mode === 'quick' ? `natural-earth-${theater}` : 'natural-earth-world',
      maxTurns,
      turnSeconds,
      createdVersion: '0.6.0',
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
    influence: 8,
    prestige: 10,
    stability: 100,
    warExhaustion: 0,
    wonBattles: 0,
    conversions: 0,
    tradeEarned: 0,
    subjectOfId: null,
    moraleBonusUntil: 0,
    disarmUntil: 0,
    armyCap: 12,
    manpowerCap: 18,
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
  g.players.push(p);
  g.orders[p.id] = [];
  if (!g.hostId) g.hostId = p.id;
  return p;
}
export function setMode(g: GameState, mode: GameMode, theater: Theater = g.theater) {
  assert(g.phase === 'lobby', 'Escolha o cenário antes de começar.');
  const next = createGame(g.code, mode, g.demo, g.seed, theater);
  g.mode = mode;
  g.theater = theater;
  g.provinces = next.provinces;
  g.matchConfig = {
    ...next.matchConfig,
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
                vespera: 'portugal',
                ferro_norte: 'scandinavia',
                turan: 'hungary',
                sapiencia: 'lowlands',
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
    assert(support, 'Mapa sem espaço para guarnições.');
    support.ownerId = p.id;
    support.pacification = 100;
    support.unrest = 5;
    support.religion = p.faith;
    createBattalion(
      g,
      p.id,
      home.id,
      { ...nation.initial, warships: 0, transports: 0 },
      { name: `Exército de ${home.name}`, morale: 80, training: 1.2 },
    );
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
      Math.max(1, home.baseTax - 1 + (10 - before) / Math.max(0.01, delta)),
    );
  }
  for (const p of g.players) {
    const l = realmLimits(g, p.id);
    p.armyCap = l.armyCap;
    p.manpowerCap = l.manpowerCap;
    p.manpower = Math.min(p.manpower, l.manpowerCap);
  }
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
    } else if (o.type === 'ASSAULT_SIEGE') {
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
            (old) => old.type === 'MOVE_BATTALION' && old.battalionId === fleet.id,
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
        const recruitReason = recruitmentBlock(p, o, g.turn);
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
    actor.gold - reserved.gold >= cost.gold &&
      actor.manpower - reserved.manpower >= cost.manpower &&
      actor.influence - reserved.influence >= cost.influence,
    'Recursos livres insuficientes.',
  );
}
function recruit(g: GameState, id: string, o: Extract<PlayerOrder, { type: 'RECRUIT_BATTALION' }>) {
  const local = provinceOf(g, o.provinceId);
  const blocked = recruitmentBlock(local, o, g.turn);
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
    diplomacy(g, id, o);
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
  if (actor.gold < cost.gold || actor.manpower < cost.manpower || actor.influence < cost.influence)
    return;
  if (o.type === 'DIPLOMACY' || o.type === 'NAVAL_BRIDGE' || o.type === 'AUTO_TRANSPORT') return;
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
        actor.gold = roundMoney(actor.gold + 25);
        actor.fervor += 10;
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
      const q = provinceOf(g, a.provinceId);
      if (q.razedTurn !== null || controller(q) !== id || q.pacification > 35) return;
      q.razedTurn = g.turn;
      q.unrest = clamp(q.unrest + 40);
      q.pacification = 0;
      actor.gold = roundMoney(actor.gold + 80);
      if (actor.nationId === 'ferro_norte') a.morale = clamp(a.morale + 25);
      report.events.push(`${actor.nation} arrasou ${q.name} e recebeu 80 ouro.`);
    }
    if (o.type === 'ASSAULT_SIEGE') assaultSiege(g, a, provinceOf(g, a.provinceId), report);
    if (o.type === 'TRAIN_BATTALION') {
      actor.militaryXP += 8;
      a.training = Math.min(1.5, a.training + 0.1);
      a.morale = clamp(a.morale + 8);
      a.pathQueue = [];
    }
    if (o.type === 'EMBARK_BATTALION') {
      if (o.fleetId) {
        const f = g.battalions.find((b) => b.id === o.fleetId);
        if (!f || f.embarkedArmyId || f.transports * 4 < unitCount(a)) return;
        const from = a.provinceId;
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
      if (recruitmentBlock(p, o, g.turn)) return;
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
        (1 + 0.25 * (p?.templeLevel ?? 0));
      p.pacification = clamp(p.pacification + 35 * speed);
      p.unrest = clamp(p.unrest - 25);
    }
  } else return;
  actor.gold = roundMoney(actor.gold - cost.gold);
  actor.manpower -= cost.manpower;
  actor.influence -= cost.influence;
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
        (a.isFleet && winterActive(g) && !immune && !hasSkill(g, a.ownerId, 'NAV_T3')
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
        report.events.push(`${a.name}: rota interrompida por fronteira ou tratado.`);
        break;
      }
      const cost =
        target.terrain === 'forest' &&
        !from.straitNeighbors.includes(target.id) &&
        !a.isFleet &&
        !immune &&
        commanderFor(g, a)?.trait !== 'BLITZ_VANGUARD'
          ? 1.5
          : 1;
      if (a.movementCredit < cost) break;
      if (
        step > 0 &&
        !a.isFleet &&
        !hasSkill(g, a.ownerId, 'CAV_T3') &&
        (!['plains', 'coastal'].includes(from.terrain) ||
          !['plains', 'coastal'].includes(target.terrain) ||
          a.movementPoints < 2)
      )
        break;
      a.movementCredit -= cost;
      a.pathQueue.shift();
      a.entrenched = false;
      a.morale = clamp(a.morale - 6);
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
        .filter((a) => a.ownerId !== 'NEUTRAL' && !considered.has(a.id))
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
  for (const p of g.provinces) {
    const armies = g.battalions.filter(
      (a) => a.provinceId === p.id && !a.embarkedOnId && !a.stranded,
    );
    const total = armies.reduce((n, a) => n + unitCount(a), 0);
    for (const id of new Set(armies.map((a) => a.ownerId))) {
      const group = armies.filter(
          (a) =>
            a.ownerId === id &&
            commanderFor(g, a)?.trait !== 'QUARTERMASTER' &&
            !(a.isFleet && hasSkill(g, id, 'NAV_T3')),
        ),
        count = group.reduce((n, a) => n + unitCount(a), 0),
        limit =
          effectiveSupply(g, id, p) +
          (armies.some((a) => a.ownerId === id && commanderFor(g, a)?.trait === 'QUARTERMASTER')
            ? 6
            : 0);
      const immune = g.players.find((q) => q.id === id)?.nationId === 'ferro_norte';
      const hostile = !!p.ownerId && p.ownerId !== id && atWar(g, id, p.ownerId);
      const losses = Math.min(
        count,
        Math.ceil((attritionLoss(total, limit) * count) / Math.max(1, total)) *
          (winterActive(g) && !immune && hostile ? 2 : 1),
      );
      const shares = group.map((a) => Math.floor((losses * unitCount(a)) / Math.max(1, count)));
      let left = losses - shares.reduce((n, v) => n + v, 0);
      for (let i = 0; left > 0 && i < group.length; i++)
        if (shares[i] < unitCount(group[i])) {
          shares[i]++;
          left--;
        }
      group.forEach((a, i) => {
        if (!shares[i]) return;
        const before = unitCount(a);
        removeUnits(a, shares[i]);
        report.attritionLosses.push({
          armyId: a.id,
          provinceId: p.id,
          ownerId: id,
          troopsBefore: before,
          supplyLimit: limit,
          losses: before - unitCount(a),
        });
        if (!unitCount(a)) destroyBattalion(g, a);
      });
    }
  }
}
export function resolveTurn(g: GameState, _now = 0) {
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  const before = new Map(
    g.players.map((p) => [
      p.id,
      g.battalions.filter((a) => a.ownerId === p.id).reduce((n, a) => n + unitCount(a), 0),
    ]),
  );
  const startLog = g.log.length;
  const startNoticeIds = new Set(g.notifications.map((n) => n.id));
  for (const bot of g.players.filter((p) => p.bot)) planBot(g, bot);
  const report = emptyTurnReport(g.turn, g.diet);
  report.diplomaticChanges = g.pendingDiplomacy.splice(0);
  advanceWorld(g, report);
  const moved = new Set<string>();
  const bridgeOrigins = new Map(g.battalions.map((a) => [a.id, a.provinceId]));
  recoverAndRepatriate(g, report, moved);
  const queued = g.players
    .flatMap((p) => (g.orders[p.id] ?? []).map((o) => ({ id: p.id, o })))
    .sort((a, b) => roll(g, orderKey(a.o) + a.id) - roll(g, orderKey(b.o) + b.id));
  for (const { id, o } of queued) resolveLocal(g, id, o, report, moved);
  moveBattalions(g, report, moved);
  stationaryClashes(g, report, moved);
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
      actor.fervor += 2 * p.templeLevel;
      actor.stability = clamp(actor.stability + 2 * p.templeLevel);
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
  applySupply(g, report);
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
    p.manpower = Math.min(eco.manpowerCap, p.manpower + eco.manpower);
    if (g.provinces.some((q) => q.ownerId === p.id)) p.militaryXP += 10;
    p.influence = Math.min(50, p.influence + 2);
    p.tradeEarned = roundMoney(p.tradeEarned + eco.trade);
    for (const a of g.battalions.filter((a) => a.ownerId === p.id && !a.stranded)) {
      a.morale = clamp(
        a.morale +
          (bankrupt
            ? -12
            : moved.has(a.id)
              ? 0
              : moraleRecovery(g, a) + (commanderFor(g, a)?.trait === 'IRON_WALL' ? 15 : 0)),
      );
    }
    report.economy.push({
      playerId: p.id,
      turn: g.turn,
      ...{
        taxes: eco.taxes,
        trade: eco.trade,
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
  for (const r of g.reparations.filter((r) => r.untilTurn >= g.turn)) {
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
  g.lastReport = report;
  g.reports = [...g.reports, report].slice(-8);
  g.history.push({
    ...structuredClone(report),
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
    advanceWorld(g, emptyTurnReport(g.turn, g.diet));
  } else g.deadline = null;
  g.battalions = g.battalions.filter((a) => unitCount(a) > 0);
  return report;
}
function tryOrder(
  g: GameState,
  p: Player,
  o: PlayerOrder,
  estimatedNet = realmEconomy(g, p.id).net,
) {
  try {
    const cost = orderCost(
        o,
        g.provinces.find((q) => q.id === orderProvinceId(o, g)),
        p,
        g,
      ),
      reserved = reservedResources(g, p.id, orderKey(o));
    if (cost.gold > 0 && p.gold - reserved.gold - cost.gold + estimatedNet < 2) return false;
    submitOrder(g, p.id, o);
    return true;
  } catch {
    return false;
  }
}
function botPeace(g: GameState, p: Player) {
  for (const war of g.wars.filter(
    (w) => w.active && [w.attackerLeaderId, w.defenderLeaderId].includes(p.id),
  )) {
    const score = war.warScore * (war.attackerLeaderId === p.id ? 1 : -1);
    try {
      const loserId = war.attackerLeaderId === p.id ? war.defenderLeaderId : war.attackerLeaderId;
      const chosen = p.secretObjectives.find((c) => c.id === p.selectedObjectiveId);
      if (
        score >= 85 &&
        p.nationId === 'aurelia' &&
        chosen?.kind === 'PAX' &&
        g.players.filter((q) => q.subjectOfId === p.id).length < 2 &&
        subjugationEligible(g, p.id, loserId)
      ) {
        offerPeace(g, p.id, war.id, [{ type: 'SUBJUGATE' }]);
        continue;
      }
      const otherIds = war.attackerLeaderId === p.id ? war.defenderIds : war.attackerIds;
      const occupied = g.provinces.filter(
        (q) => q.ownerId && otherIds.includes(q.ownerId) && q.occupierId === p.id,
      );
      if (occupied.length && score >= 20) {
        const provinceIds: string[] = [];
        let cost = 0;
        for (const q of occupied) {
          const next = 12 + q.baseTax;
          if (cost + next <= score) {
            provinceIds.push(q.id);
            cost += next;
          }
        }
        if (provinceIds.length) {
          offerPeace(g, p.id, war.id, [{ type: 'CEDE_PROVINCES', provinceIds }]);
          continue;
        }
      }
      if (p.warExhaustion >= 35 || g.turn - war.startedTurn >= 7) offerPeace(g, p.id, war.id, []);
    } catch {
      continue;
    }
  }
}
export function planBot(g: GameState, p: Player) {
  if (!g.provinces.some((q) => q.ownerId === p.id)) return;
  for (const offer of [...g.offers.filter((o) => o.to === p.id)])
    try {
      if (offer.kind === 'peace') {
        const war = g.wars.find((w) => w.id === offer.warId);
        if (
          war &&
          (p.warExhaustion >= 25 || (offer.terms?.length === 0 && g.turn - war.startedTurn >= 4))
        )
          answerOffer(g, p.id, offer.id, true);
      } else answerOffer(g, p.id, offer.id, true);
    } catch {
      continue;
    }
  for (const target of g.players.filter(
    (q) => q.id !== p.id && q.aggressiveExpansion >= 60 && !p.subjectOfId,
  )) {
    try {
      let c = g.coalitions.find((c) => c.targetId === target.id);
      if (!c?.memberIds.includes(p.id)) joinCoalition(g, p.id, target.id);
      c = g.coalitions.find((c) => c.targetId === target.id);
      if (c && !c.warId && c.memberIds.length >= 2) coalitionWar(g, p.id, target.id);
    } catch {}
  }
  p.ready = false;
  const primary =
    p.nationId === 'vespera'
      ? 'NAV'
      : p.nationId === 'turan'
        ? 'CAV'
        : p.nationId === 'kaldor'
          ? 'ART'
          : 'INF';
  const branchOrder = [primary, ...['INF', 'CAV', 'ART', 'NAV'].filter((b) => b !== primary)];
  for (const branch of branchOrder) {
    const choice = p.botArchetype === 'Merchant' ? 'B' : 'A';
    for (const id of [
      `${branch}_T1`,
      `${branch}_T2${choice}`,
      `${branch}_T3`,
    ] as import('../shared/types').SkillId[])
      try {
        unlockSkill(g, p.id, id);
      } catch {}
  }
  for (const c of g.commanders.filter((c) => c.ownerId === p.id && !c.assignedBattalionId)) {
    const a = g.battalions
      .filter((a) => a.ownerId === p.id && a.isFleet === c.isAdmiral && !commanderFor(g, a))
      .sort((a, b) => unitCount(b) - unitCount(a))[0];
    if (a) c.assignedBattalionId = a.id;
  }
  botPeace(g, p);
  const estimatedNet = realmEconomy(g, p.id).net;
  const tryPlan = (o: PlayerOrder) => tryOrder(g, p, o, estimatedNet);
  for (const a of [
    ...g.battalions.filter(
      (a) => a.ownerId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded,
    ),
  ]) {
    if (a.pathQueue.length) continue;
    const from = provinceOf(g, a.provinceId);
    if (from.siege?.attackerOwnerId === p.id) {
      if (a.training < 1.3) tryPlan({ type: 'TRAIN_BATTALION', battalionId: a.id });
      continue;
    }
    const neighbors = from.neighbors
      .map((id) => provinceOf(g, id))
      .filter((q) => q.kind === 'LAND' && controller(q) !== p.id)
      .sort(
        (q, r) =>
          Number(!!controller(r) && atWar(g, p.id, controller(r)!)) -
            Number(!!controller(q) && atWar(g, p.id, controller(q)!)) ||
          g.battalions
            .filter((a) => a.provinceId === q.id && !a.isFleet)
            .reduce((n, a) => n + unitCount(a), 0) -
            g.battalions
              .filter((a) => a.provinceId === r.id && !a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0),
      );
    let moved = false;
    for (const q of neighbors) {
      const target = controller(q),
        enemies = g.battalions.filter(
          (b) => b.provinceId === q.id && !b.isFleet && !b.embarkedOnId,
        );
      const estimate = combatPowers(g, [a], enemies, q);
      if (
        unitCount(a) < Math.max(2, Math.max(0, q.fortLevel - a.artillery) * 3) ||
        (enemies.length > 0 && estimate.ratio < (p.botArchetype === 'Militarist' ? 1.04 : 1.2))
      )
        continue;
      if (target && target !== p.id && !atWar(g, p.id, target)) {
        if (
          p.subjectOfId ||
          g.wars.some((w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(p.id))
        )
          continue;
        if (
          p.botArchetype !== 'Militarist' &&
          !['turan', 'ferro_norte', 'sol_invicto'].includes(p.nationId) &&
          g.turn % 4 !== 0
        )
          continue;
        try {
          declareWar(
            g,
            p.id,
            target,
            p.faith !== playerOf(g, target).faith && p.faith === 'SOLAR' ? 'HOLY_WAR' : 'CONQUEST',
          );
        } catch {
          continue;
        }
      }
      if (tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, targetProvinceId: q.id })) {
        moved = true;
        break;
      }
    }
    if (!moved && unitCount(a) >= 5) {
      const candidates = g.provinces
        .filter(
          (q) =>
            q.kind === 'LAND' &&
            controller(q) !== p.id &&
            (!controller(q) || atWar(g, p.id, controller(q)!)),
        )
        .map((q) => ({ q, path: unitPath(g, a, q.id) }))
        .filter((v) => v.path && v.path.length > 0)
        .sort(
          (a, b) =>
            Number(!!controller(b.q) && atWar(g, p.id, controller(b.q)!)) -
              Number(!!controller(a.q) && atWar(g, p.id, controller(a.q)!)) ||
            a.path!.length - b.path!.length,
        );
      const next = candidates.find(
        ({ q }) =>
          combatPowers(
            g,
            [a],
            g.battalions.filter((b) => b.provinceId === q.id && !b.isFleet && !b.embarkedOnId),
            q,
          ).ratio >= (p.botArchetype === 'Militarist' ? 1.04 : 1.2),
      );
      if (next) moved = tryPlan({ type: 'MOVE_BATTALION', battalionId: a.id, path: next.path! });
    }
    if (!moved && from.isCoastal) {
      const targets = g.provinces
        .filter(
          (q) =>
            q.kind === 'LAND' &&
            q.isCoastal &&
            !controller(q) &&
            crossingOptions(g, a, q, g.orders[p.id]).length,
        )
        .sort(
          (q, r) =>
            g.battalions
              .filter((b) => b.provinceId === q.id && !b.isFleet)
              .reduce((n, b) => n + unitCount(b), 0) -
            g.battalions
              .filter((b) => b.provinceId === r.id && !b.isFleet)
              .reduce((n, b) => n + unitCount(b), 0),
        );
      if (targets[0] && estimatedNet > 0)
        moved = tryPlan({
          type: 'AUTO_TRANSPORT',
          battalionId: a.id,
          targetProvinceId: targets[0].id,
        });
    }
    if (!moved && a.training < 1.4) tryPlan({ type: 'TRAIN_BATTALION', battalionId: a.id });
  }
  for (const f of g.battalions.filter((a) => a.ownerId === p.id && a.isFleet && !a.stranded)) {
    if (f.embarkedArmyId) {
      const cargo = g.battalions.find((a) => a.id === f.embarkedArmyId);
      if (!cargo) continue;
      const targets = provinceOf(g, f.provinceId)
        .neighbors.map((id) => provinceOf(g, id))
        .filter(
          (q) =>
            q.kind === 'LAND' &&
            q.isCoastal &&
            controller(q) !== p.id &&
            canTransit(g, p.id, q) &&
            g.battalions
              .filter((a) => a.provinceId === q.id && !a.isFleet)
              .reduce((n, a) => n + unitCount(a), 0) *
              1.4 <
              unitCount(cargo),
        );
      if (targets[0]) {
        tryPlan({
          type: 'EMBARK_BATTALION',
          battalionId: cargo.id,
          disembarkProvinceId: targets[0].id,
        });
        continue;
      }
      if (!f.pathQueue.length) {
        const coasts = g.provinces.filter(
          (q) =>
            q.kind === 'LAND' && q.isCoastal && controller(q) !== p.id && canTransit(g, p.id, q),
        );
        const routes = coasts
          .flatMap((q) =>
            q.neighbors
              .map((id) => provinceOf(g, id))
              .filter((s) => s.kind === 'SEA_ZONE')
              .map((s) => unitPath(g, f, s.id)),
          )
          .filter((r): r is string[] => !!r && r.length > 0)
          .sort((a, b) => a.length - b.length);
        if (routes[0]) tryPlan({ type: 'MOVE_BATTALION', battalionId: f.id, path: routes[0] });
      }
    } else if (!f.pathQueue.length) {
      const pHere = provinceOf(g, f.provinceId);
      const load = g.battalions.find(
        (a) =>
          a.ownerId === p.id &&
          !a.isFleet &&
          !a.embarkedOnId &&
          !a.pathQueue.length &&
          !a.stranded &&
          unitCount(a) <= f.transports * 4 &&
          (a.provinceId === f.provinceId || pHere.neighbors.includes(a.provinceId)) &&
          provinceOf(g, a.provinceId).portLevel > 0,
      );
      if (
        load &&
        !g.orders[p.id].some(
          (o) => 'battalionId' in o && o.battalionId === load.id && o.type === 'MOVE_BATTALION',
        )
      )
        tryPlan({ type: 'EMBARK_BATTALION', battalionId: load.id, fleetId: f.id });
    }
  }
  for (const q of g.provinces.filter((q) => q.kind === 'LAND' && controller(q) === p.id)) {
    const guard = g.battalions
      .filter(
        (a) =>
          a.ownerId === p.id &&
          a.provinceId === q.id &&
          !a.isFleet &&
          !a.embarkedOnId &&
          !a.stranded,
      )
      .sort((a, b) => unitCount(b) - unitCount(a))[0];
    const choices: PlayerOrder[] = [];
    if (q.templeLevel === 0 && (q.unrest > 45 || q.pacification < 65))
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'TEMPLE' });
    if (q.barracksLevel === 0 && p.manpower < 12)
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'BARRACKS' });
    if (q.foundryLevel === 0 && p.nationId === 'kaldor')
      choices.push({ type: 'BUILD_BUILDING', provinceId: q.id, building: 'FOUNDRY' });
    if (q.unrest > 55 || q.pacification < 65) choices.push({ type: 'PACIFY', provinceId: q.id });
    if (q.ownerId === p.id && !q.occupierId) {
      if (p.botArchetype === 'Merchant' && q.marketLevel < 2)
        choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      if (p.botArchetype === 'Theocrat' && q.religion !== p.faith)
        choices.push({ type: 'CONVERT', targetProvinceId: q.id });
      if (!guard || unitCount(guard) < Math.min(11, supplyLimit(q) - 2))
        choices.push({
          type: 'RECRUIT_BATTALION',
          provinceId: q.id,
          infantry: p.nationId === 'turan' && (q.barracksLevel || q.foundryLevel) ? 0 : 2,
          cavalry:
            p.nationId === 'turan' && (q.barracksLevel || q.foundryLevel)
              ? Math.min(3, q.barracksLevel >= 2 || q.foundryLevel ? 7 : 4)
              : 0,
          artillery:
            (q.barracksLevel || q.foundryLevel) &&
            p.nationId !== 'turan' &&
            (p.nationId === 'kaldor' || (guard && guard.artillery < 1))
              ? 1
              : 0,
          ...(guard ? { battalionId: guard.id, isMercenary: guard.isMercenary } : {}),
        });
      if (q.marketLevel < 2) choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      if (q.fortLevel < 1 && p.botArchetype === 'Diplomat')
        choices.push({ type: 'BUILD_FORT', provinceId: q.id });
    }
    for (const o of choices) if (tryPlan(o)) break;
  }
  p.ready = true;
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
      offerPeace(g, actorId, command.warId, command.terms);
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
        provinceOf(g, command.targetProvinceId).ownerId === command.targetRealmId,
        'Destino não pertence ao alvo.',
      );
      submitOrder(
        g,
        actorId,
        command.autoTransport
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
    p.manpower = Math.min(p.manpower, l.manpowerCap);
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
    ...g.players.filter((p) => p.subjectOfId === id).map((p) => p.id),
    ...g.visionContracts
      .filter((v) => v.buyerId === id && v.untilTurn >= g.turn)
      .map((v) => v.targetId),
  ]);
  const adjacent = new Set(
    g.provinces.filter((p) => shared.has(controller(p) ?? '')).flatMap((p) => p.neighbors),
  );
  const cleanPlayer = (p: Player) => {
    if (!finished && p.id !== id && p.id !== g.victoryRecord?.winnerId) {
      p.secretObjectives = [];
      p.selectedObjectiveId = null;
      p.objectiveStreak = 0;
      p.paxStreak = 0;
    }
  };
  result.notifications = result.notifications.filter((n) => canSeeNotification(n, id));
  result.players.forEach(cleanPlayer);
  result.history.forEach((h) => h.nations.forEach(cleanPlayer));
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
  return {
    ...result,
    readNotificationIds: structuredClone(g.notificationReads[id] ?? []),
    plannedOrders: structuredClone(orders[id] ?? []),
  };
}
