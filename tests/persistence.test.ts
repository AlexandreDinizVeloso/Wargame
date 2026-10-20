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
      command: { type: 'SUBMIT_ORDER', order: { type: 'TRAIN', provinceId: 'p16' } },
    },
    'state',
    (m) => m.state.plannedOrders.length === 1,
  );
  const savedGold = planned.state.players[0].gold;
  assert.equal(readFileSync(filename, 'utf8').includes(session.token), false);
  assert.equal(readSnapshot(filename)[0].game.orders[session.playerId][0].type, 'TRAIN');
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
  assert.equal(state.plannedOrders[0].type, 'TRAIN');
  assert.equal(state.players[0].gold, savedGold);
  assert.equal(state.paused, false);
  assert.ok(state.deadline! > Date.now());
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
