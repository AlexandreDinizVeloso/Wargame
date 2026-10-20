import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { attachRooms } from '../server/rooms';

type Message = Record<string, any>;
function wait(ws: WebSocket, predicate: (m: Message) => boolean) {
  return new Promise<Message>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', listener);
      reject(new Error('Tempo esgotado aguardando mensagem.'));
    }, 4000);
    const listener = (raw: Buffer) => {
      const m = JSON.parse(raw.toString());
      if (predicate(m)) {
        clearTimeout(timeout);
        ws.off('message', listener);
        resolve(m);
      }
    };
    ws.on('message', listener);
  });
}
function action(ws: WebSocket, message: unknown, predicate: (m: Message) => boolean) {
  const result = wait(ws, predicate);
  ws.send(JSON.stringify(message));
  return result;
}
test('3 clientes reais jogam, recebem estados privados e recuperam a sessão', async (t) => {
  const server = http.createServer();
  const service = attachRooms(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  const clients: WebSocket[] = [];
  t.after(async () => {
    for (const ws of clients) ws.terminate();
    service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function connect() {
    const ws = new WebSocket(url);
    clients.push(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return ws;
  }
  const a = await connect(),
    b = await connect(),
    c = await connect();
  const session = await action(a, { type: 'create', name: 'Ana' }, (m) => m.type === 'joined');
  await action(b, { type: 'join', code: session.code, name: 'Bruno' }, (m) => m.type === 'joined');
  await action(c, { type: 'join', code: session.code, name: 'Clara' }, (m) => m.type === 'joined');
  const started = await action(
    a,
    { type: 'command', command: { type: 'START_GAME' } },
    (m) => m.type === 'state' && m.state.phase === 'planning',
  );
  assert.equal(started.state.players.length, 3);
  const otherView = wait(b, (m) => m.type === 'state' && m.state.players.length === 3);
  const planned = await action(
    a,
    {
      type: 'command',
      command: { type: 'SUBMIT_ORDER', order: { type: 'TRAIN_BATTALION', battalionId: 'army-1' } },
    },
    (m) => m.type === 'state' && m.state.plannedOrders.length === 1,
  );
  assert.equal(planned.state.plannedOrders[0].type, 'TRAIN_BATTALION');
  assert.deepEqual((await otherView).state.plannedOrders, []);
  const denied = await action(
    b,
    {
      type: 'command',
      command: { type: 'SUBMIT_ORDER', order: { type: 'TRAIN_BATTALION', battalionId: 'army-1' } },
    },
    (m) => m.type === 'error',
  );
  assert.match(denied.message, /não pertence/);
  await action(
    a,
    { type: 'command', command: { type: 'READY', ready: true } },
    (m) =>
      m.type === 'state' && m.state.players.find((p: Message) => p.id === session.playerId).ready,
  );
  await action(
    b,
    { type: 'command', command: { type: 'READY', ready: true } },
    (m) => m.type === 'state' && m.state.players.filter((p: Message) => p.ready).length === 2,
  );
  const nextA = wait(a, (m) => m.type === 'state' && m.state.turn === 2),
    nextB = wait(b, (m) => m.type === 'state' && m.state.turn === 2);
  const nextC = await action(
    c,
    { type: 'command', command: { type: 'READY', ready: true } },
    (m) => m.type === 'state' && m.state.turn === 2,
  );
  assert.deepEqual((await nextA).state.provinces, nextC.state.provinces);
  assert.deepEqual((await nextB).state.provinces, nextC.state.provinces);
  const recovered = await connect();
  const resumed = await action(
    recovered,
    { type: 'resume', code: session.code, playerId: session.playerId, token: session.token },
    (m) => m.type === 'joined',
  );
  assert.equal(resumed.playerId, session.playerId);
  const impostor = await connect();
  const rejection = await action(
    impostor,
    { type: 'resume', code: session.code, playerId: session.playerId, token: 'invalid' },
    (m) => m.type === 'error',
  );
  assert.match(rejection.message, /recuperar a sessão/);
  const hostTransfer = wait(b, (m) => m.type === 'state' && m.state.hostId !== session.playerId);
  recovered.close();
  const transferred = await hostTransfer;
  assert.equal(
    transferred.state.hostId,
    transferred.state.players.find((p: Message) => p.name === 'Bruno').id,
  );
  const replaced = await action(
    b,
    { type: 'command', command: { type: 'REPLACE_WITH_BOT', playerId: session.playerId } },
    (m) =>
      m.type === 'state' && m.state.players.find((p: Message) => p.id === session.playerId).bot,
  );
  assert.equal(replaced.state.players.find((p: Message) => p.id === session.playerId).bot, true);
  service.rooms.get(session.code)!.game.deadline = Date.now() - 100;
  const timed = await wait(b, (m) => m.type === 'state' && m.state.turn === 3);
  assert.equal(timed.state.turn, 3);
});
test('handshake recusa origem de outro site', async (t) => {
  const server = http.createServer(),
    service = attachRooms(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const result = await new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`, {
      origin: 'https://outro-site.example',
    });
    ws.on('unexpected-response', (_req, res) => {
      resolve(res.statusCode!);
      res.resume();
    });
    ws.on('error', () => {});
    ws.on('open', () => {
      ws.close();
      reject(new Error('Origem indevida foi aceita.'));
    });
  });
  assert.equal(result, 403);
});
