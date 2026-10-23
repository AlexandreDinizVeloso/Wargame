import { realmEconomy } from '../shared/rules';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { makeMap, WORLD_RIVERS, hasRiverCrossing, impassableFeatures } from '../shared/map';
import { combatPowers } from '../shared/combat';
import { getNationAuthority, logisticsPosture } from '../shared/economy';
import { DILEMMAS, dilemmaFor } from '../shared/dilemmas';
import { activeCouncilEffects, councilModifiers } from '../shared/councilEffects';
import { emptyTurnReport, type ClientMessage, type ServerMessage } from '../shared/types';
import { executeCommand, planBot, submitOrder, viewFor } from '../server/game';
import { declareWar } from '../server/diplomacy';
import { issueDilemmas, chooseDilemma, resolveUnansweredDilemmas } from '../server/dilemmas';
import { computeProvinceThreat, canLeaveDefendedProvince } from '../server/botAI';
import { applyAfkRegency, restoreRegency, replaceableBot } from '../server/regency';
import { attachRooms } from '../server/rooms';
import { setup, army } from './fixtures';

test('v101: 42 macroterritórios e dez mares têm geometria finita e grafo simétrico sem órfãos', () => {
  const map = makeMap('campaign');
  assert.equal(map.filter((p) => p.kind === 'LAND').length, 42);
  assert.equal(map.filter((p) => p.kind === 'SEA_ZONE').length, 10);
  const ids =
    'brazil rioplata andes colombia alaska canada-west canada-east usa-west usa-east mexico central-america castile france britain germany italy scandinavia poland balkans muscovy maghreb nile west-africa central-africa east-africa south-africa anatolia arabia persia ural siberia central-asia afghan india-north india-south indochina china-west china-east mongolia korea japan archipelago'.split(
      ' ',
    );
  assert.deepEqual(
    map
      .filter((p) => p.kind === 'LAND')
      .map((p) => p.id)
      .sort(),
    ids.sort(),
  );
  for (const p of map) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(
      p.rings.length > 0 &&
        p.rings.every((r) => r.length >= 4 && r.every((v) => v.every(Number.isFinite))),
    );
    for (const id of p.neighbors)
      assert.ok(map.find((q) => q.id === id)?.neighbors.includes(p.id), `${p.id}/${id}`);
  }
  assert.equal(WORLD_RIVERS.length, 11);
  assert.equal(impassableFeatures.length, 4);
  assert.ok(
    WORLD_RIVERS.every(
      (r) => r.points.length >= 3 && r.provinces.every((id) => map.some((p) => p.id === id)),
    ),
  );
});
test('v110: cheias da primavera reduzem ataque de travessia em 25% só na rodada da marcha', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const p = g.provinces.find((p) => p.id === 'germany')!;
  const u = army(g, a.id, 'france', { infantry: 10 });
  const d = army(g, b.id, p.id, { infantry: 10 });
  assert.ok(hasRiverCrossing('france', p.id) && hasRiverCrossing(p.id, 'france'));
  const crossing = combatPowers(g, [u], [d], p);
  u.provinceId = p.id;
  const stationary = combatPowers(g, [u], [d], p);
  assert.ok(Math.abs(crossing.attackPower / stationary.attackPower - 0.75) < 1e-9);
  assert.equal(stationary.riverCrossingModifier, 1);
  u.previousProvinceId = 'france';
  u.lastMovedTurn = g.turn;
  assert.ok(Math.abs(combatPowers(g, [u], [d], p).riverCrossingModifier - 0.75) < 1e-9);
  g.turn++;
  assert.equal(combatPowers(g, [u], [d], p).riverCrossingModifier, 1);
  u.provinceId = 'france';
  const second = army(g, a.id, p.id, { infantry: 10 });
  assert.ok(Math.abs(combatPowers(g, [u, second], [d], p).riverCrossingModifier - 0.875) < 1e-9);
});
test('v100: guarnição custa metade e ordens de marcha entram na previsão de campanha', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'castile');
  assert.equal(logisticsPosture(g, u).id, 'GARRISON');
  const cost = realmEconomy(g, a.id).upkeep;
  g.provinces.find((p) => p.id === 'france')!.ownerId = a.id;
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['france'] });
  assert.equal(logisticsPosture(g, u).multiplier, 1);
  assert.ok(Math.abs(realmEconomy(g, a.id).upkeep - cost * 2) < 0.02);
  g.orders[a.id] = [];
  u.lastMovedTurn = g.turn;
  assert.equal(logisticsPosture(g, u).id, 'CAMPAIGN');
  g.turn++;
  assert.equal(logisticsPosture(g, u).id, 'GARRISON');
  g.provinces.find((p) => p.id === 'castile')!.pacification = 79;
  assert.equal(logisticsPosture(g, u).id, 'CAMPAIGN');
  g.provinces.find((p) => p.id === 'japan')!.ownerId = g.players[1].id;
  u.provinceId = 'japan';
  assert.equal(logisticsPosture(g, u).multiplier, 1.25);
});
test('v101: Conselho sorteia crises, táticas e políticas contextuais com efeitos e custos distintos', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  assert.equal(DILEMMAS.length, 10);
  assert.equal(new Set(DILEMMAS.map((d) => d.id)).size, 10);
  assert.deepEqual(
    new Set(DILEMMAS.map((d) => d.category)),
    new Set(['CRISIS', 'TACTICAL', 'POLICY']),
  );
  assert.equal(new Set(DILEMMAS.flatMap((d) => d.options.map((o) => o.effect))).size, 20);
  for (const d of DILEMMAS) {
    assert.equal(d.options.length, 2);
    assert.ok(
      d.options[0].gold >= 0 && d.options[0].manpower >= 0 && d.options[0].authority >= 0,
      `${d.id}: a decisão automática precisa ser financiável sem reservas.`,
    );
    assert.ok(
      [d.options[1].gold, d.options[1].manpower, d.options[1].authority].some((v) => v < 0),
      `${d.id}: a alternativa deve comprometer algum recurso.`,
    );
    for (const choice of d.options) {
      assert.ok(choice.duration >= 2 && choice.duration <= 4);
      assert.ok(Object.keys(choice.modifiers).length > 0);
      assert.ok(Object.values(choice.modifiers).every(Number.isFinite));
    }
  }
  assert.deepEqual(dilemmaFor(g.seed, a.id, 4, g), dilemmaFor(g.seed, a.id, 4, g));
  const observed = new Set(
    Array.from(
      { length: 256 },
      (_, seed) => DILEMMAS.find((d) => d.id === dilemmaFor(seed, a.id, 4, g).id)!.category,
    ),
  );
  assert.deepEqual(observed, new Set(['CRISIS', 'TACTICAL', 'POLICY']));
  g.turn = 3;
  issueDilemmas(g);
  assert.equal(a.activeDilemma, null);
  g.turn = 4;
  issueDilemmas(g);
  assert.ok(a.activeDilemma && b.activeDilemma);
  assert.equal(viewFor(g, a.id).players.find((p) => p.id === b.id)!.activeDilemma, null);
  const issued = g.players.find((p) => p.id === a.id)!.activeDilemma;
  assert.ok(
    issued?.targetProvinceId &&
      g.provinces.some((p) => p.id === issued.targetProvinceId && p.ownerId === a.id),
  );
  a.activeDilemma = { id: 'military-council', turn: 4, targetProvinceId: 'castile' };
  const authority = getNationAuthority(a),
    gold = a.gold;
  const before = structuredClone(g);
  const updated = executeCommand(g, a.id, { type: 'CHOOSE_DILEMMA', option: 1 });
  assert.deepEqual(g, before);
  const decided = updated.players.find((p) => p.id === a.id)!;
  assert.equal(getNationAuthority(decided), authority - 10);
  assert.equal(decided.gold, gold);
  assert.equal(updated.battalions.length, g.battalions.length);
  assert.equal(councilModifiers(decided, 4).moraleBonus, 20);
  assert.equal(councilModifiers(decided, 4).upkeepMultiplier, 1.35);
  assert.equal(activeCouncilEffects(decided, 6).length, 1);
  assert.equal(activeCouncilEffects(decided, 7).length, 0);
  assert.equal(councilModifiers(decided, 7).moraleBonus, 0);
  chooseDilemma(g, a.id, 1);
  assert.equal(getNationAuthority(a), authority - 10);
  assert.throws(() => chooseDilemma(g, a.id, 0));
  issueDilemmas(g);
  assert.equal(a.activeDilemma, null);
  g.turn = 8;
  issueDilemmas(g);
  assert.equal(g.players.find((p) => p.id === a.id)!.activeDilemma?.turn, 8);
});
test('v101: Conselho não respondido aplica uma política custosa no tempo, uma única vez e sem tropas gratuitas', () => {
  const {
    g,
    players: [a],
  } = setup();
  g.turn = 4;
  for (const p of g.players) p.activeDilemma = null;
  a.activeDilemma = { id: 'mint', turn: 4, targetProvinceId: 'castile' };
  a.gold = a.manpower = a.influence = a.prestige = a.militaryXP = 0;
  const report = emptyTurnReport(g.turn, g.diet);
  resolveUnansweredDilemmas(g, report);
  assert.equal(g.battalions.filter((b) => b.ownerId === a.id).length, 0);
  assert.equal(a.gold, 20);
  assert.equal(a.manpower, 0);
  assert.equal(a.authority, 0);
  assert.equal(a.activeDilemma, null);
  const policy = councilModifiers(a, 4);
  assert.equal(policy.goldPerTurn, -7);
  assert.equal(policy.incomeMultiplier, 0.9);
  assert.equal(policy.authorityGain, -1);
  assert.equal(activeCouncilEffects(a, 7).length, 1);
  assert.equal(activeCouncilEffects(a, 8).length, 0);
  resolveUnansweredDilemmas(g, report);
  assert.equal(a.gold, 20);
  assert.equal(a.councilEffects!.length, 1);
  assert.equal(report.events.filter((e) => e.startsWith(`${a.nation} —`)).length, 1);
});
test('v101: Conselho preserva ouro reservado e milícias consomem Recrutas e Autoridade reais', () => {
  const {
    g,
    players: [a],
  } = setup();
  g.turn = 4;
  a.activeDilemma = { id: 'arsenal', turn: 4, targetProvinceId: 'castile' };
  a.gold = 30;
  submitOrder(g, a.id, { type: 'BUILD_MARKET', provinceId: 'castile' });
  const before = structuredClone(g);
  assert.throws(() => executeCommand(g, a.id, { type: 'CHOOSE_DILEMMA', option: 1 }), /Ouro livre/);
  assert.deepEqual(g, before);
  g.orders[a.id] = [];
  a.activeDilemma = { id: 'barons', turn: 4, targetProvinceId: 'castile' };
  a.manpower = 2;
  assert.throws(() => chooseDilemma(g, a.id, 1), /Recrutas livres/);
  a.manpower = 3;
  const authority = getNationAuthority(a);
  chooseDilemma(g, a.id, 1);
  assert.equal(a.manpower, 0);
  assert.equal(getNationAuthority(a), authority - 14);
  assert.equal(g.battalions.find((b) => b.ownerId === a.id)!.infantry, 3);
  assert.equal(g.battalions.find((b) => b.ownerId === a.id)!.artillery, 0);
});
test('v100: bot mantém defesa ameaçada da capital, cancela saída e recruta para enfrentar superioridade', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.bot = true;
  a.gold = 500;
  a.manpower = 20;
  const guard = army(g, a.id, 'castile', { infantry: 6 });
  army(g, b.id, 'france', { infantry: 14 });
  declareWar(g, b.id, a.id, 'CONQUEST');
  guard.pathQueue = ['france', 'italy'];
  assert.equal(computeProvinceThreat(g, 'castile'), 14);
  assert.equal(canLeaveDefendedProvince(g, guard), false);
  planBot(g, a);
  assert.deepEqual(guard.pathQueue, []);
  assert.equal(
    g.orders[a.id].some(
      (o) =>
        'battalionId' in o &&
        o.battalionId === guard.id &&
        ['MOVE_BATTALION', 'EMBARK_BATTALION', 'AUTO_TRANSPORT'].includes(o.type),
    ),
    false,
  );
  assert.ok(
    g.orders[a.id].some((o) => o.type === 'RECRUIT_BATTALION' && o.provinceId === 'castile'),
  );
});
test('v100: bot concentra destacamentos, atribui general e prioriza quartéis quando faltam recrutas', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.bot = true;
  a.gold = 500;
  a.influence = 24;
  a.prestige = 0;
  a.manpower = 3;
  const capital = g.provinces.find((p) => p.id === 'castile')!;
  capital.barracksLevel = 0;
  army(g, a.id, capital.id, { infantry: 5, artillery: 1 });
  army(g, a.id, capital.id, { infantry: 5, artillery: 1 });
  planBot(g, a);
  const land = g.battalions.filter((u) => u.ownerId === a.id && !u.isFleet);
  assert.equal(land.length, 1);
  assert.equal(land[0].infantry + land[0].artillery, 12);
  assert.ok(g.commanders.some((c) => c.assignedBattalionId === land[0].id));
  assert.ok(
    g.orders[a.id].some(
      (o) =>
        o.type === 'BUILD_BUILDING' && o.building === 'BARRACKS' && o.provinceId === capital.id,
    ),
  );
});
test('v100: anti-AFK só assume após dois atrasos ou desconexão e nunca torna a vaga substituível', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.online = true;
  a.ready = false;
  b.online = true;
  b.ready = true;
  applyAfkRegency(g);
  assert.equal(a.afkStreak, 1);
  assert.equal(a.bot, false);
  assert.equal(b.afkStreak, 0);
  applyAfkRegency(g);
  assert.equal(a.afkRegent, true);
  assert.equal(a.bot, true);
  assert.equal(replaceableBot(a), false);
  restoreRegency(a);
  assert.equal(a.bot, false);
  assert.equal(a.afkStreak, 0);
  b.online = false;
  applyAfkRegency(g);
  assert.equal(b.afkRegent, true);
  assert.equal(b.bot, true);
});
function response<T extends ServerMessage['type']>(
  ws: WebSocket,
  type: T,
  predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
) {
  return new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', listen);
      reject(new Error(`Sem ${type}`));
    }, 4000);
    function listen(raw: WebSocket.RawData) {
      const m = JSON.parse(String(raw));
      if (m.type === type && predicate(m)) {
        clearTimeout(timeout);
        ws.off('message', listen);
        resolve(m);
      }
    }
    ws.on('message', listen);
  });
}
async function action<T extends ServerMessage['type']>(
  ws: WebSocket,
  value: ClientMessage,
  type: T,
  predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
) {
  const pending = response(ws, type, predicate);
  ws.send(JSON.stringify(value));
  return pending;
}
test('v100: lobby público permite assumir bot permanente; comando e reconexão restauram regente com o mesmo token', async (t) => {
  let now = 1000;
  const server = http.createServer(),
    service = attachRooms(server, { now: () => now, tickMs: 1000000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  t.after(async () => {
    service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await once(ws, 'open');
    return ws;
  };
  const host = await connect(),
    human = await connect();
  const joined = await action(
    host,
    { type: 'create', name: 'Host', isPublic: true, turnTimerSeconds: 15 },
    'joined',
  );
  const guest = await action(human, { type: 'join', code: joined.code, name: 'Guest' }, 'joined');
  await action(
    host,
    { type: 'command', command: { type: 'ADD_BOT' } },
    'state',
    (m) => m.state.players.length === 3,
  );
  await action(
    host,
    { type: 'command', command: { type: 'START_GAME' } },
    'state',
    (m) => m.state.phase === 'planning',
  );
  const room = service.rooms.get(joined.code)!;
  const bot = room.game.players.find((p) => p.bot)!;
  assert.equal(service.listPublicRooms(true)[0].replaceableBots, 1);
  const claimant = await connect();
  const claimed = await action(
    claimant,
    { type: 'join', code: joined.code, name: 'New Captain' },
    'joined',
  );
  assert.equal(claimed.playerId, bot.id);
  assert.equal(room.game.players.length, 3);
  assert.equal(service.listPublicRooms(true).length, 0);
  for (let round = 0; round < 2; round++) {
    await action(
      host,
      { type: 'command', command: { type: 'READY', ready: true } },
      'state',
      (m) => m.state.players.find((p) => p.id === joined.playerId)!.ready,
    );
    now = room.game.deadline!;
    service.tick();
  }
  assert.equal(room.game.players.find((p) => p.id === guest.playerId)!.afkRegent, true);
  await action(
    human,
    { type: 'command', command: { type: 'READY', ready: false } },
    'state',
    (m) => m.state.players.find((p) => p.id === guest.playerId)!.afkStreak === 0,
  );
  assert.equal(room.game.players.find((p) => p.id === guest.playerId)!.afkStreak, 0);
  const seat = room.game.players.find((p) => p.id === guest.playerId)!;
  seat.bot = true;
  seat.afkRegent = true;
  const resumed = await connect();
  const result = await action(
    resumed,
    { type: 'resume', code: joined.code, playerId: guest.playerId, token: guest.token },
    'joined',
  );
  assert.equal(result.playerId, guest.playerId);
  assert.equal(room.game.players.find((p) => p.id === guest.playerId)!.bot, false);
});
test('v100: cinco efeitos são arquivos PCM WAV reais de duração e amplitude úteis', async () => {
  for (const name of ['cannon', 'march', 'sail', 'horn', 'coin']) {
    const wav = await readFile(new URL(`../public/assets/sfx/${name}.wav`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.ok(wav.length > 70000);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 2000 && peak <= 32767);
  }
});

test('v100: dois exércitos principais concentram suas marchas no mesmo alvo neutro', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.bot = true;
  a.gold = 500;
  a.manpower = 20;
  const rear = g.provinces.find((p) => p.id === 'italy')!;
  rear.ownerId = a.id;
  rear.pacification = 100;
  g.provinces.find((p) => p.id === 'france')!.ownerId = null;
  army(g, a.id, 'castile', { infantry: 10, artillery: 2 });
  army(g, a.id, 'italy', { infantry: 10, artillery: 2 });
  planBot(g, a);
  const moves = g.orders[a.id].filter((o) => o.type === 'MOVE_BATTALION');
  assert.equal(moves.length, 2);
  for (const move of moves)
    assert.equal(move.targetProvinceId ?? move.path?.at(-1), a.botTargetProvinceId);
  assert.equal(a.botTargetProvinceId, 'france');
});
test('v100: saldo líquido baixo prioriza mercado quando o quartel já atende o recrutamento', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.bot = true;
  a.gold = 500;
  a.manpower = 20;
  const capital = g.provinces.find((p) => p.id === 'castile')!;
  capital.barracksLevel = 1;
  capital.marketLevel = 0;
  army(g, a.id, capital.id, { infantry: 10, artillery: 2 });
  assert.ok(realmEconomy(g, a.id).net < 15);
  planBot(g, a);
  assert.ok(g.orders[a.id].some((o) => o.type === 'BUILD_MARKET' && o.provinceId === capital.id));
});

test('v100: dividir e fundir formações não apaga marcha nem concede desconto indevido', async () => {
  const { instantArmyAction } = await import('../server/armies');
  const {
    g,
    players: [a],
  } = setup();
  const unit = army(g, a.id, 'castile', { infantry: 8 });
  unit.previousProvinceId = 'france';
  unit.lastMovedTurn = g.turn;
  instantArmyAction(g, a.id, {
    type: 'SPLIT_BATTALION',
    battalionId: unit.id,
    composition: { infantry: 4, cavalry: 0, artillery: 0, warships: 0, transports: 0 },
  });
  const split = g.battalions.find((b) => b.id !== unit.id)!;
  assert.equal(logisticsPosture(g, split).id, 'CAMPAIGN');
  const stationary = army(g, a.id, 'castile', { infantry: 1 });
  instantArmyAction(g, a.id, {
    type: 'MERGE_BATTALIONS',
    battalionId: split.id,
    targetBattalionId: stationary.id,
  });
  assert.equal(logisticsPosture(g, stationary).id, 'CAMPAIGN');
  assert.equal(stationary.lastMovedTurn, g.turn);
});
