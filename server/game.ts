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
  canUnitVisit,
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
  electEmperor,
  issueEdict,
  joinDiet,
  leaveDiet,
  offerPeace,
  syncWars,
  updateWarScores,
} from './diplomacy';
import { parseCommand, parseOrder } from './commands';
export { assert, canAttack } from './state';
export { parseOrder, parseCommand };
export const BALANCE = {
  baseUpkeep: 0.35,
  initialGold: 75,
  initialManpower: 20,
  edictGold: 25,
  edictAuthority: 25,
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
  const maxTurns = mode === 'quick' ? 20 : 40,
    turnSeconds = mode === 'quick' ? 180 : 450;
  return {
    version: 3,
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
      createdVersion: '0.3.0',
    },
    players: [],
    provinces: makeMap(mode, theater),
    battalions: [],
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
    armyCap: 999,
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
  g.matchConfig = next.matchConfig;
  g.maxTurns = next.maxTurns;
  g.turnSeconds = next.turnSeconds;
}
export function startGame(g: GameState, now = 0) {
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
        q.id === nationOf(p.nationId).homeProvinceId &&
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
  for (const p of g.players) {
    const home = homes.get(p.id)!;
    home.ownerId = p.id;
    home.capitalOf = p.id;
    home.pacification = 100;
    home.unrest = 5;
    home.religion = p.faith;
    home.portLevel = home.isCoastal ? 1 : 0;
  }
  for (const p of g.players) {
    const nation = nationOf(p.nationId),
      home = homes.get(p.id)!;
    const support =
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
  g.phase = 'planning';
  g.deadline = g.demo ? null : now + g.turnSeconds * 1000;
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
          !seen.has(next) && provinceOf(g, last).neighbors.includes(next) && canUnitVisit(g, a, p),
          'Caminho inválido ou guerra/acesso não autorizado.',
        );
        seen.add(next);
        last = next;
      }
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
      if (o.type === 'BUILD_FORT') assert(p.fortLevel < 3, 'Forte no nível máximo.');
      if (o.type === 'BUILD_PORT')
        assert(p.isCoastal && p.portLevel < 3, 'Porto exige litoral e nível abaixo de 3.');
      if (o.type === 'BUILD_MARKET') assert(p.marketLevel < 3, 'Mercado no nível máximo.');
      if (o.type === 'RECRUIT_BATTALION') {
        assert(unitCount(o) > 0 && unitCount(o) <= 50, 'Recrute entre 1 e 50 unidades.');
        assert(
          o.isFleet
            ? landCount(o) === 0 && (o.warships ?? 0) + (o.transports ?? 0) > 0
            : (o.warships ?? 0) + (o.transports ?? 0) === 0 && landCount(o) > 0,
          'Não misture tropas e navios.',
        );
        if (o.isFleet) assert(p.portLevel >= 1, 'Construa um porto antes de recrutar navios.');
        if (o.isMercenary)
          assert(
            !o.isFleet && (p.capitalOf === id || p.pacification >= 80),
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
            liveArmySize(g, id) + queued + landCount(o) <= actor.armyCap,
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
  const incoming = compositionOf(o);
  if (o.battalionId) {
    const target = battalionOf(g, o.battalionId);
    const virtual = { ...target, ...incoming, training: 1, morale: 60 };
    mergeBattalions(target, virtual);
  } else
    createBattalion(g, id, o.provinceId, incoming, {
      isFleet: o.isFleet,
      isMercenary: o.isMercenary,
      name: o.name,
      morale: 60,
      training: 1,
    });
}
export function submitOrder(g: GameState, id: string, raw: PlayerOrder) {
  const o = parseOrder(raw);
  validateOrder(g, id, o);
  if (o.type === 'DIPLOMACY') {
    diplomacy(g, id, o);
    return;
  }
  if (o.type === 'RECRUIT_BATTALION' && o.isMercenary) {
    const actor = playerOf(g, id),
      cost = orderCost(o, provinceOf(g, o.provinceId), actor);
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
  const cost = orderCost(o, p, actor);
  if (actor.gold < cost.gold || actor.manpower < cost.manpower || actor.influence < cost.influence)
    return;
  if (o.type === 'DIPLOMACY') return;
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
    if (o.type === 'TRAIN_BATTALION') {
      a.training = Math.min(1.5, a.training + 0.1);
      a.morale = clamp(a.morale + 8);
      a.pathQueue = [];
    }
    if (o.type === 'MERGE_BATTALIONS') {
      const b = g.battalions.find((b) => b.id === o.targetBattalionId);
      if (!b || b.provinceId !== a.provinceId) return;
      mergeBattalions(b, a);
      destroyBattalion(g, a);
    }
    if (o.type === 'SPLIT_BATTALION') {
      if (g.battalions.filter((a) => a.ownerId === id).length >= 80) return;
      for (const k of UNIT_KEYS) if (o.composition[k] > a[k]) return;
      for (const k of UNIT_KEYS) a[k] -= o.composition[k];
      createBattalion(g, id, a.provinceId, o.composition, {
        isFleet: a.isFleet,
        isMercenary: a.isMercenary,
        name: o.name,
        morale: a.morale,
        training: a.training,
      });
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
      if (
        actor.disarmUntil >= g.turn &&
        !o.isFleet &&
        liveArmySize(g, id) + landCount(o) > actor.armyCap
      )
        return;
      recruit(g, id, o);
    }
    if (o.type === 'BUILD_FORT') p.fortLevel = Math.min(3, p.fortLevel + 1);
    if (o.type === 'BUILD_PORT') p.portLevel = Math.min(3, p.portLevel + 1);
    if (o.type === 'BUILD_MARKET') p.marketLevel = Math.min(3, p.marketLevel + 1);
    if (o.type === 'PACIFY') {
      const speed =
        (actor.faith === 'ANCESTRAL' ? 1.15 : 1) *
        (nationOf(actor.nationId).modifiers.pacification ?? 1);
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
    if (!g.battalions.some((b) => b.id === a.id)) continue;
    const from = provinceOf(g, a.provinceId),
      target = g.provinces.find((p) => p.id === a.pathQueue[0]);
    if (!target || !from.neighbors.includes(target.id) || !canUnitVisit(g, a, target)) {
      a.pathQueue = [];
      report.events.push(`${a.name}: rota interrompida por fronteira ou tratado.`);
      continue;
    }
    a.pathQueue.shift();
    a.entrenched = false;
    a.morale = clamp(a.morale - 6);
    a.provinceId = target.id;
    moved.add(a.id);
    resolveBattle(g, a, target, report);
    if (
      report.battles.at(-1)?.provinceId === target.id &&
      report.battles.at(-1)?.outcome === 'siege_blocked'
    ) {
      a.provinceId = from.id;
      a.pathQueue = [];
      continue;
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
      moved.add(army.id);
      resolveBattle(g, army, province, report);
    }
  }
}
function applySupply(g: GameState, report: TurnResolutionReport) {
  for (const p of g.provinces) {
    const armies = g.battalions.filter(
      (a) => a.provinceId === p.id && !a.embarkedOnId && !a.stranded,
    );
    const total = armies.reduce((n, a) => n + unitCount(a), 0),
      loss = attritionLoss(total, supplyLimit(p));
    let left = loss;
    const shares = armies.map((a) => Math.floor((loss * unitCount(a)) / Math.max(1, total)));
    left -= shares.reduce((n, v) => n + v, 0);
    for (let i = 0; left > 0 && i < armies.length; i++) {
      if (shares[i] < unitCount(armies[i])) {
        shares[i]++;
        left--;
      }
    }
    armies.forEach((a, i) => {
      if (!shares[i]) return;
      const before = unitCount(a);
      removeUnits(a, shares[i]);
      report.attritionLosses.push({
        armyId: a.id,
        provinceId: p.id,
        ownerId: a.ownerId,
        troopsBefore: before,
        supplyLimit: supplyLimit(p),
        losses: shares[i],
      });
      if (unitCount(a) === 0) destroyBattalion(g, a);
    });
  }
}
export function resolveTurn(g: GameState, now = 0) {
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  const before = new Map(
    g.players.map((p) => [
      p.id,
      g.battalions.filter((a) => a.ownerId === p.id).reduce((n, a) => n + unitCount(a), 0),
    ]),
  );
  const startLog = g.log.length;
  for (const bot of g.players.filter((p) => p.bot)) planBot(g, bot);
  const report = emptyTurnReport(g.turn, g.diet);
  report.diplomaticChanges = g.pendingDiplomacy.splice(0);
  const moved = new Set<string>();
  recoverAndRepatriate(g, report, moved);
  const queued = g.players
    .flatMap((p) => (g.orders[p.id] ?? []).map((o) => ({ id: p.id, o })))
    .sort((a, b) => roll(g, orderKey(a.o) + a.id) - roll(g, orderKey(b.o) + b.id));
  for (const { id, o } of queued) resolveLocal(g, id, o, report, moved);
  moveBattalions(g, report, moved);
  stationaryClashes(g, report, moved);
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
          !a.stranded,
      )
      .reduce((n, a) => n + unitCount(a), 0);
    if (guard >= 3) {
      p.pacification = clamp(
        p.pacification +
          15 *
            (actor.faith === 'ANCESTRAL' ? 1.15 : 1) *
            (nationOf(actor.nationId).modifiers.pacification ?? 1),
      );
      p.unrest = clamp(p.unrest - 10);
    }
    const total = g.battalions
      .filter(
        (a) =>
          a.ownerId === id && a.provinceId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded,
      )
      .reduce((n, a) => n + unitCount(a), 0);
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
    if (!active) p.stability = clamp(p.stability + 1);
    if (p.disarmUntil < g.turn) p.armyCap = 999;
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
    p.capitalOf = null;
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
    p.gold = roundMoney(Math.max(0, p.gold + eco.net));
    p.manpower = Math.min(100, p.manpower + eco.manpower);
    p.influence = Math.min(50, p.influence + 2);
    p.tradeEarned = roundMoney(p.tradeEarned + eco.trade);
    for (const a of g.battalions.filter((a) => a.ownerId === p.id && !a.stranded)) {
      a.morale = clamp(
        a.morale + (bankrupt ? -12 : moved.has(a.id) ? 0 : Math.max(0, 4 - p.warExhaustion * 0.04)),
      );
    }
    report.economy.push({
      playerId: p.id,
      turn: g.turn,
      ...{
        taxes: eco.taxes,
        trade: eco.trade,
        tithes: eco.tithes,
        grossIncome: eco.grossIncome,
        income: eco.income,
        upkeep: eco.upkeep,
        net: eco.net,
      },
      gold: p.gold,
      warExhaustion: p.warExhaustion,
    });
  }
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
  electEmperor(g);
  g.diet.peaceTurnsCounter = g.wars.some((w) => w.active)
    ? 0
    : Math.min(5, g.diet.peaceTurnsCounter + 1);
  if (g.diet.emperorId) {
    const emperor = playerOf(g, g.diet.emperorId);
    g.diet.imperialAuthority = clamp(
      g.diet.imperialAuthority +
        (g.wars.some((w) => w.active)
          ? -2
          : g.diet.memberRealmIds.length *
            2 *
            (nationOf(emperor.nationId).modifiers.authority ?? 1)),
    );
  }
  for (const offer of [...g.offers])
    if (offer.expiresTurn <= g.turn) {
      if (offer.kind === 'call_to_arms' && offer.defensive)
        answerOffer(g, offer.to, offer.id, true);
      else g.offers = g.offers.filter((o) => o.id !== offer.id);
    }
  report.diplomaticChanges.push(...g.pendingDiplomacy.splice(0));
  report.diet = dietSnapshot(g.diet, g.turn);
  report.events.push(...g.log.slice(startLog).map((e) => e.text));
  const win = victoryStatus(g);
  if (win) {
    g.winnerId = win.winnerId;
    g.winnerObjective = win.objective;
    g.finishReason = 'victory';
    g.phase = 'finished';
  } else if (g.turn >= g.maxTurns || !survivingRealms.size) {
    g.phase = 'finished';
    g.finishReason = survivingRealms.size ? 'turn_limit' : 'realm_collapse';
  }
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
    g.deadline = g.demo || g.paused ? null : now + g.turnSeconds * 1000;
  } else g.deadline = null;
  g.battalions = g.battalions.filter((a) => unitCount(a) > 0);
  return report;
}
function tryOrder(g: GameState, p: Player, o: PlayerOrder) {
  try {
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
      if (score >= 80) {
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
  const emperor = g.players.find((realm) => realm.id === g.diet.emperorId);
  const imperialInclination =
    p.botArchetype === 'Diplomat' ||
    (p.botArchetype === 'Merchant' && g.turn >= 9) ||
    (p.botArchetype === 'Theocrat' &&
      (g.turn >= 12 || (g.turn >= 7 && emperor?.faith === p.faith)));
  if (
    (imperialInclination || g.diet.memberRealmIds.includes(p.id)) &&
    !g.diet.bannedRealmIds.includes(p.id)
  ) {
    if (!g.diet.memberRealmIds.includes(p.id)) joinDiet(g, p.id);
    const candidate = g.diet.memberRealmIds
      .map((id) => playerOf(g, id))
      .sort(
        (a, b) =>
          (b.nationId === 'AUSTRIA' ? 30 : 0) - (a.nationId === 'AUSTRIA' ? 30 : 0) ||
          b.prestige - a.prestige ||
          a.id.localeCompare(b.id),
      )[0];
    if (candidate) {
      g.diet.votes[p.id] = candidate.id;
      electEmperor(g);
    }
    if (
      g.diet.emperorId === p.id &&
      !g.diet.retaliationEdictActive &&
      g.diet.imperialAuthority >= 25 &&
      p.gold - reservedResources(g, p.id).gold >= 25 &&
      g.turn >= 3
    )
      try {
        issueEdict(g, p.id);
      } catch {}
  }
  botPeace(g, p);
  for (const a of [
    ...g.battalions.filter(
      (a) => a.ownerId === p.id && !a.isFleet && !a.embarkedOnId && !a.stranded,
    ),
  ]) {
    if (a.pathQueue.length) continue;
    const from = provinceOf(g, a.provinceId);
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
        if (p.botArchetype !== 'Militarist' && !g.diet.bannedRealmIds.includes(target)) continue;
        if (
          g.diet.retaliationEdictActive &&
          g.diet.memberRealmIds
            .filter((id) => id !== p.id)
            .reduce((n, id) => n + liveArmySize(g, id), 0) >
            liveArmySize(g, p.id) * 1.8
        )
          continue;
        try {
          declareWar(
            g,
            p.id,
            target,
            p.faith !== playerOf(g, target).faith && p.faith === 'SOLAR'
              ? 'HOLY_WAR'
              : g.diet.bannedRealmIds.includes(target)
                ? 'IMPERIAL_BAN'
                : 'CONQUEST',
          );
        } catch {
          continue;
        }
      }
      if (tryOrder(g, p, { type: 'MOVE_BATTALION', battalionId: a.id, targetProvinceId: q.id })) {
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
      if (next)
        moved = tryOrder(g, p, { type: 'MOVE_BATTALION', battalionId: a.id, path: next.path! });
    }
    if (!moved && a.training < 1.4) tryOrder(g, p, { type: 'TRAIN_BATTALION', battalionId: a.id });
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
        tryOrder(g, p, {
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
        if (routes[0])
          tryOrder(g, p, { type: 'MOVE_BATTALION', battalionId: f.id, path: routes[0] });
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
        tryOrder(g, p, { type: 'EMBARK_BATTALION', battalionId: load.id, fleetId: f.id });
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
    if (q.unrest > 55 || q.pacification < 65) choices.push({ type: 'PACIFY', provinceId: q.id });
    if (q.ownerId === p.id && !q.occupierId) {
      if (p.botArchetype === 'Merchant' && q.marketLevel < 3)
        choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      if (p.botArchetype === 'Theocrat' && q.religion !== p.faith)
        choices.push({ type: 'CONVERT', targetProvinceId: q.id });
      if (!guard || unitCount(guard) < Math.min(11, supplyLimit(q) - 2))
        choices.push({
          type: 'RECRUIT_BATTALION',
          provinceId: q.id,
          infantry: 3,
          artillery: guard && guard.artillery < 1 ? 1 : 0,
          ...(guard ? { battalionId: guard.id, isMercenary: guard.isMercenary } : {}),
        });
      if (q.marketLevel < 3) choices.push({ type: 'BUILD_MARKET', provinceId: q.id });
      if (q.fortLevel < 1 && p.botArchetype === 'Diplomat')
        choices.push({ type: 'BUILD_FORT', provinceId: q.id });
    }
    for (const o of choices) if (tryOrder(g, p, o)) break;
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
    !['START_GAME', 'SET_MODE', 'SET_IDENTITY', 'ADD_BOT', 'REPLACE_WITH_BOT', 'CHAT'].includes(
      command.type,
    )
  )
    assert(g.phase === 'planning', 'A campanha não está em andamento.');
  switch (command.type) {
    case 'SUBMIT_ORDER':
      submitOrder(g, actorId, command.order);
      break;
    case 'CANCEL_ORDER':
      cancelOrder(g, actorId, command.key);
      break;
    case 'READY':
      actor.ready = command.ready;
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
      declareWar(g, actorId, command.targetRealmId, command.casusBelli, command.offensiveAllyIds);
      break;
    case 'OFFER_PEACE':
      offerPeace(g, actorId, command.warId, command.terms);
      break;
    case 'CALL_TO_ARMS':
      callToArms(g, actorId, command.warId, command.allyId);
      break;
    case 'JOIN_DIET':
      joinDiet(g, actorId);
      break;
    case 'LEAVE_DIET':
      leaveDiet(g, actorId);
      break;
    case 'VOTE_EMPEROR':
      assert(
        g.diet.memberRealmIds.includes(actorId) &&
          g.diet.memberRealmIds.includes(command.candidateId),
        'Eleitor e candidato devem pertencer à Dieta.',
      );
      g.diet.votes[actorId] = command.candidateId;
      electEmperor(g);
      break;
    case 'ISSUE_IMPERIAL_EDICT':
      issueEdict(g, actorId);
      break;
  }
  refreshScores(g);
  return g;
}
export function viewFor(g: GameState, id: string): GameView {
  const { orders, seed: _seed, nextId: _ids, pendingDiplomacy: _pending, ...publicState } = g;
  const result = structuredClone(publicState);
  const redact = (report: TurnResolutionReport) => {
    for (const c of report.diplomaticChanges) if (c.covert && c.actorId !== id) c.actorId = null;
  };
  if (result.lastReport) redact(result.lastReport);
  result.reports.forEach(redact);
  result.history.forEach(redact);
  for (const a of result.battalions) if (a.ownerId !== id) a.pathQueue = [];
  return { ...result, plannedOrders: structuredClone(orders[id] ?? []) };
}
