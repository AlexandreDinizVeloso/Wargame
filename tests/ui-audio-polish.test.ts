import { createBattalion } from '../server/state';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/types';
import { army, setup } from './fixtures';
import { combatPowers as sharedPowers } from '../shared/combat';
import { combatPowers as serverPowers } from '../server/combat';
import { executeCommand, viewFor } from '../server/game';
import { compositionOf, getRelation } from '../shared/rules';
import { battlePreview } from '../src/BattlePreviewTooltip';
import { createMapPing, pingRecipients } from '../server/mapPings';
import { attachRooms } from '../server/rooms';

test('prévia usa o mesmo cálculo puro do combate e respeita vizinhança, forte e general', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 5, cavalry: 1, artillery: 1 });
  const d = army(g, b.id, 'castile', { infantry: 3 });
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.fortLevel = 2;
  const powers = sharedPowers(g, [u], [d], p);
  assert.equal(sharedPowers, serverPowers);
  const preview = battlePreview(viewFor(g, a.id), u, p)!;
  assert.ok(preview);
  assert.equal(preview.attackPower, powers.attackPower);
  assert.equal(preview.defensePower, powers.defensePower);
  assert.equal(preview.neutralizedFortLevels, 1);
  assert.equal(preview.needsWar, true);
  assert.equal(preview.siegeTurns, 4);
  g.commanders.push({
    id: 'siege-master',
    name: 'Engenheiro',
    ownerId: a.id,
    isAdmiral: false,
    stars: 2,
    xp: 45,
    trait: 'SIEGE_MASTER',
    assignedBattalionId: u.id,
    lastStandUsed: false,
  });
  const general = battlePreview(viewFor(g, a.id), u, p)!;
  assert.equal(general.neutralizedFortLevels, 2);
  assert.equal(general.siegeTurns, 3);
  assert.ok(general.attackPower > powers.attackPower);
  assert.equal(
    battlePreview(
      viewFor(g, a.id),
      u,
      g.provinces.find((p) => p.id === 'brazil')!,
    ),
    null,
  );
  assert.equal(
    battlePreview(
      viewFor(g, a.id),
      u,
      g.provinces.find((p) => p.id === 'portugal')!,
    ),
    null,
  );
  getRelation(g, a.id, b.id)!.allied = true;
  assert.equal(battlePreview(viewFor(g, a.id), u, p), null);
});

test('prévia não revela guarnições ocultas e sinaliza desorganização', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 8 });
  const d = army(g, b.id, 'castile', { infantry: 20 });
  b.nationId = 'veridia';
  const target = g.provinces.find((p) => p.id === 'castile')!;
  target.terrain = 'forest';
  // Visibility is always determined by viewFor, never by the preview.
  const view = viewFor(g, a.id),
    preview = battlePreview(view, u, target)!;
  const visible = view.battalions.filter((b) => b.id === d.id);
  assert.equal(visible.length, 0);
  assert.equal(preview.defensePower, sharedPowers(view, [u], visible, target).defensePower);
  u.disorganized = true;
  assert.match(battlePreview(view, u, target)!.verdict, /ofensiva bloqueada/);
});

test('sinal efêmero valida província, nota e remetente e seleciona apenas aliados', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  getRelation(g, a.id, b.id)!.allied = true;
  assert.deepEqual(pingRecipients(g, a.id), [a.id, b.id]);
  assert.ok(!pingRecipients(g, a.id).includes(c.id));
  const ping = createMapPing(g, a.id, 'portugal', '  Atacar juntos!\n  ', 1000);
  assert.equal(ping.playerId, a.id);
  assert.equal(ping.note, 'Atacar juntos!');
  assert.equal(ping.expiresAt, 7000);
  assert.throws(() => createMapPing(g, a.id, 'inexistente', 'oi', 0), /Província inválida/);
  assert.throws(() => createMapPing(g, a.id, 'portugal', 'x'.repeat(81), 0), /80 caracteres/);
  assert.throws(() => createMapPing(g, 'intruso', 'portugal', 'oi', 0), /nações ativas/);
  assert.throws(() => createMapPing(g, a.id, 'portugal', {}, 0), /80 caracteres/);
  assert.equal(createMapPing(g, a.id, 'portugal', undefined, 0).note, 'Atenção aqui!');
});

function waitMessage(ws: WebSocket, predicate: (message: ServerMessage) => boolean) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', listener);
      reject(new Error('Mensagem não recebida'));
    }, 3000);
    function listener(raw: Buffer) {
      const value = JSON.parse(String(raw)) as ServerMessage;
      if (predicate(value)) {
        clearTimeout(timer);
        ws.off('message', listener);
        resolve(value);
      }
    }
    ws.on('message', listener);
  });
}
test('WebSocket entrega sinais só a aliados, autentica e limita frequência inclusive após retomar sessão', async (t) => {
  let now = 5000;
  const server = http.createServer(),
    service = attachRooms(server, { now: () => now, tickMs: 60000 });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const clients: WebSocket[] = [];
  t.after(async () => {
    for (const ws of clients) ws.terminate();
    service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`);
    clients.push(ws);
    await once(ws, 'open');
    return ws;
  };
  const action = async (ws: WebSocket, message: unknown, type: ServerMessage['type']) => {
    const result = waitMessage(ws, (m) => m.type === type);
    ws.send(JSON.stringify(message));
    return result;
  };
  const a = await connect(),
    b = await connect(),
    c = await connect(),
    unauth = await connect();
  const session = await action(a, { type: 'create', name: 'A' }, 'joined');
  assert.equal(session.type, 'joined');
  if (session.type !== 'joined') return;
  const ally = await action(b, { type: 'join', code: session.code, name: 'B' }, 'joined');
  assert.equal(ally.type, 'joined');
  if (ally.type !== 'joined') return;
  await action(c, { type: 'join', code: session.code, name: 'C' }, 'joined');
  await action(a, { type: 'command', command: { type: 'START_GAME' } }, 'state');
  const room = service.rooms.get(session.code)!;
  getRelation(room.game, session.playerId, ally.playerId)!.allied = true;
  const others: ServerMessage[] = [],
    delivered: ServerMessage[] = [];
  c.on('message', (raw) => others.push(JSON.parse(String(raw))));
  b.on('message', (raw) => delivered.push(JSON.parse(String(raw))));
  const receiveAlly = waitMessage(b, (m) => m.type === 'map_ping');
  const own = await action(
    a,
    { type: 'map_ping', provinceId: 'portugal', note: 'Juntos!' },
    'map_ping',
  );
  assert.equal(own.type, 'map_ping');
  if (own.type !== 'map_ping') return;
  assert.deepEqual(await receiveAlly, own);
  assert.equal(own.ping.playerId, session.playerId);
  assert.ok(!('pings' in room.game));
  const denied = await action(unauth, { type: 'map_ping', provinceId: 'portugal' }, 'error');
  assert.equal(denied.type, 'error');
  const limited = await action(a, { type: 'map_ping', provinceId: 'portugal' }, 'error');
  assert.equal(limited.type, 'error');
  if (limited.type === 'error') assert.match(limited.message, /Aguarde/);
  const resumed = await connect();
  await action(
    resumed,
    { type: 'resume', code: session.code, playerId: session.playerId, token: session.token },
    'joined',
  );
  const limitedResume = await action(
    resumed,
    { type: 'map_ping', provinceId: 'portugal' },
    'error',
  );
  if (limitedResume.type === 'error') assert.match(limitedResume.message, /Aguarde/);
  now += 1600;
  getRelation(room.game, session.playerId, ally.playerId)!.allied = false;
  await action(resumed, { type: 'map_ping', provinceId: 'portugal' }, 'map_ping');
  assert.equal(others.filter((m) => m.type === 'map_ping').length, 0);
  assert.equal(delivered.filter((m) => m.type === 'map_ping').length, 1);
});

test('declarar guerra pelo destino desembarca uma carga de forma atômica', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const target = g.provinces.find((p) => p.id === 'castile')!;
  const sea = g.provinces.find((p) => p.kind === 'SEA_ZONE' && target.neighbors.includes(p.id))!;
  assert.ok(sea);
  const fleet = createBattalion(g, a.id, sea.id, compositionOf({ warships: 1, transports: 2 }), {
    isFleet: true,
    morale: 80,
    training: 1.2,
  });
  const cargo = army(g, a.id, 'portugal', { infantry: 5 });
  cargo.provinceId = sea.id;
  cargo.embarkedOnId = fleet.id;
  fleet.embarkedArmyId = cargo.id;
  const result = executeCommand(g, a.id, {
    type: 'DECLARE_WAR_AND_MOVE',
    targetRealmId: b.id,
    casusBelli: 'CONQUEST',
    battalionId: cargo.id,
    targetProvinceId: target.id,
  });
  assert.equal(g.wars.length, 0);
  assert.equal(result.wars.filter((w) => w.active).length, 1);
  assert.deepEqual(result.orders[a.id][0], {
    type: 'EMBARK_BATTALION',
    battalionId: cargo.id,
    disembarkProvinceId: target.id,
  });
  const invalid = g.provinces.find((p) => p.id === 'france')!;
  invalid.ownerId = b.id;
  invalid.isCoastal = false;
  assert.throws(
    () =>
      executeCommand(g, a.id, {
        type: 'DECLARE_WAR_AND_MOVE',
        targetRealmId: b.id,
        casusBelli: 'CONQUEST',
        battalionId: cargo.id,
        targetProvinceId: invalid.id,
      }),
    /Desembarque/,
  );
  assert.equal(g.wars.length, 0);
});
