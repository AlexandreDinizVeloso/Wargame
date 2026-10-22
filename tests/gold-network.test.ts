import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { ServerMessage, ClientMessage } from '../shared/types';
import { attachRooms } from '../server/rooms';
function wait(ws: WebSocket, predicate: (m: ServerMessage) => boolean) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const t = setTimeout(() => {
      ws.off('message', read);
      reject(new Error('Resposta não recebida'));
    }, 5000);
    function read(raw: Buffer) {
      const m = JSON.parse(String(raw)) as ServerMessage;
      if (predicate(m)) {
        clearTimeout(t);
        ws.off('message', read);
        resolve(m);
      }
    }
    ws.on('message', read);
  });
}
test('Gold: salvar, importar, retomar lugares com novos tokens e rejeitar invasores', async (t) => {
  const server = http.createServer(),
    service = attachRooms(server, { tickMs: 10000 });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const clients: WebSocket[] = [];
  t.after(async () => {
    for (const ws of clients) ws.terminate();
    service.close();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`);
    clients.push(ws);
    await once(ws, 'open');
    return ws;
  };
  const action = async (ws: WebSocket, m: ClientMessage, type: ServerMessage['type']) => {
    const promise = wait(ws, (m) => m.type === type);
    ws.send(JSON.stringify(m));
    return promise;
  };
  const a = await connect(),
    b = await connect(),
    c = await connect();
  const joined = await action(
    a,
    { type: 'create', name: 'Host', scenarioId: 'AGE_OF_SAIL', mode: 'campaign' },
    'joined',
  );
  assert.equal(joined.type, 'joined');
  if (joined.type !== 'joined') return;
  const guest = await action(b, { type: 'join', code: joined.code, name: 'Friend' }, 'joined');
  assert.equal(guest.type, 'joined');
  if (guest.type !== 'joined') return;
  await action(a, { type: 'command', command: { type: 'ADD_BOT' } }, 'state');
  await action(a, { type: 'command', command: { type: 'START_GAME' } }, 'state');
  const original = service.rooms.get(joined.code)!.game;
  assert.equal(original.matchConfig.ruleset, 'GOLD_098');
  const denied = await action(b, { type: 'export_campaign' }, 'error');
  assert.equal(denied.type, 'error');
  const exported = await action(a, { type: 'export_campaign' }, 'campaign_export');
  assert.equal(exported.type, 'campaign_export');
  if (exported.type !== 'campaign_export') return;
  const seats = wait(c, (m) => m.type === 'seat_invites'),
    importedJoined = wait(c, (m) => m.type === 'joined');
  c.send(JSON.stringify({ type: 'import_campaign', save: exported.save }));
  const imported = await importedJoined,
    inviteMessage = await seats;
  assert.equal(imported.type, 'joined');
  assert.equal(inviteMessage.type, 'seat_invites');
  if (imported.type !== 'joined' || inviteMessage.type !== 'seat_invites') return;
  assert.notEqual(imported.code, joined.code);
  const importedGame = service.rooms.get(imported.code)!.game;
  assert.equal(importedGame.isPublic, false);
  assert.deepEqual(importedGame.battalions, original.battalions);
  assert.equal(importedGame.matchConfig.campaignId, original.matchConfig.campaignId);
  const intruder = await connect();
  const oldToken = await action(
    intruder,
    { type: 'resume', code: imported.code, playerId: guest.playerId, token: guest.token },
    'error',
  );
  assert.equal(oldToken.type, 'error');
  const seat = inviteMessage.invites.find((i) => i.playerId === guest.playerId)!;
  assert.ok(seat);
  const resumed = await action(
    intruder,
    { type: 'resume', code: seat.code, playerId: seat.playerId, token: seat.token },
    'joined',
  );
  assert.equal(resumed.type, 'joined');
});
