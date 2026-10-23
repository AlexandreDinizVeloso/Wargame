import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachRooms, HTTP_PRESENCE_MS, ROOM_INACTIVITY_MS } from '../server/rooms';
import { handleHttpGameApi } from '../server/httpGameApi';

async function launch(t: test.TestContext) {
  let now = 1000;
  const server = http.createServer(async (req, res) => {
    if (!(await handleHttpGameApi(req, res, service))) {
      res.writeHead(404);
      res.end();
    }
  });
  const service = attachRooms(server, { stateFile: null, now: () => now, tickMs: 1_000_000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as import('node:net').AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    service.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function request(
    route: string,
    body?: unknown,
    session?: { playerId: string; token: string },
  ) {
    const response = await fetch(url + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session
          ? {
              Authorization: `Bearer ${session.token}`,
              'X-Concordia-Player': session.playerId,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }
  return {
    service,
    request,
    url,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('v110 HTTP: cliente nativo e navegador compartilham lobby, ordens e estado privado', async (t) => {
  const { service, request, url } = await launch(t);
  const created = await request('/api/rooms', {
    name: 'Nativo',
    nationId: 'vespera',
    mode: 'campaign',
  });
  assert.equal(created.status, 201);
  const host = created.body;
  assert.match(host.code, /^[A-Z0-9]{6}$/);
  assert.ok(host.token.length > 30);
  assert.equal(host.state.players.length, 1);
  assert.equal((await request(`/api/rooms/${host.code}/state`)).status, 401);
  const browser = new WebSocket(url.replace('http:', 'ws:') + '/ws');
  t.after(() => browser.terminate());
  await once(browser, 'open');
  const browserJoined = new Promise<Record<string, unknown>>((resolve) => {
    browser.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'joined') resolve(message);
    });
  });
  browser.send(JSON.stringify({ type: 'join', code: host.code, name: 'Navegador' }));
  const joined = await browserJoined;
  assert.ok(joined.playerId);
  const command = (value: unknown) =>
    request(`/api/rooms/${host.code}/commands`, { command: value }, host);
  assert.equal((await command({ type: 'ADD_BOT' })).status, 200);
  const started = await command({ type: 'START_GAME' });
  assert.equal(started.status, 200);
  assert.equal(started.body.state.phase, 'planning');
  const player = started.body.state.players.find((p: { id: string }) => p.id === host.playerId);
  assert.equal(player.gold, 40);
  assert.ok(started.body.economy);
  assert.deepEqual(started.body.reserved, { gold: 0, manpower: 0, influence: 0 });
  const cities = started.body.state.provinces.filter(
    (p: { kind: string; ownerId: string }) => p.kind === 'LAND' && p.ownerId === host.playerId,
  );
  assert.equal(cities.length, 2);
  for (const city of cities) {
    assert.equal(started.body.orderCosts[city.id].build.MARKET.gold, 20);
    assert.equal(started.body.orderCosts[city.id].build.MARKET.manpower, 0);
    assert.equal(started.body.orderCosts[city.id].build.MARKET.influence, 0);
    assert.equal(
      (
        await command({
          type: 'SUBMIT_ORDER',
          order: { type: 'BUILD_BUILDING', provinceId: city.id, building: 'MARKET' },
        })
      ).status,
      200,
    );
  }
  const after = await request(`/api/rooms/${host.code}/state`, undefined, host);
  assert.equal(after.body.reserved.gold, 40);
  assert.equal(after.body.state.plannedOrders.length, 2);
  assert.equal('orders' in after.body.state, false);
  assert.equal('seed' in after.body.state, false);
  assert.equal(JSON.stringify(after.body).includes(host.token), false);
  assert.equal(JSON.stringify(after.body).includes('tokenHash'), false);
  assert.equal(service.rooms.get(host.code)!.game.orders[host.playerId].length, 2);
});

test('v110 HTTP: ready e declaração de guerra delegam ao mesmo motor autoritativo', async (t) => {
  const { service, request } = await launch(t);
  const { body: host } = await request('/api/rooms', {
    name: 'Nativo',
    mode: 'campaign',
    demo: true,
  });
  const room = service.rooms.get(host.code)!;
  room.game.graceUntilTurn = 0;
  const enemy = room.game.players.find((p) => p.id !== host.playerId)!;
  const war = await request(
    `/api/rooms/${host.code}/declare-war`,
    { targetRealmId: enemy.id, casusBelli: 'CONQUEST' },
    host,
  );
  assert.equal(war.status, 200);
  assert.equal(war.body.state.wars.filter((w: { active: boolean }) => w.active).length, 1);
  const before = war.body.state.turn;
  const ready = await request(`/api/rooms/${host.code}/ready`, { ready: true }, host);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.state.turn, before + 1);
  const invalid = await request(
    `/api/rooms/${host.code}/commands`,
    { command: { type: 'DELETE_ALL_ARMIES' } },
    host,
  );
  assert.equal(invalid.status, 400);
  assert.equal(room.game.turn, before + 1);
  assert.equal((await request(`/api/rooms/${host.code}/leave`, {}, host)).body.left, true);
  assert.equal(room.game.players.find((p) => p.id === host.playerId)!.online, false);
  assert.equal(room.game.paused, true);
});

test('v110 HTTP: polling mantém presença curta sem perpetuar salas; retomar exige credencial', async (t) => {
  const { service, request, advance } = await launch(t);
  const { body: host } = await request('/api/rooms', {
    name: 'Nativo',
    mode: 'campaign',
    demo: true,
  });
  const room = service.rooms.get(host.code)!;
  const activity = room.lastHumanActivityAt;
  advance(HTTP_PRESENCE_MS + 1);
  service.tick();
  assert.equal(room.game.players.find((p) => p.id === host.playerId)!.online, false);
  assert.equal(room.game.paused, true);
  const polled = await request(`/api/rooms/${host.code}/state`, undefined, host);
  assert.equal(polled.status, 200);
  assert.equal(room.lastHumanActivityAt, activity, 'polling não é uma ação humana');
  advance(ROOM_INACTIVITY_MS);
  assert.equal(service.cleanupInactiveRooms(), 1);
  assert.equal((await request(`/api/rooms/${host.code}/state`, undefined, host)).status, 410);
  assert.equal(service.rooms.size, 0);
  const denied = await request(`/api/rooms/${host.code}/resume`, {
    playerId: host.playerId,
    token: 'incorrect',
  });
  assert.ok(denied.status >= 400);
  assert.equal(service.rooms.size, 0);
  const restored = await request(`/api/rooms/${host.code}/resume`, {
    playerId: host.playerId,
    token: host.token,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.token, host.token);
  assert.equal(restored.body.state.code, host.code);
  assert.equal(service.rooms.size, 1);
});

test('v110 HTTP: saída do anfitrião nativo transfere controle ao humano conectado', async (t) => {
  const { service, request } = await launch(t);
  const { body: host } = await request('/api/rooms', { name: 'Anfitrião', mode: 'campaign' });
  const { body: guest } = await request(`/api/rooms/${host.code}/join`, { name: 'Convidado' });
  assert.equal((await request(`/api/rooms/${host.code}/leave`, {}, host)).status, 200);
  const room = service.rooms.get(host.code)!;
  assert.equal(room.game.hostId, guest.playerId);
  assert.equal(room.game.players.find((p) => p.id === host.playerId)!.online, false);
  const added = await request(
    `/api/rooms/${host.code}/commands`,
    {
      command: { type: 'ADD_BOT' },
    },
    guest,
  );
  assert.equal(added.status, 200);
  assert.equal(added.body.state.hostId, guest.playerId);
});

test('v110 HTTP: expiração da presença do anfitrião transfere controle sem expulsar o convidado ativo', async (t) => {
  const { service, request, advance } = await launch(t);
  const { body: host } = await request('/api/rooms', { name: 'Anfitrião', mode: 'campaign' });
  const { body: guest } = await request(`/api/rooms/${host.code}/join`, { name: 'Convidado' });
  advance(HTTP_PRESENCE_MS / 2);
  assert.equal((await request(`/api/rooms/${host.code}/state`, undefined, guest)).status, 200);
  advance(HTTP_PRESENCE_MS / 2 + 1);
  service.tick();
  const room = service.rooms.get(host.code)!;
  assert.equal(room.game.hostId, guest.playerId);
  assert.equal(room.game.players.find((p) => p.id === host.playerId)!.online, false);
  assert.equal(room.game.players.find((p) => p.id === guest.playerId)!.online, true);
  const added = await request(
    `/api/rooms/${host.code}/commands`,
    {
      command: { type: 'ADD_BOT' },
    },
    guest,
  );
  assert.equal(added.status, 200);
});
