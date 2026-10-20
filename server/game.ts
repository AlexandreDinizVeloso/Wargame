import { makeMap } from '../shared/map';
import { FACTIONS, OBJECTIVES, emptyTurnReport } from '../shared/types';
import type {
  BotArchetype,
  GameCommand,
  GameMode,
  GameState,
  GameView,
  Objective,
  Order,
  Player,
  PlayerOrder,
  Province,
  StationedArmy,
  TurnResolutionReport,
} from '../shared/types';
import {
  attritionLoss,
  clamp,
  legacyOrder,
  normalizeOrder,
  orderCost,
  orderKey,
  orderProvinceId,
  reservedResources,
  roundMoney,
  realmEconomy,
  supplyLimit,
} from '../shared/rules';
import {
  activeAlliances,
  armyAt,
  assert,
  canAttack,
  canEnter,
  log,
  mergeArmy,
  nextId,
  objectiveFor,
  playerOf,
  provinceOf,
  relation,
  removeTroops,
  roll,
  setReligion,
  stationArmy,
} from './state';
import { answerAlliance, breakAlliance, executeDiplomacy, proposeAlliance } from './diplomacy';
import { combatPowers, resolveMarch, safestRetreat, type March } from './combat';
export {
  activeAlliances,
  assert,
  canAttack,
  relation,
  answerAlliance,
  breakAlliance,
  proposeAlliance,
};

export const BALANCE = {
  baseUpkeep: 0.35,
  initialGold: 50,
  targets: {
    quick: { conquest: 22, prosperity: 26, concord: 11, faith: 14 },
    campaign: { conquest: 30, prosperity: 35, concord: 14, faith: 16 },
  },
  conquestBattlePoints: 0.35,
  prosperityTradeDivisor: 18,
  faithProvincePoints: 1.5,
  faithConversionPoints: 1.2,
  concordPeacePoints: 0.6,
  concordAlliancePoints: 1.5,
} as const;
const OBJECTIVE_IDS: Objective[] = ['conquest', 'prosperity', 'concord', 'faith'];
const ARCHETYPES: BotArchetype[] = ['Militarist', 'Merchant', 'Diplomat', 'Theocrat'];
const values = (): Record<Objective, number> => ({
  conquest: 0,
  prosperity: 0,
  concord: 0,
  faith: 0,
});
function hash(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function createGame(
  code: string,
  mode: GameMode = 'quick',
  demo = false,
  seed = hash(code),
): GameState {
  return {
    version: 2,
    code,
    hostId: '',
    phase: 'lobby',
    turn: 0,
    maxTurns: mode === 'quick' ? 20 : 40,
    seed,
    nextId: 1,
    players: [],
    provinces: makeMap(),
    relations: [],
    offers: [],
    orders: {},
    log: [],
    chat: [],
    winnerId: null,
    winnerObjective: null,
    hegemonyLeaderId: null,
    mode,
    turnSeconds: mode === 'quick' ? 180 : 450,
    deadline: null,
    demo,
    paused: false,
    persistenceEnabled: false,
    baseUpkeep: BALANCE.baseUpkeep,
    victoryTargets: { ...BALANCE.targets[mode] },
    stationedArmies: [],
    displacedArmies: [],
    lastReport: null,
    reports: [],
    pendingDiplomacy: [],
  };
}
export function addPlayer(
  g: GameState,
  name: string,
  bot = false,
  objective: Objective = 'conquest',
  archetype?: BotArchetype,
) {
  assert(g.phase === 'lobby', 'A partida já começou.');
  assert(g.players.length < 8, 'A sala já tem 8 jogadores.');
  const p: Player = {
    id: `${g.code}-p${g.players.length + 1}`,
    name: name.trim().slice(0, 24) || 'Estrategista',
    ...FACTIONS[g.players.length],
    bot,
    botArchetype: archetype ?? ARCHETYPES[OBJECTIVE_IDS.indexOf(objective)],
    objective,
    doctrine: 'tolerant',
    online: true,
    gold: BALANCE.initialGold,
    manpower: 10,
    influence: 6,
    ready: bot,
    peaceTurns: 0,
    wonBattles: 0,
    conversions: 0,
    score: 0,
    warExhaustion: 0,
    tradeEarned: 0,
    stability: 100,
    scores: values(),
    victoryProgress: values(),
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
export function setMode(g: GameState, mode: GameMode) {
  assert(g.phase === 'lobby', 'O modo só pode mudar antes da partida.');
  assert(mode === 'quick' || mode === 'campaign', 'Modo inválido.');
  g.mode = mode;
  g.maxTurns = mode === 'quick' ? 20 : 40;
  g.turnSeconds = mode === 'quick' ? 180 : 450;
  g.victoryTargets = { ...BALANCE.targets[mode] };
}
export function startGame(g: GameState, now = 0) {
  assert(g.phase === 'lobby', 'A partida já começou.');
  assert(
    g.players.length >= 3 && g.players.length <= 8,
    'São necessários de 3 a 8 jogadores (pessoas ou bots).',
  );
  const homes = [
    [16, 24],
    [17, 25],
    [11, 19],
    [2, 3],
    [12, 13],
    [21, 20],
    [31, 30],
    [15, 23],
  ];
  g.players.forEach((p, i) =>
    homes[i].forEach((index, j) => {
      Object.assign(g.provinces[index], {
        ownerId: p.id,
        troops: j === 0 ? 6 : 4,
        mercenaries: 0,
        morale: 75,
        training: 1.2,
        pacification: 100,
        unrest: 5,
        capital: j === 0,
      });
      setReligion(g.provinces[index], p.faith);
    }),
  );
  g.phase = 'planning';
  g.turn = 1;
  g.deadline = g.demo ? null : now + g.turnSeconds * 1000;
  refreshScores(g);
  log(g, 'A campanha começou. Prepare ordens simultâneas e negocie com o conselho.');
}
export function parseOrder(raw: unknown): PlayerOrder {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'Ordem inválida.');
  const data = raw as Record<string, unknown>;
  if (typeof data.type !== 'string') {
    assert(
      typeof data.action === 'string' &&
        ['move', 'recruit', 'train', 'develop', 'pacify', 'convert'].includes(data.action),
      'Ação inválida.',
    );
    return parseOrder(normalizeOrder(data as unknown as Order));
  }
  const str = (key: string) => {
    assert(typeof data[key] === 'string' && data[key].length <= 100, `Campo ${key} inválido.`);
    return data[key] as string;
  };
  const number = (key: string) => {
    assert(typeof data[key] === 'number' && Number.isFinite(data[key]), `Campo ${key} inválido.`);
    return data[key] as number;
  };
  switch (data.type) {
    case 'MOVE_ATTACK':
      return {
        type: data.type,
        fromProvinceId: str('fromProvinceId'),
        toProvinceId: str('toProvinceId'),
        troops: number('troops'),
      };
    case 'RECRUIT':
      return {
        type: data.type,
        provinceId: str('provinceId'),
        amount: number('amount'),
        isMercenary: data.isMercenary === true,
      };
    case 'TRAIN':
    case 'PACIFY':
    case 'BUILD_FORT':
    case 'DEVELOP':
      return { type: data.type, provinceId: str('provinceId') };
    case 'CONVERT':
      return { type: data.type, targetProvinceId: str('targetProvinceId') };
    case 'DIPLOMACY': {
      const action = str('action');
      assert(
        [
          'PROPOSE_ALLIANCE',
          'BREAK_ALLIANCE',
          'DEMAND_TRIBUTE',
          'EMBARGO',
          'FUND_REBELS',
          'MILITARY_ACCESS',
          'SEND_SUBSIDY',
        ].includes(action),
        'Ação diplomática inválida.',
      );
      const o: PlayerOrder = {
        type: data.type,
        action: action as 'EMBARGO',
        targetRealmId: str('targetRealmId'),
      };
      if (data.amount !== undefined) o.amount = number('amount');
      if (data.targetProvinceId !== undefined) o.targetProvinceId = str('targetProvinceId');
      return o;
    }
    default:
      throw new Error('Tipo de ordem desconhecido.');
  }
}
export function submitOrder(g: GameState, id: string, raw: PlayerOrder | Order) {
  assert(g.phase === 'planning', 'Não é a fase de ordens.');
  const actor = playerOf(g, id);
  assert(!actor.ready, 'Reabra suas ordens antes de alterá-las.');
  const o = parseOrder(raw);
  if (o.type === 'DIPLOMACY') {
    executeDiplomacy(g, id, o);
    refreshScores(g);
    return;
  }
  const p = provinceOf(g, orderProvinceId(o)!);
  if (o.type === 'MOVE_ATTACK') {
    const army = armyAt(g, p, id);
    assert(army, 'Você só pode dar ordens às suas tropas.');
    const target = provinceOf(g, o.toProvinceId);
    assert(
      p.neighbors.includes(target.id),
      'A marcha precisa ter destino em uma província vizinha.',
    );
    assert(
      canEnter(g, id, target.ownerId) || canAttack(g, id, target.ownerId),
      'Uma aliança ou trégua impede esse ataque. Solicite acesso militar para atravessar uma aliança.',
    );
    assert(
      Number.isInteger(o.troops) &&
        o.troops > 0 &&
        o.troops <= army.troops - (p.ownerId === id ? 1 : 0),
      p.ownerId === id
        ? 'Deixe pelo menos 1 tropa na origem.'
        : 'A marcha excede o seu destacamento.',
    );
    if (!canEnter(g, id, target.ownerId))
      assert(
        o.troops >= target.fortLevel * 3,
        `O forte exige pelo menos ${target.fortLevel * 3} tropas para cerco.`,
      );
  } else if (o.type === 'CONVERT') {
    assert(p.religion !== actor.faith, 'Essa província já segue sua crença.');
    assert(
      p.ownerId === id || g.provinces.some((q) => q.ownerId === id && q.neighbors.includes(p.id)),
      'Conversão transfronteiriça exige uma província própria adjacente.',
    );
    assert(
      !p.ownerId || p.ownerId === id || !relation(g, id, p.ownerId)?.allied,
      'Missões hostis não podem visar um aliado.',
    );
  } else if (o.type === 'TRAIN') {
    const army = armyAt(g, p, id);
    assert(army, 'Você só pode treinar suas tropas.');
    assert(army.troops > 0 && army.training < 1.5, 'As tropas já atingiram o treinamento máximo.');
  } else {
    assert(p.ownerId === id, 'Você só pode dar ordens nas suas províncias.');
    if (o.type === 'RECRUIT') {
      assert(
        Number.isInteger(o.amount) && o.amount >= 1 && o.amount <= 50,
        'Recrute de 1 a 50 tropas por ordem.',
      );
      if (o.isMercenary)
        assert(
          p.capital || p.pacification >= 80,
          'Mercenários exigem capital ou província com pelo menos 80 de pacificação.',
        );
    }
    if (o.type === 'DEVELOP') assert(p.development < 3, 'Desenvolvimento máximo atingido.');
    if (o.type === 'BUILD_FORT') assert(p.fortLevel < 3, 'O forte já está no nível máximo.');
    if (o.type === 'PACIFY')
      assert(p.pacification < 100 || p.unrest > 0, 'A província já está pacificada.');
  }
  const instant = o.type === 'RECRUIT' && o.isMercenary;
  const reserved = reservedResources(g, id, instant ? undefined : orderKey(o)),
    cost = orderCost(o, p);
  assert(
    reserved.gold + cost.gold <= actor.gold + 0.00001,
    'Ouro insuficiente para as ordens planejadas.',
  );
  assert(
    reserved.manpower + cost.manpower <= actor.manpower,
    'Reservas de recrutamento insuficientes.',
  );
  assert(reserved.influence + cost.influence <= actor.influence, 'Influência insuficiente.');
  if (instant) {
    actor.gold = roundMoney(actor.gold - cost.gold);
    mergeArmy(p, { troops: o.amount, mercenaries: o.amount, morale: 60, training: 1 });
    log(g, `${actor.nation} contratou ${o.amount} mercenários em ${p.name}.`, 'economy');
  } else
    g.orders[id] = [...g.orders[id].filter((existing) => orderKey(existing) !== orderKey(o)), o];
}
export function cancelOrder(g: GameState, id: string, key: string) {
  assert(
    g.phase === 'planning' && !playerOf(g, id).ready,
    'Reabra suas ordens antes de alterá-las.',
  );
  g.orders[id] = g.orders[id].filter((o) => orderKey(o) !== key);
}
export function refreshScores(g: GameState) {
  for (const p of g.players) {
    const own = g.provinces.filter((q) => q.ownerId === p.id),
      stable = own.filter((q) => q.pacification >= 80 && q.unrest <= 25);
    p.stability = own.length
      ? Math.round(own.reduce((n, q) => n + clamp(q.pacification - q.unrest * 0.5), 0) / own.length)
      : 0;
    p.scores = {
      conquest: own.length + p.wonBattles * BALANCE.conquestBattlePoints,
      prosperity:
        own.reduce((n, q) => n + q.development * 2, 0) +
        p.gold / 30 +
        p.tradeEarned / BALANCE.prosperityTradeDivisor,
      concord:
        stable.length +
        Math.min(8, p.peaceTurns) * BALANCE.concordPeacePoints +
        activeAlliances(g, p.id).filter((r) =>
          g.provinces.some((q) => q.ownerId === (r.a === p.id ? r.b : r.a)),
        ).length *
          BALANCE.concordAlliancePoints,
      faith:
        stable.filter((q) => q.religion === p.faith).length * BALANCE.faithProvincePoints +
        p.conversions * BALANCE.faithConversionPoints,
    };
    p.victoryProgress = Object.fromEntries(
      OBJECTIVE_IDS.map((key) => [key, clamp((p.scores[key] / g.victoryTargets[key]) * 100)]),
    ) as Record<Objective, number>;
    p.score = p.scores[p.objective];
  }
}
function updateHegemony(g: GameState, report: TurnResolutionReport) {
  const contenders = g.players
    .filter((p) => g.provinces.some((q) => q.ownerId === p.id))
    .flatMap((p) =>
      OBJECTIVE_IDS.map((objective) => ({
        playerId: p.id,
        objective,
        progress: p.victoryProgress[objective],
      })),
    )
    .filter((c) => c.progress >= 75)
    .sort((a, b) => b.progress - a.progress || roll(g, a.playerId) - roll(g, b.playerId));
  const leader = contenders[0];
  if (leader && g.hegemonyLeaderId !== leader.playerId) {
    report.hegemonyAlerts.push(leader);
    log(
      g,
      `${playerOf(g, leader.playerId).nation} atingiu ${Math.round(leader.progress)}% em ${OBJECTIVES[leader.objective].name}. Coalizão: +10% de força contra a hegemonia.`,
      'diplomacy',
    );
  }
  g.hegemonyLeaderId = leader?.playerId ?? null;
}
function recoverDisplaced(g: GameState, report: TurnResolutionReport, moved: Set<string>) {
  const displaced = g.displacedArmies;
  g.displacedArmies = [];
  for (const army of displaced) {
    const target = safestRetreat(g, army.provinceId, army.ownerId);
    if (target) {
      stationArmy(g, target, army.ownerId, army);
      moved.add(target.id);
      report.retreats.push({
        armyId: army.id,
        ownerId: army.ownerId,
        fromProvinceId: army.provinceId,
        toProvinceId: target.id,
        survivors: army.troops,
        regrouped: army.troops,
        dispersed: 0,
        morale: 15,
        stranded: false,
      });
    } else if (army.morale === 0)
      report.stackwipes.push({
        armyId: army.id,
        ownerId: army.ownerId,
        provinceId: army.provinceId,
        troops: army.troops,
        reason: 'zero_morale_no_escape',
      });
    else {
      army.morale = 0;
      g.displacedArmies.push(army);
    }
  }
}
function convert(g: GameState, actor: Player, p: Province, report: TurnResolutionReport) {
  if (p.conversionReligion !== actor.faith) {
    p.conversion = 0;
    p.conversionReligion = actor.faith;
  }
  p.conversion += 50;
  if (p.conversion >= 100) {
    const previous = p.religion,
      crossBorder = p.ownerId !== actor.id;
    setReligion(p, actor.faith);
    p.conversion = 0;
    p.conversionReligion = null;
    p.conversionInstigatorId = crossBorder ? actor.id : null;
    actor.conversions++;
    if (crossBorder) p.unrest = clamp(p.unrest + 20);
    report.conversions.push({
      provinceId: p.id,
      actorId: actor.id,
      ownerId: p.ownerId,
      from: previous,
      to: actor.faith,
      crossBorder,
    });
    log(
      g,
      `${actor.nation} concluiu uma missão em ${p.name}.${crossBorder ? ' A tensão local subiu 20; uma invasão terá bônus religioso de 15%.' : ''}`,
      'diplomacy',
    );
  }
}
function repatriateCamps(g: GameState, report: TurnResolutionReport, moved: Set<string>) {
  for (const army of [...g.stationedArmies]) {
    const p = provinceOf(g, army.provinceId);
    if (p.ownerId === army.ownerId) {
      g.stationedArmies = g.stationedArmies.filter((a) => a.id !== army.id);
      mergeArmy(p, army);
      continue;
    }
    if (
      army.ownerId &&
      (canEnter(g, army.ownerId, p.ownerId) ||
        (p.ownerId && relation(g, army.ownerId, p.ownerId)?.allied))
    )
      continue;
    g.stationedArmies = g.stationedArmies.filter((a) => a.id !== army.id);
    if (army.troops <= 0) continue;
    const destination = safestRetreat(g, p.id, army.ownerId);
    army.morale = 15;
    if (destination) {
      stationArmy(g, destination, army.ownerId, army);
      moved.add(destination.id);
    } else g.displacedArmies.push({ ...army, stranded: true });
    report.retreats.push({
      reason: 'repatriation',
      armyId: army.id,
      ownerId: army.ownerId,
      fromProvinceId: p.id,
      toProvinceId: destination?.id ?? null,
      survivors: army.troops,
      regrouped: army.troops,
      dispersed: 0,
      morale: 15,
      stranded: !destination,
    });
  }
}
function applyAttrition(g: GameState, report: TurnResolutionReport) {
  for (const p of g.provinces) {
    const stocks = [
      { stock: p, ownerId: p.ownerId, id: `garrison-${p.id}` },
      ...g.stationedArmies
        .filter((a) => a.provinceId === p.id)
        .map((a) => ({ stock: a, ownerId: a.ownerId, id: a.id })),
    ];
    const total = stocks.reduce((n, a) => n + a.stock.troops, 0),
      limit = supplyLimit(p),
      loss = attritionLoss(total, limit);
    if (!loss) continue;
    let left = loss;
    const shares = stocks.map((a) => Math.floor((loss * a.stock.troops) / total));
    left -= shares.reduce((n, x) => n + x, 0);
    for (let i = 0; left > 0; i = (i + 1) % stocks.length)
      if (shares[i] < stocks[i].stock.troops) {
        shares[i]++;
        left--;
      }
    stocks.forEach((a, i) => {
      if (!shares[i]) return;
      const before = a.stock.troops;
      removeTroops(a.stock, shares[i]);
      report.attritionLosses.push({
        armyId: a.id,
        provinceId: p.id,
        ownerId: a.ownerId,
        troopsBefore: before,
        supplyLimit: limit,
        losses: shares[i],
      });
    });
  }
}
export function resolveTurn(g: GameState, now = 0): TurnResolutionReport {
  assert(g.phase === 'planning', 'A campanha não está em andamento.');
  for (const bot of g.players.filter((p) => p.bot)) planBot(g, bot);
  const report = emptyTurnReport(g.turn);
  report.diplomaticChanges = g.pendingDiplomacy.splice(0);
  const moved = new Set<string>(),
    fought = new Set<string>(),
    marches: March[] = [];
  recoverDisplaced(g, report, moved);
  const queued = g.players
    .flatMap((p) => g.orders[p.id].map((order) => ({ actor: p, order })))
    .sort(
      (a, b) =>
        roll(g, `${a.actor.id}:${orderKey(a.order)}`) -
        roll(g, `${b.actor.id}:${orderKey(b.order)}`),
    );
  for (const { actor, order: o } of queued) {
    if (o.type === 'DIPLOMACY') continue;
    const p = provinceOf(g, orderProvinceId(o)!);
    const army = armyAt(g, p, actor.id);
    if (o.type !== 'CONVERT' && !army) continue;
    if (
      o.type === 'CONVERT' &&
      (p.religion === actor.faith ||
        (p.ownerId && p.ownerId !== actor.id && relation(g, actor.id, p.ownerId)?.allied))
    )
      continue;
    const cost = orderCost(o, p);
    if (
      actor.gold < cost.gold ||
      actor.manpower < cost.manpower ||
      actor.influence < cost.influence
    )
      continue;
    actor.gold = roundMoney(actor.gold - cost.gold);
    actor.manpower -= cost.manpower;
    actor.influence -= cost.influence;
    switch (o.type) {
      case 'MOVE_ATTACK': {
        const target = provinceOf(g, o.toProvinceId);
        if (!canEnter(g, actor.id, target.ownerId) && !canAttack(g, actor.id, target.ownerId))
          continue;
        const count = Math.min(o.troops, army!.troops - (p.ownerId === actor.id ? 1 : 0));
        if (count < 1) continue;
        const troops = removeTroops(army!, count);
        marches.push({
          ...troops,
          id: nextId(g, 'march'),
          ownerId: actor.id,
          provinceId: target.id,
          fromProvinceId: p.id,
          morale: clamp(troops.morale - 6),
          stranded: false,
        });
        moved.add(p.id);
        break;
      }
      case 'RECRUIT':
        mergeArmy(p, { troops: o.amount, mercenaries: 0, morale: 60, training: 1 });
        break;
      case 'TRAIN':
        army!.training = Math.min(1.5, Math.round((army!.training + 0.1) * 100) / 100);
        army!.morale = clamp(army!.morale + 8);
        break;
      case 'PACIFY':
        p.pacification = clamp(p.pacification + 35);
        p.unrest = clamp(p.unrest - 25);
        break;
      case 'DEVELOP':
        p.development++;
        break;
      case 'BUILD_FORT':
        p.fortLevel++;
        break;
      case 'CONVERT':
        convert(g, actor, p, report);
        break;
    }
  }
  marches.sort(
    (a, b) => roll(g, a.fromProvinceId + a.ownerId) - roll(g, b.fromProvinceId + b.ownerId),
  );
  for (const march of marches) resolveMarch(g, march, report, moved, fought);
  for (const p of g.provinces.filter((p) => p.ownerId)) {
    if (p.troops >= 3 && !moved.has(p.id)) {
      p.pacification = clamp(p.pacification + 15);
      p.unrest = clamp(p.unrest - 10);
    }
    if (p.pacification < 50 && p.troops < 2) p.unrest = clamp(p.unrest + 15);
    if (p.unrest >= 100) {
      const previousOwnerId = p.ownerId!;
      p.ownerId = null;
      p.troops = Math.max(2, Math.ceil(p.troops * 0.6));
      p.mercenaries = 0;
      p.pacification = 0;
      p.unrest = 40;
      p.morale = 55;
      p.training = 1;
      report.rebellions.push({ provinceId: p.id, previousOwnerId, rebelTroops: p.troops });
      log(g, `${p.name} se rebelou. Forças locais assumiram a província.`, 'economy');
    }
  }
  repatriateCamps(g, report, moved);
  // Charge maintenance on the full army before supply losses, so attrition cannot erase its cost.
  const economies = new Map(g.players.map((p) => [p.id, realmEconomy(g, p.id)]));
  applyAttrition(g, report);
  for (const actor of g.players) {
    const eco = economies.get(actor.id)!;
    const bankrupt = actor.gold + eco.net < 0;
    actor.gold = roundMoney(Math.max(0, actor.gold + eco.net));
    actor.tradeEarned = roundMoney(actor.tradeEarned + eco.trade);
    actor.manpower = Math.min(60, actor.manpower + eco.manpower);
    actor.influence = Math.min(
      40,
      actor.influence +
        1 +
        eco.owned.filter((p) => p.resource === 'shrine').length +
        (actor.doctrine === 'devout'
          ? eco.owned.filter((p) => p.religion === actor.faith).length
          : 0),
    );
    actor.peaceTurns = fought.has(actor.id) ? 0 : actor.peaceTurns + 1;
    actor.warExhaustion =
      g.mode === 'campaign' ? clamp(actor.warExhaustion + (fought.has(actor.id) ? 10 : -6)) : 0;
    for (const p of g.provinces.filter((p) => p.ownerId === actor.id))
      p.morale = clamp(p.morale + (bankrupt ? -12 : moved.has(p.id) ? 0 : 4));
    for (const a of g.stationedArmies.filter((a) => a.ownerId === actor.id))
      a.morale = clamp(a.morale + (bankrupt ? -12 : moved.has(a.provinceId) ? 0 : 4));
  }
  for (const r of g.relations)
    if (r.tribute && r.tribute.untilTurn >= g.turn) {
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
        text: `${payer.nation} pagou ${amount} ouro a ${recipient.nation}.`,
      });
    } else if (r.tribute) r.tribute = null;
  g.stationedArmies = g.stationedArmies.filter((a) => a.troops > 0);
  refreshScores(g);
  updateHegemony(g, report);
  const active = g.players.filter((p) => g.provinces.some((q) => q.ownerId === p.id));
  const progress = (p: Player) => Math.max(...Object.values(p.victoryProgress));
  const ranked = [...active].sort(
    (a, b) =>
      progress(b) - progress(a) ||
      g.provinces.filter((p) => p.ownerId === b.id).length -
        g.provinces.filter((p) => p.ownerId === a.id).length ||
      b.gold - a.gold ||
      a.id.localeCompare(b.id),
  );
  if (ranked.length <= 1 || progress(ranked[0]) >= 100 || g.turn >= g.maxTurns) {
    g.phase = 'finished';
    g.winnerId = ranked[0]?.id ?? null;
    g.winnerObjective = ranked[0]
      ? ranked.length === 1
        ? 'conquest'
        : [...OBJECTIVE_IDS].sort(
            (a, b) =>
              ranked[0].victoryProgress[b] - ranked[0].victoryProgress[a] ||
              (a === ranked[0].objective ? -1 : b === ranked[0].objective ? 1 : 0),
          )[0]
      : null;
    g.deadline = null;
    log(
      g,
      ranked[0]
        ? `${ranked[0].nation} venceu por ${OBJECTIVES[g.winnerObjective!].name}.`
        : 'A campanha terminou sem um reino vencedor.',
    );
  } else {
    g.turn++;
    g.deadline = g.demo ? null : now + g.turnSeconds * 1000;
    log(g, `Rodada ${g.turn}: rendimentos recebidos; novas ordens disponíveis.`);
  }
  for (const p of g.players) {
    g.orders[p.id] = [];
    p.ready = p.bot || !g.provinces.some((q) => q.ownerId === p.id);
  }
  g.lastReport = report;
  g.reports = [...g.reports, report].slice(-8);
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
export function planBot(g: GameState, p: Player) {
  g.orders[p.id] = [];
  p.ready = false;
  const owned = g.provinces.filter((q) => q.ownerId === p.id);
  if (!owned.length) {
    p.ready = true;
    return;
  }
  if (p.botArchetype === 'Diplomat' && activeAlliances(g, p.id).length < 2) {
    const partner = g.players
      .filter(
        (q) =>
          q.id !== p.id &&
          q.id !== g.hegemonyLeaderId &&
          g.provinces.some((t) => t.ownerId === q.id) &&
          !relation(g, p.id, q.id)?.allied &&
          activeAlliances(g, q.id).length < 2,
      )
      .sort(
        (a, b) => (relation(g, p.id, b.id)?.trust ?? 0) - (relation(g, p.id, a.id)?.trust ?? 0),
      )[0];
    if (partner)
      tryOrder(g, p, { type: 'DIPLOMACY', action: 'PROPOSE_ALLIANCE', targetRealmId: partner.id });
  }
  if (
    p.botArchetype === 'Militarist' &&
    g.hegemonyLeaderId &&
    g.hegemonyLeaderId !== p.id &&
    relation(g, p.id, g.hegemonyLeaderId)?.allied
  )
    tryOrder(g, p, {
      type: 'DIPLOMACY',
      action: 'BREAK_ALLIANCE',
      targetRealmId: g.hegemonyLeaderId,
    });
  for (const province of [...owned].sort(
    (a, b) => b.troops - a.troops || a.id.localeCompare(b.id),
  )) {
    const targets = province.neighbors
      .map((id) => provinceOf(g, id))
      .filter(
        (q) => q.ownerId !== p.id && canAttack(g, p.id, q.ownerId) && !canEnter(g, p.id, q.ownerId),
      )
      .sort((a, b) => a.troops * a.terrainDefenseBonus - b.troops * b.terrainDefenseBonus);
    const enemy = targets[0],
      candidates: PlayerOrder[] = [];
    if (province.unrest >= 65 || province.pacification < 65)
      candidates.push({ type: 'PACIFY', provinceId: province.id });
    if (p.botArchetype === 'Merchant' && province.development < 3)
      candidates.push({ type: 'DEVELOP', provinceId: province.id });
    if (p.botArchetype === 'Theocrat' && province.religion !== p.faith)
      candidates.push({ type: 'CONVERT', targetProvinceId: province.id });
    if (enemy) {
      const marchTroops = province.troops - 1,
        estimated = combatPowers(g, { ...province, troops: marchTroops, ownerId: p.id }, enemy);
      const threshold =
        p.botArchetype === 'Militarist' ? 1.03 : p.botArchetype === 'Diplomat' ? 1.35 : 1.15;
      if (marchTroops >= Math.max(3, enemy.fortLevel * 3) && estimated.ratio >= threshold)
        candidates.push({
          type: 'MOVE_ATTACK',
          fromProvinceId: province.id,
          toProvinceId: enemy.id,
          troops: marchTroops,
        });
    }
    if (p.botArchetype === 'Theocrat')
      for (const foreign of targets.filter((q) => q.religion !== p.faith))
        candidates.push({ type: 'CONVERT', targetProvinceId: foreign.id });
    if (p.botArchetype === 'Diplomat' && (province.pacification < 95 || province.unrest > 10))
      candidates.push({ type: 'PACIFY', provinceId: province.id });
    if (
      province.troops <
        Math.min(supplyLimit(province) - 1, p.botArchetype === 'Militarist' ? 11 : 8) &&
      realmEconomy(g, p.id).net > -4
    )
      candidates.push({ type: 'RECRUIT', provinceId: province.id, amount: 3 });
    if (province.training < 1.5) candidates.push({ type: 'TRAIN', provinceId: province.id });
    if (province.development < 3) candidates.push({ type: 'DEVELOP', provinceId: province.id });
    if (province.fortLevel < 1 && p.botArchetype === 'Diplomat')
      candidates.push({ type: 'BUILD_FORT', provinceId: province.id });
    for (const o of candidates) if (tryOrder(g, p, o)) break;
  }
  p.ready = true;
}
export function allReady(g: GameState) {
  return g.players.every((p) => p.bot || p.ready || !g.provinces.some((q) => q.ownerId === p.id));
}
export function executeCommand(
  input: GameState,
  actorId: string,
  command: GameCommand,
  now = 0,
): GameState {
  const g = structuredClone(input),
    actor = playerOf(g, actorId);
  const host = () => assert(g.hostId === actorId, 'Somente o anfitrião pode executar esta ação.');
  switch (command.type) {
    case 'SUBMIT_ORDER':
      submitOrder(g, actorId, command.order);
      break;
    case 'CANCEL_ORDER':
      cancelOrder(g, actorId, command.key);
      break;
    case 'READY':
      assert(g.phase === 'planning', 'A campanha não está em andamento.');
      actor.ready = command.ready === true;
      if (allReady(g)) resolveTurn(g, now);
      break;
    case 'ANSWER_OFFER':
      answerAlliance(g, actorId, command.offerId, command.accept === true);
      break;
    case 'START_GAME':
      host();
      startGame(g, now);
      break;
    case 'SET_MODE':
      host();
      setMode(g, command.mode);
      break;
    case 'SET_IDENTITY':
      assert(g.phase === 'lobby', 'Escolha seu legado antes da campanha.');
      assert(Object.hasOwn(OBJECTIVES, command.objective), 'Legado inválido.');
      assert(
        command.doctrine === 'devout' || command.doctrine === 'tolerant',
        'Política inválida.',
      );
      actor.objective = command.objective;
      actor.doctrine = command.doctrine;
      actor.botArchetype = ARCHETYPES[OBJECTIVE_IDS.indexOf(command.objective)];
      break;
    case 'ADD_BOT':
      host();
      addPlayer(
        g,
        `Conselho de ${FACTIONS[g.players.length]?.nation ?? 'reserva'}`,
        true,
        OBJECTIVE_IDS[g.players.length % 4],
      );
      break;
    case 'REPLACE_WITH_BOT': {
      host();
      const target = playerOf(g, command.playerId);
      assert(
        !target.online && !target.bot,
        'Somente jogadores desconectados podem ser substituídos.',
      );
      target.bot = true;
      target.ready = true;
      if (g.phase === 'planning' && allReady(g)) resolveTurn(g, now);
      break;
    }
    case 'CHAT':
      assert(
        typeof command.text === 'string' &&
          command.text.trim().length > 0 &&
          command.text.length <= 280,
        'Escreva uma mensagem de até 280 caracteres.',
      );
      g.chat.push({
        id: (g.chat.at(-1)?.id ?? 0) + 1,
        playerId: actorId,
        text: command.text.trim(),
      });
      g.chat = g.chat.slice(-60);
      break;
    default:
      throw new Error('Comando desconhecido.');
  }
  refreshScores(g);
  return g;
}
export function viewFor(g: GameState, id: string): GameView {
  const { orders, seed: _seed, nextId: _nextId, pendingDiplomacy: _pending, ...publicState } = g;
  const state = structuredClone(publicState);
  const redact = (report: TurnResolutionReport) => {
    for (const change of report.diplomaticChanges)
      if (change.covert && change.actorId !== id) change.actorId = null;
  };
  if (state.lastReport) redact(state.lastReport);
  state.reports.forEach(redact);
  return {
    ...state,
    myOrders: (orders[id] ?? []).map(legacyOrder).filter((o): o is Order => o !== null),
    plannedOrders: structuredClone(orders[id] ?? []),
  };
}
