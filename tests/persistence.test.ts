import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket, type RawData } from 'ws';
import { attachRooms } from '../server/rooms';
import { readSnapshot } from '../server/storage';
import type { ServerMessage } from '../shared/types';

function wait<T extends ServerMessage['type']>(
  ws: WebSocket,
  type: T,
  predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
) {
  return new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', listen);
      reject(new Error(`Timeout: ${type}`));
    }, 4000);
    const listen = (raw: RawData) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === type && predicate(msg as Extract<ServerMessage, { type: T }>)) {
        clearTimeout(timer);
        ws.off('message', listen);
        resolve(msg as Extract<ServerMessage, { type: T }>);
      }
    };
    ws.on('message', listen);
  });
}
function action<T extends ServerMessage['type']>(
  ws: WebSocket,
  payload: unknown,
  type: T,
  predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
) {
  const result = wait(ws, type, predicate);
  ws.send(JSON.stringify(payload));
  return result;
}
async function launch(stateFile: string) {
  const server = http.createServer(),
    service = attachRooms(server, { stateFile });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const sockets: WebSocket[] = [];
  return {
    service,
    async connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`);
      sockets.push(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      return ws;
    },
    async close() {
      service.close();
      for (const ws of sockets) ws.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
test('salvamento atômico restaura salas, ordens e tokens após reinício, pausando o relógio', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-save-')),
    filename = path.join(directory, 'rooms-state.json');
  let first: Awaited<ReturnType<typeof launch>> | null = await launch(filename),
    second: Awaited<ReturnType<typeof launch>> | null = null;
  t.after(async () => {
    await first?.close();
    await second?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const a = await first.connect(),
    b = await first.connect(),
    c = await first.connect();
  const session = await action(a, { type: 'create', name: 'A' }, 'joined');
  await action(b, { type: 'join', name: 'B', code: session.code }, 'joined');
  await action(c, { type: 'join', name: 'C', code: session.code }, 'joined');
  await action(
    a,
    { type: 'command', command: { type: 'START_GAME' } },
    'state',
    (m) => m.state.phase === 'planning',
  );
  const planned = await action(
    a,
    {
      type: 'command',
      command: { type: 'SUBMIT_ORDER', order: { type: 'TRAIN_BATTALION', battalionId: 'army-1' } },
    },
    'state',
    (m) => m.state.plannedOrders.length === 1,
  );
  const savedGold = planned.state.players[0].gold;
  assert.equal(readFileSync(filename, 'utf8').includes(session.token), false);
  assert.equal(readSnapshot(filename)[0].game.orders[session.playerId][0].type, 'TRAIN_BATTALION');
  await first.close();
  first = null;
  second = await launch(filename);
  const restored = second.service.rooms.get(session.code)!;
  assert.equal(restored.game.paused, true);
  assert.equal(restored.game.deadline, null);
  assert.equal(restored.game.turn, 1);
  const resumed = await second.connect();
  const recoveredState = wait(resumed, 'state');
  await action(
    resumed,
    { type: 'resume', code: session.code, playerId: session.playerId, token: session.token },
    'joined',
  );
  const state = (await recoveredState).state;
  assert.equal(state.plannedOrders[0].type, 'TRAIN_BATTALION');
  assert.equal(state.players[0].gold, savedGold);
  assert.equal(state.paused, false);
  assert.equal(state.deadline, null);
  const impostor = await second.connect();
  const denied = await action(
    impostor,
    { type: 'resume', code: session.code, playerId: session.playerId, token: 'wrong' },
    'error',
  );
  assert.match(denied.message, /recuperar a sessão/);
});
test('backup recupera JSON corrompido e corrupção total não é tratada como sala vazia', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-backup-')),
    filename = path.join(directory, 'rooms-state.json'),
    instance = await launch(filename);
  t.after(async () => {
    await instance.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const socket = await instance.connect();
  await action(socket, { type: 'create', name: 'A' }, 'joined');
  instance.service.persist();
  writeFileSync(filename, '{invalid json');
  assert.equal(readSnapshot(filename).length, 1);
  instance.service.persist();
  assert.equal(readSnapshot(filename).length, 1);
  writeFileSync(filename, '{invalid json');
  writeFileSync(`${filename}.bak`, 'also invalid');
  assert.throws(() => readSnapshot(filename), /preservados/);
});

test('falha de gravação desfaz substituição por bot e preserva a sessão humana', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-write-failure-'));
  const filename = path.join(directory, 'rooms-state.json');
  const instance = await launch(filename);
  t.after(async () => {
    rmSync(`${filename}.tmp`, { recursive: true, force: true });
    await instance.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const host = await instance.connect(),
    guest = await instance.connect();
  const owner = await action(host, { type: 'create', name: 'A' }, 'joined');
  const session = await action(guest, { type: 'join', name: 'B', code: owner.code }, 'joined');
  const disconnected = wait(
    host,
    'state',
    (m) => m.state.players.find((p) => p.id === session.playerId)?.online === false,
  );
  guest.close();
  await disconnected;
  mkdirSync(`${filename}.tmp`);
  await action(
    host,
    { type: 'command', command: { type: 'REPLACE_WITH_BOT', playerId: session.playerId } },
    'error',
  );
  const room = instance.service.rooms.get(owner.code)!;
  assert.equal(room.game.players.find((p) => p.id === session.playerId)!.bot, false);
  assert.equal(room.sessions.has(session.playerId), true);
  rmSync(`${filename}.tmp`, { recursive: true });
  const resumed = await instance.connect();
  const joined = await action(
    resumed,
    { type: 'resume', code: owner.code, playerId: session.playerId, token: session.token },
    'joined',
  );
  assert.equal(joined.playerId, session.playerId);
});

test('snapshot v2 é migrado sem perder tesouro, dono, tropas, ordens locais ou tokens', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-v2-')),
    filename = path.join(directory, 'rooms.json');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const players = ['A', 'B', 'C'].map((name, i) => ({
    id: `OLD-p${i + 1}`,
    name,
    nation: name,
    color: '#aabbcc',
    faith: 'Catolicismo',
    bot: false,
    botArchetype: 'Diplomat',
    online: false,
    gold: 50 + i,
    manpower: 10,
    influence: 8,
    stability: 90,
    warExhaustion: 0,
    wonBattles: 0,
    conversions: 0,
    tradeEarned: 0,
    ready: false,
  }));
  const provinces = players.map((p, i) => ({
    id: `p${i}`,
    name: `Cidade ${i}`,
    ownerId: p.id,
    troops: 6,
    mercenaries: i === 0 ? 2 : 0,
    morale: 70,
    training: 1.2,
    religion: 'Catolicismo',
    pacification: 80,
    unrest: 5,
    fortLevel: 0,
    development: 1,
    capital: true,
    conversion: 0,
    neighbors: players.map((_, j) => `p${j}`).filter((id) => id !== `p${i}`),
    polygon: `${i * 20},0 ${i * 20 + 10},0 ${i * 20 + 5},10`,
    x: i * 20 + 5,
    y: 5,
    terrain: 'coastal',
    terrainDefenseBonus: 1.05,
    baseTax: 4,
    baseSupplyLimit: 16,
    resource: 'trade',
  }));
  const game = {
    version: 2,
    code: 'OLD',
    hostId: players[0].id,
    phase: 'planning',
    mode: 'quick',
    demo: false,
    seed: 42,
    turn: 4,
    maxTurns: 20,
    players,
    provinces,
    relations: [],
    log: [],
    chat: [],
    orders: { 'OLD-p1': [{ type: 'TRAIN', provinceId: 'p0' }], 'OLD-p2': [], 'OLD-p3': [] },
    stationedArmies: [],
    displacedArmies: [],
  };
  writeFileSync(
    filename,
    JSON.stringify({
      schemaVersion: 2,
      rooms: [
        {
          game,
          sessions: [{ playerId: 'OLD-p1', tokenHash: 'a'.repeat(64) }],
          touched: 1,
          remainingMs: 90000,
        },
      ],
    }),
  );
  const room = readSnapshot(filename)[0];
  assert.equal(room.game.version, 5);
  assert.equal(room.game.turn, 4);
  assert.equal(room.game.players[0].gold, 50);
  assert.equal(room.game.provinces[0].ownerId, 'OLD-p1');
  assert.equal(
    room.game.battalions.filter((a) => a.provinceId === 'p0').reduce((n, a) => n + a.infantry, 0),
    6,
  );
  assert.equal(
    room.game.battalions.find((a) => a.provinceId === 'p0' && a.isMercenary)?.infantry,
    2,
  );
  assert.equal(room.game.orders['OLD-p1'][0].type, 'TRAIN_BATTALION');
  assert.equal(room.sessions[0].tokenHash, 'a'.repeat(64));
  assert.equal(room.game.matchConfig.mapId, 'legacy-v2-32-regions');
  assert.ok(readFileSync(`${filename}.v2-backup`, 'utf8').includes('"version":2'));
});
