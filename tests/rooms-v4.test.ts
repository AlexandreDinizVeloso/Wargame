import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRooms } from '../server/rooms';
import type { ClientMessage, ServerMessage } from '../shared/types';
function message<T extends ServerMessage['type']>(
  ws: WebSocket,
  type: T,
  predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
) {
  return new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', listen);
      reject(new Error(`Mensagem ${type} ausente.`));
    }, 4000);
    function listen(raw: WebSocket.RawData) {
      const m = JSON.parse(String(raw)) as Extract<ServerMessage, { type: T }>;
      if (m.type === type && predicate(m)) {
        clearTimeout(timer);
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
  const response = message(ws, type, predicate);
  ws.send(JSON.stringify(value));
  return response;
}
test('First-Ready ignora espera inicial, vence por prazo e limpa o relógio na próxima rodada', async (t) => {
  let now = 1000;
  const server = http.createServer(),
    service = attachRooms(server, { now: () => now, tickMs: 1000000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const sockets: WebSocket[] = [];
  t.after(async () => {
    service.close();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    sockets.push(ws);
    await once(ws, 'open');
    return ws;
  };
  const a = await connect(),
    b = await connect();
  const joined = await action(
    a,
    { type: 'create', name: 'Primeira', turnTimerSeconds: 15 },
    'joined',
  );
  await action(b, { type: 'join', name: 'Segunda', code: joined.code }, 'joined');
  await action(
    a,
    { type: 'command', command: { type: 'ADD_BOT' } },
    'state',
    (m) => m.state.players.length === 3,
  );
  await action(
    a,
    { type: 'command', command: { type: 'START_GAME' } },
    'state',
    (m) => m.state.phase === 'planning',
  );
  const room = service.rooms.get(joined.code)!;
  now = 100000;
  service.tick();
  assert.equal(room.game.turn, 1);
  assert.equal(room.game.turnDeadlineAt, null);
  await action(
    a,
    { type: 'command', command: { type: 'READY', ready: true } },
    'state',
    (m) => m.state.firstReadyPlayerName === 'Primeira',
  );
  assert.equal(room.game.turnDeadlineAt, 115000);
  now = 114999;
  service.tick();
  assert.equal(room.game.turn, 1);
  now = 115000;
  service.tick();
  assert.equal(room.game.turn, 2);
  assert.equal(room.game.firstReadyPlayerName, null);
  assert.equal(room.game.turnDeadlineAt, null);
});
test('salas privadas ficam fora do browser e opções de lobby preservam cenário e toggle', async (t) => {
  const server = http.createServer(),
    service = attachRooms(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws`);
  await once(ws, 'open');
  t.after(async () => {
    service.close();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const joined = await action(
    ws,
    {
      type: 'create',
      name: 'Ana',
      roomName: 'Privada',
      isPublic: false,
      enableSecretObjectives: false,
      turnTimerSeconds: 90,
    },
    'joined',
  );
  assert.deepEqual(service.listPublicRooms(), []);
  await action(
    ws,
    {
      type: 'command',
      command: {
        type: 'SET_LOBBY_OPTIONS',
        roomName: 'Mesa aberta',
        isPublic: true,
        enableSecretObjectives: true,
        turnTimerSeconds: 30,
      },
    },
    'state',
    (m) => m.state.isPublic,
  );
  const list = service.listPublicRooms();
  assert.equal(list.length, 1);
  assert.deepEqual(
    Object.keys(list[0]).sort(),
    [
      'roomId',
      'roomName',
      'hostName',
      'theater',
      'enableSecretObjectives',
      'playersCount',
      'maxPlayers',
      'status',
      'turn',
    ].sort(),
  );
  assert.equal(list[0].roomId, joined.code);
  assert.equal(list[0].status, 'LOBBY');
  assert.equal(list[0].hostName, 'Ana');
  const changed = await action(
    ws,
    { type: 'command', command: { type: 'SET_MODE', mode: 'quick', theater: 'ASIA' } },
    'state',
    (m) => m.state.theater === 'ASIA',
  );
  assert.equal(changed.state.enableSecretObjectives, true);
  assert.equal(changed.state.turnSeconds, 30);
  assert.equal(changed.state.matchConfig.enableSecretObjectives, true);
  assert.equal(service.listPublicRooms()[0].theater, 'Ásia');
});
