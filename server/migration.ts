import { isLegacySeaShortcut, makeStaticMap } from '../shared/map';
import { seasonAt } from '../shared/world';
import { realmLimits } from '../shared/economy';
import {
  buildingSlots,
  buildingLevel,
  setBuildingLevel,
  buildingLimit,
} from '../shared/development';
import { objectiveCards } from '../shared/strategy';
import { recruitCommander } from './armies';
import type { GameState, Player, Province, ReligionId } from '../shared/types';
import { compositionOf, NATIONS } from '../shared/rules';
import { addPlayer, createGame } from './game';
import { createBattalion, log } from './state';
import { syncWars } from './diplomacy';
interface LegacyPlayer {
  id: string;
  name: string;
  nation: string;
  color: string;
  faith: string;
  bot: boolean;
  botArchetype: Player['botArchetype'];
  online: boolean;
  gold: number;
  manpower: number;
  influence: number;
  stability: number;
  warExhaustion: number;
  wonBattles: number;
  conversions: number;
  tradeEarned: number;
  ready: boolean;
}
interface LegacyProvince {
  id: string;
  name: string;
  ownerId: string | null;
  troops: number;
  mercenaries: number;
  morale: number;
  training: number;
  religion: string;
  pacification: number;
  unrest: number;
  fortLevel: number;
  development: number;
  capital: boolean;
  conversion: number;
  neighbors: string[];
  polygon: string;
  x: number;
  y: number;
  terrain: Province['terrain'];
  terrainDefenseBonus: number;
  baseTax: number;
  baseSupplyLimit: number;
  resource: Province['resource'];
}
interface LegacyArmy {
  id: string;
  ownerId: string | null;
  provinceId: string;
  troops: number;
  mercenaries: number;
  morale: number;
  training: number;
  stranded: boolean;
}
interface LegacyGame {
  version: 2;
  winnerId?: string | null;
  winnerObjective?: string | null;
  code: string;
  hostId: string;
  phase: GameState['phase'];
  mode: GameState['mode'];
  demo: boolean;
  seed: number;
  turn: number;
  maxTurns: number;
  players: LegacyPlayer[];
  provinces: LegacyProvince[];
  relations: GameState['relations'];
  log: GameState['log'];
  chat: GameState['chat'];
  orders: Record<
    string,
    {
      type: string;
      provinceId?: string;
      targetProvinceId?: string;
      amount?: number;
      fromProvinceId?: string;
      toProvinceId?: string;
      troops?: number;
    }[]
  >;
  stationedArmies: LegacyArmy[];
  displacedArmies: LegacyArmy[];
}
const faith = (r: string): ReligionId =>
  r === 'Protestantismo'
    ? 'REFORMED'
    : r === 'Ortodoxia'
      ? 'ANCESTRAL'
      : r === 'Anglicanismo'
        ? 'MERCHANT'
        : 'SOLAR';
export function migrateV2(value: unknown): GameState {
  const old = value as LegacyGame;
  if (old.version !== 2 || !Array.isArray(old.players) || !Array.isArray(old.provinces))
    throw new Error('Campanha v2 inválida.');
  const g = createGame(old.code, old.mode, old.demo, old.seed);
  g.isPublic = false;
  g.enableSecretObjectives = false;
  g.matchConfig.enableSecretObjectives = false;
  g.matchConfig.mapId = 'legacy-v2-32-regions';
  old.players.forEach((p, i) => {
    const n = addPlayer(g, p.name, p.bot, NATIONS[i].id, p.botArchetype);
    Object.assign(n, {
      id: p.id,
      nation: p.nation,
      color: p.color,
      faith: faith(p.faith),
      gold: p.gold,
      manpower: p.manpower,
      influence: p.influence,
      stability: p.stability,
      warExhaustion: p.warExhaustion,
      wonBattles: p.wonBattles,
      conversions: p.conversions,
      tradeEarned: p.tradeEarned,
      online: p.online,
      ready: p.ready,
    });
  });
  g.hostId = old.hostId;
  g.phase = old.phase;
  if (old.phase === 'finished') {
    g.winnerId = old.winnerId ?? null;
    g.finishReason = 'legacy_finished';
    g.matchConfig.legacyResult = {
      winnerId: old.winnerId ?? null,
      objective: old.winnerObjective ?? null,
      version: '0.2.0',
    };
  }
  g.turn = old.turn;
  g.maxTurns = 0;
  g.matchConfig.maxTurns = 0;
  g.log = old.log ?? [];
  g.chat = old.chat ?? [];
  g.provinces = old.provinces.map((p) => {
    const rings = [p.polygon.split(' ').map((pair) => pair.split(',').map(Number))];
    return {
      id: p.id,
      name: p.name,
      kind: 'LAND',
      straitNeighbors: [],
      straitSeaIds: {},
      recruitedThisTurn: 0,
      recruitmentTurn: 0,
      neutralDevelopmentLevel: 0,
      neutralDevelopmentTurn: 0,
      coastalBombardment: null,
      continent: 'EUROPE',
      terrain: p.terrain,
      terrainDefenseBonus: p.terrainDefenseBonus,
      baseTax: p.baseTax,
      baseSupplyLimit: p.baseSupplyLimit,
      neighbors: [...p.neighbors],
      rings,
      path: rings.map((r) => `M${r.map((x) => x.join(',')).join('L')}Z`).join(''),
      x: p.x,
      y: p.y,
      isCoastal: p.terrain === 'coastal',
      resource: p.resource,
      strategicResource: null,
      razedTurn: null,
      ownerId: p.ownerId,
      occupierId: null,
      religion: faith(p.religion),
      pacification: p.pacification,
      unrest: p.unrest,
      fortLevel: p.fortLevel,
      portLevel: p.terrain === 'coastal' && p.capital ? 1 : 0,
      marketLevel: Math.min(2, p.development),
      barracksLevel: 0,
      foundryLevel: 0,
      templeLevel: 0,
      maxBuildingSlots: p.capital ? 3 : 2,
      siege: null,
      conversion: 0,
      conversionReligion: null,
      conversionInstigatorId: null,
      capitalOf: p.capital ? p.ownerId : null,
    };
  });
  const importArmy = (
    ownerId: string | null,
    provinceId: string,
    troops: number,
    mercenaries: number,
    morale: number,
    training: number,
    stranded = false,
    name?: string,
  ) => {
    for (const [amount, isMercenary] of [
      [troops - mercenaries, false],
      [mercenaries, true],
    ] as const) {
      if (amount <= 0) continue;
      const formation = createBattalion(
        g,
        ownerId ?? 'NEUTRAL',
        provinceId,
        compositionOf({ infantry: amount }),
        {
          morale,
          training,
          isMercenary,
          ...(name ? { name: isMercenary ? `${name} · mercenários` : name } : {}),
        },
      );
      formation.stranded = stranded;
    }
  };
  for (const p of old.provinces)
    importArmy(
      p.ownerId,
      p.id,
      p.troops,
      p.mercenaries,
      p.morale,
      p.training,
      false,
      `Guarda de ${p.name}`,
    );
  for (const a of [...(old.stationedArmies ?? []), ...(old.displacedArmies ?? [])])
    importArmy(a.ownerId, a.provinceId, a.troops, a.mercenaries, a.morale, a.training, a.stranded);
  g.relations = structuredClone(old.relations);
  for (const r of g.relations.filter((r) => r.atWar))
    g.wars.push({
      id: `war-${g.nextId++}`,
      name: 'Guerra importada da v0.2',
      attackerLeaderId: r.a,
      defenderLeaderId: r.b,
      attackerIds: [r.a],
      defenderIds: [r.b],
      casusBelli: 'CONQUEST',
      warScore: 0,
      battleScore: 0,
      blockadeScore: 0,
      startedTurn: g.turn,
      endedTurn: null,
      active: true,
      imperialBanAgainstId: null,
      peaceTerms: [],
    });
  syncWars(g);
  g.orders = Object.fromEntries(g.players.map((p) => [p.id, []]));
  for (const [id, orders] of Object.entries(old.orders ?? {}))
    for (const o of orders) {
      const army = g.battalions.find((a) => a.ownerId === id && a.provinceId === o.provinceId);
      if (o.type === 'TRAIN' && army)
        g.orders[id].push({ type: 'TRAIN_BATTALION', battalionId: army.id });
      if (o.type === 'PACIFY' && o.provinceId)
        g.orders[id].push({ type: 'PACIFY', provinceId: o.provinceId });
      if (o.type === 'BUILD_FORT' && o.provinceId)
        g.orders[id].push({ type: 'BUILD_FORT', provinceId: o.provinceId });
      if (o.type === 'DEVELOP' && o.provinceId)
        g.orders[id].push({ type: 'BUILD_MARKET', provinceId: o.provinceId });
      if (o.type === 'RECRUIT' && o.provinceId)
        g.orders[id].push({
          type: 'RECRUIT_BATTALION',
          provinceId: o.provinceId,
          infantry: o.amount ?? 3,
        });
      if (o.type === 'CONVERT' && o.targetProvinceId)
        g.orders[id].push({ type: 'CONVERT', targetProvinceId: o.targetProvinceId });
    }
  log(
    g,
    'Campanha migrada para v0.5: tropas viraram batalhões, cidades mantiveram controle e tesouro. O tabuleiro legado foi preservado. Marchas antigas foram canceladas; relatórios originais permanecem no backup v2.',
  );
  return finalizeV5(g);
}

export function migrateV3(value: unknown): GameState {
  const g = structuredClone(value) as GameState;
  if ((g as unknown as { version: number }).version !== 3) throw new Error('Campanha v3 inválida.');
  const legacy: Record<string, Player['nationId']> = {
    PORTUGAL: 'vespera',
    CASTILE: 'sol_invicto',
    FRANCE: 'kaldor',
    AUSTRIA: 'aurelia',
    OTTOMANS: 'ferro_norte',
    MING: 'sapiencia',
    JAPAN: 'veridia',
    INCA: 'turan',
  };
  const upgradePlayer = (p: Player) => {
    p.nationId = legacy[p.nationId] ?? p.nationId;
    const n = NATIONS.find((n) => n.id === p.nationId);
    if (!n) throw new Error('Nação legada desconhecida.');
    p.nation = n.name;
    p.color = n.color;
    p.aggressiveExpansion = 0;
    p.fervor = 0;
    p.secretObjectives = [];
    p.selectedObjectiveId = null;
    p.objectiveStreak = 0;
    p.originalCapitalId = g.provinces.find((q) => q.capitalOf === p.id)?.id ?? null;
  };
  g.players.forEach(upgradePlayer);
  g.history.forEach((h) => {
    h.nations.forEach(upgradePlayer);
    h.world = {
      season: (['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const)[(h.turn - 1) % 4],
      event: null,
      coalitions: [],
    };
  });
  for (const r of [...g.reports, ...(g.lastReport ? [g.lastReport] : [])])
    r.world = {
      season: (['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const)[(r.turn - 1) % 4],
      event: null,
      coalitions: [],
    };
  g.offers = g.offers.filter(
    (o) => !o.terms?.some((t) => t.type === 'FORCE_EMPIRE_OR_RELIGION' && t.choice === 'EMPIRE'),
  );
  if (g.phase === 'finished') {
    g.matchConfig.legacyResult = {
      winnerId: g.winnerId,
      objective: g.winnerObjective,
      version: '0.3.0',
    };
    g.finishReason = 'legacy_finished';
  }
  Object.assign(g, { version: 4 });
  g.roomName = `Campanha ${g.code}`;
  g.isPublic = false;
  g.enableSecretObjectives = false;
  g.maxTurns = 0;
  g.matchConfig = {
    ...g.matchConfig,
    maxTurns: 0,
    createdVersion: '0.7.0',
    allowBotSecretVictory: false,
    enableSecretObjectives: false,
  };
  g.season = seasonAt(g.turn);
  g.globalEvent = null;
  g.coalitions = [];
  g.visionContracts = [];
  g.deadline = null;
  g.deadline = null;
  g.turnDeadlineAt = null;
  g.firstReadyPlayerName = null;
  for (const [i, p] of g.provinces.entries()) {
    p.strategicResource =
      p.kind === 'LAND'
        ? (['GRAIN', 'IRON', 'HORSES', 'GOLD_MINE', 'RELIC', null] as const)[i % 6]
        : null;
    p.razedTurn = null;
    if (p.strategicResource === 'GOLD_MINE') p.baseTax += 5;
  }
  for (const a of g.battalions) {
    a.movementCredit = 0;
    a.movementPoints = 1;
  }
  if ((g.winnerObjective as string) === 'IMPERIAL_PACIFICATION') {
    g.winnerObjective = null;
    g.finishReason = 'legacy_finished';
  }
  g.diet = {
    emperorId: null,
    imperialAuthority: 0,
    memberRealmIds: [],
    peaceTurnsCounter: 0,
    retaliationEdictActive: false,
    votes: {},
    bannedRealmIds: [],
  };
  log(
    g,
    'Campanha migrada para v0.5: objetivos secretos desativados para preservar a partida iniciada.',
  );
  return migrateV4(g);
}

export function migrateV4(value: unknown): GameState {
  const g = structuredClone(value) as GameState;
  if ((g as unknown as { version: number }).version !== 4) throw new Error('Campanha v4 inválida.');
  if (g.phase === 'finished' && !g.matchConfig.legacyResult) {
    g.matchConfig.legacyResult = {
      winnerId: g.winnerId,
      objective: g.winnerObjective,
      version: '0.4.0',
    };
    g.finishReason = 'legacy_finished';
  }
  return finalizeV5(g);
}
function finalizeV5(g: GameState): GameState {
  g.version = 7;
  g.commanders ??= [];
  g.matchConfig.createdVersion = '0.7.0';
  for (const p of g.players) {
    p.militaryXP ??= 0;
    p.unlockedSkills ??= [];
    p.paxStreak = 0;
    p.objectiveStreak = 0;
  }
  for (const p of g.provinces) {
    p.barracksLevel ??= 0;
    p.foundryLevel ??= 0;
    p.templeLevel ??= 0;
    p.siege = null;
    p.maxBuildingSlots = buildingSlots(p);
    const owner = g.players.find((q) => q.id === p.ownerId);
    let used = 0;
    for (const b of ['FORT', 'PORT', 'MARKET', 'BARRACKS', 'FOUNDRY', 'TEMPLE'] as const) {
      const n = buildingLevel(p, b);
      if (n <= 0) continue;
      setBuildingLevel(p, b, used < p.maxBuildingSlots ? Math.min(n, buildingLimit(b, owner)) : 0);
      used++;
    }
  }
  for (const a of g.battalions) {
    a.autoMerge ??= false;
    a.infantryPower ??= 1;
    a.artilleryPower ??= 1;
    a.movementCredit ??= 0;
    a.movementPoints ??= 1;
    const p = g.provinces.find((p) => p.id === a.provinceId);
    if (!a.isFleet && p?.kind === 'SEA_ZONE') {
      const fleet = g.battalions.find(
        (f) =>
          f.isFleet &&
          f.ownerId === a.ownerId &&
          f.provinceId === a.provinceId &&
          (f.id === a.embarkedOnId || f.embarkedArmyId === a.id),
      );
      if (fleet && fleet.transports * 4 >= a.infantry + a.cavalry + a.artillery) {
        a.embarkedOnId = fleet.id;
        fleet.embarkedArmyId = a.id;
      } else {
        delete a.embarkedOnId;
        const safe =
          g.provinces.find((q) => q.kind === 'LAND' && q.ownerId === a.ownerId) ??
          g.provinces.find((q) => q.kind === 'LAND');
        if (safe) a.provinceId = safe.id;
        a.pathQueue = [];
        a.stranded = safe?.ownerId !== a.ownerId;
      }
    }
  }
  for (const p of g.players) {
    if (g.enableSecretObjectives && g.players.length >= 3) {
      const selected = p.secretObjectives.find((c) => c.id === p.selectedObjectiveId)?.kind;
      p.secretObjectives = objectiveCards(g, p);
      p.selectedObjectiveId =
        p.secretObjectives.find((c) => c.kind === selected)?.id ??
        (p.bot ? (p.secretObjectives[0]?.id ?? null) : null);
    }
    if (!g.commanders.some((c) => c.ownerId === p.id)) {
      const a = g.battalions.find((a) => a.ownerId === p.id && !a.isFleet);
      if (a)
        recruitCommander(g, p.id, false, 'IRON_WALL', undefined, true).assignedBattalionId = a.id;
    }
  }
  for (const r of [...g.history, ...g.reports, ...(g.lastReport ? [g.lastReport] : [])]) {
    r.sieges ??= [];
    for (const e of r.economy) {
      e.industry ??= 0;
      e.administration ??= 0;
      e.buildingUpkeep ??= 0;
      e.plunder ??= 0;
    }
  }
  for (const h of g.history)
    for (const p of h.nations) {
      p.militaryXP ??= 0;
      p.unlockedSkills ??= [];
      p.paxStreak ??= 0;
    }
  g.orders = Object.fromEntries(
    g.players.map((p) => [
      p.id,
      (g.orders[p.id] ?? []).filter(
        (o) =>
          !['MERGE_BATTALIONS', 'SPLIT_BATTALION', 'MERGE_ALL', 'MOVE_BATTALION'].includes(o.type),
      ),
    ]),
  );
  for (const p of g.players) p.ready = false;
  for (const a of g.battalions) a.pathQueue = [];
  g.deadline = null;
  g.turnDeadlineAt = null;
  g.firstReadyPlayerName = null;
  log(
    g,
    'Campanha migrada para v0.5: cidades ajustadas aos slots, ordens antigas reabertas e objetivos reescalados.',
  );
  return finalizeV6(g);
}

export function migrateV5(value: unknown): GameState {
  const g = structuredClone(value) as GameState;
  if ((g as unknown as { version: number }).version !== 5) throw new Error('Campanha v5 inválida.');
  if (g.phase === 'finished' && !g.matchConfig.legacyResult) {
    g.matchConfig.legacyResult = {
      winnerId: g.winnerId,
      objective: g.winnerObjective,
      version: '0.5.0',
    };
    g.finishReason = 'legacy_finished';
  }
  return finalizeV6(g);
}
function finalizeV6(g: GameState): GameState {
  g.version = 7;
  g.baseUpkeep = 0.75;
  g.allowBotSecretVictory ??= false;
  g.sandboxContinued ??= false;
  g.graceUntilTurn ??= g.turn <= 2 ? 2 : 0;
  g.notifications ??= [];
  g.notificationReads ??= {};
  g.victoryRecord ??= g.winnerId
    ? { winnerId: g.winnerId, objective: g.winnerObjective, turn: g.turn }
    : null;
  g.matchConfig.createdVersion = '0.7.0';
  g.matchConfig.allowBotSecretVictory = g.allowBotSecretVictory;
  const map = makeStaticMap(g.mode, g.theater);
  for (const p of g.provinces) {
    const definition = map.find((q) => q.id === p.id);
    p.straitNeighbors =
      definition?.straitNeighbors.filter((id) => g.provinces.some((q) => q.id === id)) ?? [];
    p.straitSeaIds = Object.fromEntries(
      Object.entries(definition?.straitSeaIds ?? {}).filter(
        ([id, sea]) => p.straitNeighbors.includes(id) && g.provinces.some((q) => q.id === sea),
      ),
    );
    p.neighbors = [
      ...new Set([
        ...p.neighbors.filter((id) => !isLegacySeaShortcut(p.id, id)),
        ...p.straitNeighbors,
        ...(definition?.neighbors.filter((id) =>
          g.provinces.some((q) => q.id === id && q.kind === 'SEA_ZONE'),
        ) ?? []),
      ]),
    ];
    p.recruitedThisTurn ??= 0;
    p.recruitmentTurn ??= 0;
  }
  for (const p of g.provinces)
    for (const id of p.neighbors) {
      const q = g.provinces.find((q) => q.id === id);
      if (q && !q.neighbors.includes(p.id)) q.neighbors.push(p.id);
    }
  for (const a of g.battalions) a.encircled ??= false;
  for (const p of g.players) {
    p.emergencyLevyTurn ??= null;
    p.homelandDefenseUntil ??= 0;
    p.lostProvinceIds ??= [];
    p.objectiveStreak = 0;
    p.paxStreak = 0;
    const l = realmLimits(g, p.id);
    p.armyCap = l.armyCap;
    p.manpowerCap = l.manpowerCap;
    const kind = p.secretObjectives.find((c) => c.id === p.selectedObjectiveId)?.kind;
    if (g.enableSecretObjectives && g.players.length >= 3) {
      p.secretObjectives = objectiveCards(g, p);
      p.selectedObjectiveId =
        p.secretObjectives.find((c) => c.kind === kind)?.id ?? p.secretObjectives[0]?.id ?? null;
    }
  }
  for (const r of [...g.history, ...g.reports, ...(g.lastReport ? [g.lastReport] : [])]) {
    r.notifications ??= [];
    r.encirclements ??= [];
    r.desertions ??= [];
    for (const p of 'nations' in r ? (r.nations as Player[]) : []) {
      p.manpowerCap ??= 18;
      p.emergencyLevyTurn ??= null;
      p.homelandDefenseUntil ??= 0;
      p.lostProvinceIds ??= [];
    }
  }
  g.orders = Object.fromEntries(
    g.players.map((p) => [
      p.id,
      (g.orders[p.id] ?? []).filter(
        (o) =>
          !['RECRUIT_BATTALION', 'AUTO_TRANSPORT', 'NAVAL_BRIDGE', 'MOVE_BATTALION'].includes(
            o.type,
          ),
      ),
    ]),
  );
  for (const a of g.battalions) a.pathQueue = [];
  for (const p of g.players) p.ready = p.bot;
  g.deadline = null;
  g.turnDeadlineAt = null;
  g.firstReadyPlayerName = null;
  log(
    g,
    'Campanha migrada para v0.6: economia, limites e estreitos atualizados; planejamento reaberto.',
  );
  return finalizeV7(g);
}

export function migrateV6(value: unknown): GameState {
  const g = structuredClone(value) as GameState;
  if ((g as unknown as { version: number }).version !== 6) throw new Error('Campanha v6 inválida.');
  if (g.phase === 'finished' && !g.matchConfig.legacyResult)
    g.matchConfig.legacyResult = {
      winnerId: g.winnerId,
      objective: g.winnerObjective,
      version: '0.6.0',
    };
  return finalizeV7(g);
}
function finalizeV7(g: GameState): GameState {
  g.version = 7;
  g.matchConfig.createdVersion = '0.7.0';
  for (const a of g.battalions) a.disorganized ??= !a.isFleet && a.morale < 25;
  for (const p of g.provinces) {
    p.neutralDevelopmentLevel ??= 0;
    p.neutralDevelopmentTurn ??= g.turn;
    p.coastalBombardment ??= null;
  }
  for (const r of [...g.history, ...g.reports, ...(g.lastReport ? [g.lastReport] : [])]) {
    r.bombardments ??= [];
    r.neutralDevelopments ??= [];
    for (const e of r.economy) e.maritimeTrade ??= 0;
  }
  if (g.phase === 'planning') {
    for (const p of g.players) {
      g.orders[p.id] = (g.orders[p.id] ?? []).filter(
        (o) =>
          ![
            'MOVE_BATTALION',
            'AUTO_TRANSPORT',
            'NAVAL_BRIDGE',
            'EMBARK_BATTALION',
            'ASSAULT_SIEGE',
            'BOMBARD_COAST',
          ].includes(o.type),
      );
      p.ready = p.bot;
    }
    for (const a of g.battalions) a.pathQueue = [];
    g.turnDeadlineAt = null;
    g.deadline = null;
    g.firstReadyPlayerName = null;
    log(
      g,
      'Campanha migrada para v0.7: moral, cidades independentes e marinha atualizadas; ofensivas reabertas para planejamento.',
    );
  }
  return g;
}
