import { DOCK_EDGE_MARGIN, DOCK_BOTTOM_MARGIN, defaultDockGeometry } from '../shared/windowLayout';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import geometry from '../shared/world-geometry.json';
import { makeMap, WORLD_STARTS, THEATERS } from '../shared/map';
import { CONTINENT_BONUSES, continentBonuses } from '../shared/risk';
import { NATIONS, RELIGIONS, realmEconomy, compositionOf } from '../shared/rules';
import { getNationAuthority, realmLimits } from '../shared/economy';
import { BALANCE, ECONOMY_BALANCE } from '../shared/balance';
import { councilModifiers } from '../shared/councilEffects';
import { planMassRecruitment } from '../shared/massRecruitment';
import { AUDIO_MIXER_DEFAULTS, AUDIO_LIMITER } from '../shared/audioMixer';
import { AUDIO_SAMPLE_RATE, SFX_SPEC, MUSIC_SPEC } from '../shared/audioDSP';
import { SUPREME_COMMANDS } from '../shared/supreme';
import { DILEMMAS } from '../shared/dilemmas';
import { combatPowers } from '../shared/combat';
import { movementAllowance } from '../shared/military';
import { effectiveSupply } from '../shared/strategy';
import { SCENARIOS } from '../shared/scenarios';
import {
  addPlayer,
  createGame,
  executeCommand,
  resolveTurn,
  startGame,
  submitOrder,
} from '../server/game';
import { declareWar } from '../server/diplomacy';
import { issueDilemmas, chooseDilemma } from '../server/dilemmas';
import { createBattalion } from '../server/state';
import { attachRooms, ROOM_INACTIVITY_MS, ROOM_CLEANUP_INTERVAL_MS } from '../server/rooms';
import { writeSnapshot, readRoomArchive } from '../server/storage';
import { goldNumber, manpowerNumber } from '../src/resourceNumbers';

const EXPECTED = {
  SOUTH_AMERICA: ['brazil', 'rioplata', 'andes', 'colombia'],
  NORTH_AMERICA: [
    'alaska',
    'canada-west',
    'canada-east',
    'usa-west',
    'usa-east',
    'mexico',
    'central-america',
  ],
  EUROPE: [
    'castile',
    'france',
    'britain',
    'germany',
    'italy',
    'scandinavia',
    'poland',
    'balkans',
    'muscovy',
  ],
  MENA_AFRICA: [
    'maghreb',
    'nile',
    'west-africa',
    'central-africa',
    'east-africa',
    'south-africa',
    'anatolia',
    'arabia',
    'persia',
  ],
  ASIA: [
    'ural',
    'siberia',
    'central-asia',
    'afghan',
    'india-north',
    'india-south',
    'indochina',
    'china-west',
    'china-east',
    'mongolia',
    'korea',
    'japan',
    'archipelago',
  ],
} as const;
const SEAS = [
  'north-atlantic',
  'south-atlantic',
  'mediterranean',
  'north-sea',
  'indian-ocean',
  'arabian-sea',
  'south-china-sea',
  'north-pacific',
  'south-pacific',
  'arctic-ocean',
];
function fresh() {
  const g = createGame('ACC101', 'campaign', false, 101);
  addPlayer(g, 'Coroa', false, 'vespera');
  addPlayer(g, 'Rival', false, 'sol_invicto');
  addPlayer(g, 'Conselho', false, 'kaldor');
  startGame(g);
  g.graceUntilTurn = 0;
  g.battalions = [];
  g.commanders = [];
  for (const p of g.provinces) {
    p.ownerId = null;
    p.occupierId = null;
    p.capitalOf = null;
    p.siege = null;
    p.fortLevel = 0;
    p.marketLevel = 0;
    p.templeLevel = 0;
    p.strategicResource = null;
    p.pacification = 100;
    p.unrest = 0;
    p.maxBuildingSlots = 4;
  }
  for (const [i, id] of ['castile', 'france', 'japan'].entries()) {
    const p = g.provinces.find((p) => p.id === id)!;
    p.ownerId = g.players[i].id;
    p.capitalOf = g.players[i].id;
    p.religion = g.players[i].faith;
    g.players[i].originalCapitalId = id;
    g.players[i].ready = false;
    g.players[i].influence = 0;
    g.players[i].prestige = 0;
    g.players[i].militaryXP = 1000;
    g.players[i].gold = 500;
  }
  return g;
}
function execute(g: ReturnType<typeof fresh>, command: Parameters<typeof executeCommand>[2]) {
  return executeCommand(g, g.players[0].id, command);
}
function wave(filename: string) {
  const b = readFileSync(new URL(`../public/assets/${filename}`, import.meta.url));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  assert.equal(b.readUInt16LE(20), 1);
  assert.equal(b.readUInt16LE(22), 1);
  assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.readUInt32LE(24), 44100);
  assert.equal(b.readUInt32LE(40), b.length - 44);
  let peak = 0;
  for (let i = 44; i < b.length; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)) / 32768);
  return {
    peak,
    duration: (b.length - 44) / (2 * 44100),
    first: b.readInt16LE(44),
    last: b.readInt16LE(b.length - 2),
  };
}
test('v101 acceptance: exatamente 42 macroterritórios, 10 mares e cinco continentes sem IDs órfãos', () => {
  const map = makeMap();
  assert.equal(geometry.length, 42);
  assert.equal(map.length, 52);
  assert.equal(map.filter((p) => p.kind === 'LAND').length, 42);
  assert.deepEqual(
    map
      .filter((p) => p.kind === 'SEA_ZONE')
      .map((p) => p.id)
      .sort(),
    [...SEAS].sort(),
  );
  for (const [continent, ids] of Object.entries(EXPECTED))
    assert.deepEqual(
      geometry
        .filter((p) => p.continent === continent)
        .map((p) => p.id)
        .sort(),
      [...ids].sort(),
    );
  assert.equal(new Set(geometry.map((p) => p.continent)).size, 5);
  assert.equal(geometry.filter((p) => p.id === 'brazil').length, 1);
  assert.ok(
    !geometry.some((p) =>
      ['brazil-north', 'sao-paulo', 'aquitaine', 'burgundy', 'portugal'].includes(p.id),
    ),
  );
  for (const p of map) {
    for (const neighbor of p.neighbors) {
      const q = map.find((q) => q.id === neighbor);
      assert.ok(q, `${p.id}: ${neighbor}`);
      assert.ok(q.neighbors.includes(p.id));
      if (p.kind === 'LAND' && q.kind === 'LAND')
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 48, `${p.id}/${q.id}`);
    }
    assert.ok(p.rings.every((r) => r.length >= 4 && r.every((v) => v.every(Number.isFinite))));
  }
  for (const nation of NATIONS) assert.ok(map.some((p) => p.id === nation.homeProvinceId));
  for (const religion of Object.values(RELIGIONS))
    assert.ok(map.some((p) => p.id === religion.holyCityId));
  for (const starts of Object.values(WORLD_STARTS))
    for (const id of starts) assert.ok(map.some((p) => p.id === id));
  assert.equal(SCENARIOS.length, 5);
});
test('v101 acceptance: três teatros suportam oito participantes mesmo com menos de 16 terras', () => {
  for (const theater of THEATERS) {
    const g = createGame('QUICK1', 'quick', false, 101, theater);
    for (const nation of NATIONS) addPlayer(g, nation.name, true, nation.id);
    startGame(g);
    assert.equal(g.players.length, 8);
    assert.equal(g.provinces.filter((p) => p.ownerId).length, 8);
    assert.ok(g.players.every((player) => g.provinces.some((p) => p.capitalOf === player.id)));
  }
});
test('v101 acceptance: recompensas continentais exatas e previsões usam a mesma regra do servidor', () => {
  const rewards = {
    SOUTH_AMERICA: [3, 0.5, 0],
    NORTH_AMERICA: [5, 1, 0],
    EUROPE: [7, 1.5, 1],
    MENA_AFRICA: [6, 1, 0],
    ASIA: [10, 2, 2],
  };
  for (const [key, expected] of Object.entries(rewards)) {
    const g = fresh(),
      a = g.players[0],
      ids = CONTINENT_BONUSES[key as keyof typeof CONTINENT_BONUSES].provinceIds;
    for (const p of g.provinces) p.ownerId = ids.includes(p.id) ? a.id : null;
    const bonus = continentBonuses(g, a.id);
    assert.deepEqual([bonus.gold, bonus.manpower, bonus.authority], expected);
    const economy = realmEconomy(g, a.id);
    assert.deepEqual(
      [economy.continentGold, economy.continentManpower, economy.continentAuthority],
      expected,
    );
    assert.equal(economy.manpower, realmLimits(g, a.id).manpowerGain);
    const missing = g.provinces.find((p) => p.id === ids[0])!;
    missing.occupierId = g.players[1].id;
    assert.deepEqual(
      [
        continentBonuses(g, a.id).gold,
        continentBonuses(g, a.id).manpower,
        continentBonuses(g, a.id).authority,
      ],
      [0, 0, 0],
    );
  }
  const g = fresh(),
    a = g.players[0];
  for (const p of g.provinces.filter((p) => p.continent === 'EUROPE')) p.ownerId = a.id;
  g.provinces.find((p) => p.id === 'mexico')!.ownerId = g.players[1].id;
  a.influence = 0;
  const before = getNationAuthority(a),
    gold = a.gold,
    forecast = realmEconomy(g, a.id);
  resolveTurn(g);
  assert.equal(getNationAuthority(a), before + ECONOMY_BALANCE.authorityPerTurn + 1);
  assert.ok(Math.abs(a.gold - (gold + forecast.net)) < 0.02);
});
test('v101 acceptance: picos PCM, filtros, duração musical e seis padrões do mixer são obrigatórios', () => {
  assert.equal(AUDIO_SAMPLE_RATE, 44100);
  const peaks = { sail: 0.12, march: 0.14, cannon: 0.24, horn: 0.2, coin: 0.2 };
  for (const [name, target] of Object.entries(peaks)) {
    const data = wave(`sfx/${name}.wav`),
      spec = SFX_SPEC[name as keyof typeof SFX_SPEC];
    assert.equal(spec.targetPeak, target);
    assert.ok(data.peak <= target, `${name}: ${data.peak}`);
    assert.ok(data.peak >= target - 2 / 32768);
    assert.ok(data.peak <= 0.25);
  }
  assert.ok(SFX_SPEC.sail.cutoff <= 450);
  assert.equal(SFX_SPEC.sail.cutoff, 320);
  assert.equal(SFX_SPEC.march.cutoff, 260);
  assert.equal(SFX_SPEC.cannon.cutoff, 500);
  assert.equal(MUSIC_SPEC.duration, 16);
  assert.equal(MUSIC_SPEC.targetPeak, 0.55);
  for (const name of ['bgm-peace', 'bgm-war']) {
    const data = wave(`music/${name}.wav`);
    assert.equal(data.duration, 16);
    assert.ok(data.peak >= 0.55 - 2 / 32768 && data.peak <= 0.55);
    assert.ok(Math.abs(data.first - data.last) <= 1);
  }
  assert.deepEqual(AUDIO_MIXER_DEFAULTS, {
    masterVolume: 0.8,
    musicVolume: 0.75,
    combatVolume: 0.45,
    marchVolume: 0.3,
    sailVolume: 0.25,
    uiVolume: 0.5,
  });
  assert.deepEqual(AUDIO_LIMITER, { threshold: -10, knee: 12, ratio: 8 });
});
test('v101 acceptance: cinco comandos repetíveis têm custos e efeitos exatos, com rejeição atômica', () => {
  assert.deepEqual(
    SUPREME_COMMANDS.map((c) => [c.id, c.cost]),
    [
      ['BLITZ_MARCH', 35],
      ['WAR_BONDS', 30],
      ['ELITE_GUARD', 50],
      ['SIEGE_BREAKER', 45],
      ['SABOTAGE_SUPPLY', 40],
    ],
  );
  let g = fresh();
  let next = execute(g, { type: 'EXECUTE_SUPREME_COMMAND', command: 'WAR_BONDS' });
  assert.equal(next.players[0].gold, g.players[0].gold + 120);
  assert.equal(getNationAuthority(next.players[0]), getNationAuthority(g.players[0]) - 30);
  next = execute(next, { type: 'EXECUTE_SUPREME_COMMAND', command: 'WAR_BONDS' });
  assert.equal(next.players[0].gold, g.players[0].gold + 240);
  const manpower = next.players[0].manpower;
  next = execute(next, {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'ELITE_GUARD',
    provinceId: 'castile',
  });
  const elite = next.battalions.find((a) => a.name === 'Guarda Imperial')!;
  assert.deepEqual(
    [elite.infantry, elite.cavalry, elite.artillery, elite.morale, elite.training],
    [4, 2, 0, 100, 1.3],
  );
  assert.equal(next.players[0].manpower, manpower);
  elite.morale = 40;
  elite.disorganized = true;
  const pool = getNationAuthority(next.players[0]);
  next = execute(next, {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'BLITZ_MARCH',
    battalionId: elite.id,
  });
  const blitz = next.battalions.find((a) => a.id === elite.id)!;
  assert.equal(blitz.morale, 65);
  assert.equal(blitz.disorganized, false);
  assert.ok(movementAllowance(next, blitz) >= 2);
  assert.equal(getNationAuthority(next.players[0]), pool - 35);
  g = fresh();
  declareWar(g, g.players[0].id, g.players[1].id, 'CONQUEST');
  const own = createBattalion(g, g.players[0].id, 'castile', compositionOf({ infantry: 10 }), {
    morale: 100,
  });
  const enemy = createBattalion(g, g.players[1].id, 'france', compositionOf({ infantry: 10 }), {
    morale: 100,
  });
  next = execute(g, {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'SABOTAGE_SUPPLY',
    battalionId: enemy.id,
  });
  const victim = next.battalions.find((a) => a.id === enemy.id)!;
  assert.equal(victim.morale, 60);
  assert.equal(victim.supplySabotagedUntilTurn, g.turn);
  assert.equal(
    effectiveSupply(
      next,
      g.players[1].id,
      next.provinces.find((p) => p.id === 'france')!,
      victim,
    ),
    0,
  );
  assert.equal(getNationAuthority(next.players[0]), getNationAuthority(g.players[0]) - 40);
  g.battalions = g.battalions.filter((a) => a.id !== enemy.id);
  const target = g.provinces.find((p) => p.id === 'france')!;
  target.fortLevel = 1;
  next = execute(g, {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'SIEGE_BREAKER',
    provinceId: target.id,
  });
  assert.equal(next.provinces.find((p) => p.id === target.id)!.fortLevel, 0);
  assert.equal(next.provinces.find((p) => p.id === target.id)!.occupierId, g.players[0].id);
  assert.equal(getNationAuthority(next.players[0]), getNationAuthority(g.players[0]) - 45);
  const before = structuredClone(g);
  assert.throws(() =>
    execute(g, {
      type: 'EXECUTE_SUPREME_COMMAND',
      command: 'SABOTAGE_SUPPLY',
      battalionId: own.id,
    }),
  );
  assert.deepEqual(g, before);
  next.players[0].militaryXP = 0;
  next.players[0].influence = 0;
  next.players[0].prestige = 0;
  assert.throws(() => execute(next, { type: 'EXECUTE_SUPREME_COMMAND', command: 'WAR_BONDS' }));
});
test('v101 acceptance: Marcha Forçada percorre duas fronteiras e remove rio/terreno no combate', () => {
  let g = fresh();
  const a = g.players[0];
  for (const id of ['france', 'germany']) {
    const p = g.provinces.find((p) => p.id === id)!;
    p.ownerId = a.id;
    p.terrain = 'forest';
    p.fortLevel = 0;
  }
  g.provinces.find((p) => p.id === 'mexico')!.ownerId = g.players[1].id;
  const unit = createBattalion(g, a.id, 'castile', compositionOf({ infantry: 8 }), { morale: 100 });
  const target = g.provinces.find((p) => p.id === 'germany')!;
  target.terrainDefenseBonus = 1.35;
  const defender = createBattalion(g, g.players[1].id, target.id, compositionOf({ infantry: 8 }), {
    morale: 100,
  });
  unit.provinceId = 'france';
  const before = combatPowers(g, [unit], [defender], target);
  g = execute(g, { type: 'EXECUTE_SUPREME_COMMAND', command: 'BLITZ_MARCH', battalionId: unit.id });
  const army = g.battalions.find((b) => b.id === unit.id)!;
  const after = combatPowers(
    g,
    [army],
    [g.battalions.find((b) => b.id === defender.id)!],
    g.provinces.find((p) => p.id === target.id)!,
  );
  assert.equal(after.riverCrossingModifier, 1);
  assert.ok(after.attackPower > before.attackPower);
  assert.ok(after.defensePower < before.defensePower);
  g.battalions = g.battalions.filter((b) => b.id !== defender.id);
  army.provinceId = 'castile';
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: army.id,
    path: ['france', 'germany'],
  });
  resolveTurn(g);
  assert.equal(army.provinceId, 'germany');
});
test('v101 acceptance: Conselho mistura crises, táticas e políticas com custos e efeitos temporários', () => {
  assert.equal(DILEMMAS.length, 10);
  assert.ok(DILEMMAS.every((d) => d.options.length === 2));
  assert.deepEqual([...new Set(DILEMMAS.map((d) => d.category))].sort(), [
    'CRISIS',
    'POLICY',
    'TACTICAL',
  ]);
  assert.equal(new Set(DILEMMAS.flatMap((d) => d.options.map((o) => o.effect))).size, 20);
  const g = fresh(),
    a = g.players[0];
  g.turn = 4;
  issueDilemmas(g);
  assert.ok(a.activeDilemma);
  a.activeDilemma = { id: 'military-council', turn: 4, targetProvinceId: 'castile' };
  const company = createBattalion(g, a.id, 'castile', compositionOf({ infantry: 4 }), {
    morale: 60,
  });
  const target = g.provinces.find((p) => p.id === 'france')!;
  const before = {
    authority: getNationAuthority(a),
    upkeep: realmEconomy(g, a.id).upkeep,
    power: combatPowers(g, [company], [], target).attackPower,
  };
  chooseDilemma(g, a.id, 1);
  assert.equal(getNationAuthority(a), before.authority - 10);
  assert.equal(councilModifiers(a, 4).moraleBonus, 20);
  assert.equal(councilModifiers(a, 6).upkeepMultiplier, 1.35);
  assert.equal(councilModifiers(a, 7).moraleBonus, 0);
  assert.ok(realmEconomy(g, a.id).upkeep > before.upkeep);
  assert.ok(combatPowers(g, [company], [], target).attackPower > before.power);
  assert.throws(() => chooseDilemma(g, a.id, 1));
  for (const definition of DILEMMAS) {
    const poor = fresh(),
      player = poor.players[0];
    poor.turn = 4;
    player.gold = player.manpower = player.influence = player.prestige = player.militaryXP = 0;
    player.activeDilemma = { id: definition.id, turn: 4, targetProvinceId: 'castile' };
    assert.doesNotThrow(() => chooseDilemma(poor, player.id, 0));
    assert.ok(player.gold >= 0 && player.manpower >= 0 && getNationAuthority(player) >= 0);
  }
});
test('v101 acceptance: abertura escassa e recrutamento em massa preservam recursos e ordens', () => {
  assert.equal(
    manpowerNumber(0.95),
    '0,95',
    'a interface não promete um recruta inteiro inexistente',
  );
  assert.equal(goldNumber(6.8), '6,8');
  const opening = createGame('SCARCE', 'campaign', false, 101);
  for (const nation of NATIONS.slice(0, 3)) addPlayer(opening, nation.name, false, nation.id);
  startGame(opening);
  for (const player of opening.players) {
    assert.equal(player.gold, BALANCE.initialGold);
    assert.equal(player.manpower, BALANCE.initialManpower);
    assert.equal(getNationAuthority(player), BALANCE.initialAuthority);
    assert.ok(realmEconomy(opening, player.id).net >= BALANCE.openingNetMin);
    assert.ok(realmEconomy(opening, player.id).net <= BALANCE.openingNetMax);
  }
  const g = fresh(),
    player = g.players[0];
  g.provinces.find((p) => p.id === 'germany')!.ownerId = player.id;
  for (const p of g.provinces) p.barracksLevel = p.foundryLevel = 0;
  player.manpower = 3;
  const requested = { infantry: 6, cavalry: 0, artillery: 0 };
  const preview = planMassRecruitment(g, player.id, requested);
  assert.equal(preview.allocated.infantry, 3);
  assert.equal(preview.unfilled.infantry, 3);
  assert.equal(preview.byProvince.length, 2);
  const result = executeCommand(g, player.id, { type: 'MASS_RECRUIT', composition: requested });
  assert.deepEqual(result.orders[player.id], preview.orders);
  assert.equal(result.players[0].gold, player.gold);
  assert.equal(result.players[0].manpower, 3);
  assert.equal(g.orders[player.id].length, 0, 'command works on a clone');
});
test('v101 acceptance: arquiva aos900000ms e mantém save completo sem abrir sockets durante build', () => {
  assert.equal(ROOM_INACTIVITY_MS, 15 * 60 * 1000);
  assert.equal(ROOM_CLEANUP_INTERVAL_MS, 60000);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-acceptance-')),
    filename = path.join(directory, 'rooms.json'),
    token = 'acceptance-private-token';
  let now = 1000;
  const game = createGame('ACC101', 'campaign');
  const host = addPlayer(game, 'Host');
  game.isPublic = true;
  writeSnapshot(
    filename,
    [
      {
        game,
        sessions: [
          { playerId: host.id, tokenHash: createHash('sha256').update(token).digest('hex') },
        ],
        touched: now,
        lastHumanActivityAt: now,
        remainingMs: 60000,
      },
    ],
    now,
  );
  const server = http.createServer(),
    service = attachRooms(server, { stateFile: filename, now: () => now, tickMs: 1000000 });
  try {
    now += 899999;
    assert.equal(service.listPublicRooms().length, 1);
    assert.equal(service.rooms.size, 1);
    now++;
    assert.equal(service.cleanupInactiveRooms(), 1);
    assert.equal(service.rooms.size, 0);
    assert.equal(service.listPublicRooms().length, 0);
    const archived = path.join(directory, 'archived-rooms', 'ACC101.json');
    assert.ok(existsSync(archived));
    const saved = readRoomArchive(archived)!;
    assert.equal(saved.game.code, game.code);
    assert.equal(saved.sessions[0].playerId, host.id);
    const download = service.downloadSave(game.code, host.id, token);
    assert.equal(download.game.provinces.length, 52);
    assert.equal(download.format, 'CONCORDIA_SAVE_098');
    assert.equal('sessions' in download, false);
    assert.throws(() => service.downloadSave(game.code));
  } finally {
    service.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('v101 acceptance: inspetor e painel de ordens têm âncoras independentes a16px e56px', () => {
  assert.equal(DOCK_EDGE_MARGIN, 16);
  assert.equal(DOCK_BOTTOM_MARGIN, 56);
  const viewport = { width: 1440, height: 960 };
  const left = defaultDockGeometry(viewport, 480, 540, 'left'),
    right = defaultDockGeometry(viewport, 640, 440, 'right');
  assert.equal(left.x, 16);
  assert.equal(viewport.width - right.x - right.width, 16);
  assert.equal(viewport.height - left.y - left.height, 56);
  assert.equal(viewport.height - right.y - right.height, 56);
  assert.equal(left.minimized, false);
  assert.equal(right.minimized, false);
  const moved = { ...left, x: 80, width: 520 };
  assert.equal(right.x, 784);
  assert.equal(right.width, 640);
  assert.notDeepEqual(moved, left);
});

test('v101 acceptance: os anéis serializados não têm cruzamentos próprios', () => {
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const province of geometry)
    for (const ring of province.rings) {
      assert.deepEqual(ring[0], ring.at(-1));
      for (let i = 0; i < ring.length - 1; i++)
        for (let j = i + 2; j < ring.length - 1; j++) {
          if (i === 0 && j === ring.length - 2) continue;
          const a = ring[i],
            b = ring[i + 1],
            c = ring[j],
            d = ring[j + 1];
          const ac = cross(a, b, c),
            ad = cross(a, b, d),
            ca = cross(c, d, a),
            cb = cross(c, d, b);
          assert.ok(!(ac * ad < -1e-14 && ca * cb < -1e-14), `${province.id}: arestas ${i}/${j}`);
        }
    }
});
