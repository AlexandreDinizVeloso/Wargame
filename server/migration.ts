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
      marketLevel: p.development,
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
    'Campanha migrada para v0.4: tropas viraram batalhões, cidades mantiveram controle e tesouro. O tabuleiro legado foi preservado. Marchas antigas foram canceladas; relatórios originais permanecem no backup v2.',
  );
  return g;
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
  g.version = 4;
  g.roomName = `Campanha ${g.code}`;
  g.isPublic = false;
  g.enableSecretObjectives = false;
  g.maxTurns = 0;
  g.matchConfig = {
    ...g.matchConfig,
    maxTurns: 0,
    createdVersion: '0.4.0',
    enableSecretObjectives: false,
  };
  g.season = (['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const)[(g.turn - 1) % 4];
  g.globalEvent = null;
  g.coalitions = [];
  g.visionContracts = [];
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
    'Campanha migrada para v0.4: objetivos secretos desativados para preservar a partida iniciada.',
  );
  return g;
}
