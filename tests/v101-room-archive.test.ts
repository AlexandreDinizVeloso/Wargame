import { exportCampaign, importCampaign } from '../server/campaignSaves';
import {
  createGame,
  addPlayer,
  startGame,
  executeCommand,
  resolveTurn,
  submitOrder,
} from '../server/game';
import { fork } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket, type RawData } from 'ws';
import type { ServerMessage } from '../shared/types';
import { attachRooms, ROOM_INACTIVITY_MS, RoomSaveDownloadError } from '../server/rooms';
import { readSnapshot, readRoomArchive, validGame, writeSnapshot } from '../server/storage';
function receive<T extends ServerMessage['type']>(
  ws: WebSocket,
  type: T,
  predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
) {
  return new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', listen);
      reject(new Error(`Sem mensagem ${type}`));
    }, 4000);
    function listen(raw: RawData) {
      const m = JSON.parse(raw.toString());
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
  value: unknown,
  type: T,
  predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
) {
  const pending = receive(ws, type, predicate);
  ws.send(JSON.stringify(value));
  return pending;
}
async function launch(t: test.TestContext, archiveDir?: string) {
  let now = 1000;
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-archive-101-')),
    filename = path.join(directory, 'rooms.json'),
    server = http.createServer();
  const service = attachRooms(server, {
    stateFile: filename,
    archiveDir,
    now: () => now,
    tickMs: 1000000,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const sockets: WebSocket[] = [];
  t.after(async () => {
    service.close();
    sockets.forEach((s) => s.terminate());
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    sockets.push(ws);
    await once(ws, 'open');
    return ws;
  };
  return {
    service,
    directory,
    filename,
    connect,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
test('v101: aos 15 minutos arquiva estado e credenciais, remove lobby e permite recuperação autenticada', async (t) => {
  const env = await launch(t),
    ws = await env.connect();
  const host = await action(ws, { type: 'create', name: 'Anfitrião', isPublic: true }, 'joined');
  const room = env.service.rooms.get(host.code)!;
  const original = structuredClone(room.game);
  assert.equal(room.lastHumanActivityAt, env.now());
  env.advance(ROOM_INACTIVITY_MS - 1);
  assert.equal(env.service.listPublicRooms().length, 1);
  env.advance(1);
  assert.equal(env.service.listPublicRooms().length, 0);
  assert.equal(env.service.rooms.size, 0);
  assert.equal(readSnapshot(env.filename).length, 0);
  const archive = path.join(env.directory, 'archived-rooms', `${host.code}.json`);
  assert.ok(existsSync(archive));
  const saved = readRoomArchive(archive)!;
  assert.deepEqual(saved.game, original);
  assert.equal(saved.sessions[0].playerId, host.playerId);
  assert.equal(saved.sessions[0].tokenHash.length, 64);
  assert.throws(
    () => env.service.downloadSave(host.code),
    (error) => error instanceof RoomSaveDownloadError && error.status === 403,
  );
  assert.throws(
    () => env.service.downloadSave(host.code, host.playerId, 'wrong'),
    /credencial privada/,
  );
  assert.throws(
    () => env.service.downloadSave('../etc'),
    (error) => error instanceof RoomSaveDownloadError && error.status === 404,
  );
  const download = env.service.downloadSave(host.code, host.playerId, host.token);
  assert.equal(download.format, 'CONCORDIA_SAVE_098');
  assert.equal(download.game.code, host.code);
  assert.equal('sessions' in download, false);
  assert.ok(!JSON.stringify(download).includes('tokenHash'));
  const resumed = await env.connect();
  const joined = await action(
    resumed,
    { type: 'resume', code: host.code, playerId: host.playerId, token: host.token },
    'joined',
  );
  assert.equal(joined.playerId, host.playerId);
  assert.equal(env.service.rooms.size, 1);
  assert.equal(env.service.rooms.get(host.code)!.lastHumanActivityAt, env.now());
  assert.equal(env.service.listPublicRooms().length, 1);
});
test('v101: comandos humanos renovam o prazo e listagem limpa mesmo sem executar tick', async (t) => {
  const env = await launch(t),
    ws = await env.connect();
  const host = await action(ws, { type: 'create', name: 'Primeiro', isPublic: true }, 'joined');
  env.advance(14 * 60 * 1000);
  await action(
    ws,
    { type: 'command', command: { type: 'SET_PLAYER_NAME', name: 'Presente' } },
    'state',
    (m) => m.state.players[0].name === 'Presente',
  );
  const room = env.service.rooms.get(host.code)!;
  assert.equal(room.lastHumanActivityAt, env.now());
  env.advance(ROOM_INACTIVITY_MS - 1);
  assert.equal(env.service.listPublicRooms(true).length, 1);
  env.advance(1);
  assert.equal(env.service.listPublicRooms(true).length, 0);
  assert.equal(env.service.rooms.size, 0);
});
test('v101: falha de disco mantém a sala e esconde a entrada expirada sem perder o save', async (t) => {
  const invalid = mkdtempSync(path.join(os.tmpdir(), 'concordia-archive-block-'));
  const file = path.join(invalid, 'blocked');
  writeFileSync(file, 'arquivo');
  t.after(() => rmSync(invalid, { recursive: true, force: true }));
  const env = await launch(t, file),
    ws = await env.connect();
  const host = await action(ws, { type: 'create', name: 'A', isPublic: true }, 'joined');
  const before = readFileSync(env.filename, 'utf8');
  t.mock.method(console, 'error', () => {});
  env.advance(ROOM_INACTIVITY_MS);
  assert.equal(env.service.cleanupInactiveRooms(), 0);
  assert.equal(env.service.rooms.has(host.code), true);
  assert.equal(env.service.listPublicRooms().length, 0);
  assert.equal(readFileSync(env.filename, 'utf8'), before);
});
test('v101: arquivo arquivado continua recuperável depois de reiniciar o serviço', async (t) => {
  const env = await launch(t),
    ws = await env.connect();
  const host = await action(ws, { type: 'create', name: 'A', isPublic: false }, 'joined');
  env.advance(ROOM_INACTIVITY_MS);
  assert.equal(env.service.cleanupInactiveRooms(), 1);
  env.service.close();
  const server = http.createServer(),
    second = attachRooms(server, { stateFile: env.filename, now: env.now, tickMs: 1000000 });
  t.after(() => second.close());
  assert.equal(second.rooms.size, 0);
  const save = second.downloadSave(host.code, host.playerId, host.token);
  assert.equal(save.game.players[0].name, 'A');
  assert.equal(save.game.matchConfig.scenarioId, 'CLASSIC');
});

test('v101: endpoint HTTP baixa arquivo arquivado sem expor hashes e recusa pedido sem credencial', async (t) => {
  const env = await launch(t),
    ws = await env.connect();
  const host = await action(ws, { type: 'create', name: 'Guardião', isPublic: false }, 'joined');
  env.advance(ROOM_INACTIVITY_MS);
  env.service.cleanupInactiveRooms();
  env.service.close();
  const child = fork(path.resolve('server/index.ts'), ['--headless'], {
    execArgv: ['--import', 'tsx'],
    silent: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', ROOMS_STATE_FILE: env.filename },
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const ended = once(child, 'exit');
      child.kill('SIGTERM');
      await ended;
    }
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Servidor HTTP não iniciou.')), 10000);
    child.once('message', (m) => {
      if (m && typeof m === 'object' && 'port' in m) {
        clearTimeout(timeout);
        resolve(Number(m.port));
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Servidor encerrou ${code}.`));
    });
  });
  const base = `http://127.0.0.1:${port}/api/rooms/${host.code}/DownloadSave`;
  const denied = await fetch(base);
  assert.equal(denied.status, 403);
  const download = await fetch(base, {
    headers: { Authorization: `Bearer ${host.token}`, 'X-Concordia-Player': host.playerId },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.match(download.headers.get('content-disposition')!, /attachment/);
  const payload = (await download.json()) as { format: string; game: { code: string } };
  assert.equal(payload.format, 'CONCORDIA_SAVE_098');
  assert.equal(payload.game.code, host.code);
  assert.ok(!JSON.stringify(payload).includes('tokenHash'));
});

test('v101: saves rejeitam campos numéricos inválidos de comandos e dilemas sem exigir campos de saves antigos', () => {
  const game = createGame('VAL101', 'campaign');
  for (const name of ['A', 'B', 'C']) addPlayer(game, name);
  startGame(game);
  assert.equal(validGame(game), true);
  const nation = game.players[0],
    army = game.battalions[0];
  nation.dilemmaAttackUntilTurn = NaN;
  assert.equal(validGame(game), false);
  delete nation.dilemmaAttackUntilTurn;
  nation.dilemmaBuildingCredits = -1;
  assert.equal(validGame(game), false);
  delete nation.dilemmaBuildingCredits;
  army.blitzUntilTurn = 1.5;
  assert.equal(validGame(game), false);
  delete army.blitzUntilTurn;
  army.supplySabotagedUntilTurn = Infinity;
  assert.equal(validGame(game), false);
  delete army.supplySabotagedUntilTurn;
  assert.equal(validGame(game), true);
});

test('v101: sala legada sem atividade recente não ganha prazo artificial ao reiniciar', async (t) => {
  const env = await launch(t),
    ws = await env.connect();
  const host = await action(ws, { type: 'create', name: 'Legado', isPublic: true }, 'joined');
  env.service.close();
  const legacy = readSnapshot(env.filename);
  const originalGame = structuredClone(legacy[0].game),
    originalCredentials = structuredClone(legacy[0].sessions);
  delete legacy[0].lastHumanActivityAt;
  env.advance(ROOM_INACTIVITY_MS + 1);
  writeSnapshot(env.filename, legacy, env.now());
  const server = http.createServer(),
    second = attachRooms(server, { stateFile: env.filename, now: env.now, tickMs: 1000000 });
  t.after(() => second.close());
  assert.equal(second.rooms.get(host.code)!.lastHumanActivityAt, legacy[0].touched);
  assert.deepEqual(second.listPublicRooms(), []);
  assert.equal(second.rooms.size, 0);
  assert.equal(readSnapshot(env.filename).length, 0);
  const archived = readRoomArchive(
    path.join(env.directory, 'archived-rooms', `${host.code}.json`),
  )!;
  assert.deepEqual(archived.sessions, originalCredentials);
  assert.deepEqual(archived.game.provinces, originalGame.provinces);
  assert.deepEqual(archived.game.battalions, originalGame.battalions);
  assert.equal(second.downloadSave(host.code, host.playerId, host.token).game.code, host.code);
});

test('v101: estoque legado acima do novo teto persiste sem corte nem regeneração e continua utilizável', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-stock-101-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'rooms.json');
  const game = createGame('BANK01', 'campaign');
  for (const name of ['A', 'B', 'C']) addPlayer(game, name);
  startGame(game);
  const original = game.players[0];
  original.gold = 777;
  original.manpower = 250;
  original.manpowerCap = 400;
  original.influence = 23;
  original.prestige = 7;
  original.militaryXP = 49;
  const record = {
    game,
    sessions: [{ playerId: original.id, tokenHash: 'a'.repeat(64) }],
    touched: 1000,
    remainingMs: 60000,
  };
  writeSnapshot(filename, [record], 1000);
  const loaded = readSnapshot(filename)[0];
  const updated = executeCommand(loaded.game, original.id, {
    type: 'SET_PLAYER_NAME',
    name: 'Estoque preservado',
  });
  const nation = updated.players.find((player) => player.id === original.id)!;
  assert.equal(nation.gold, 777);
  assert.equal(nation.manpower, 250);
  assert.equal(nation.influence, 23);
  assert.equal(nation.prestige, 7);
  assert.equal(nation.militaryXP, 49);
  assert.ok(nation.manpowerCap >= 12 && nation.manpowerCap < 250);
  const lowerCap = nation.manpowerCap;
  assert.equal(validGame(updated), true);
  writeSnapshot(filename, [{ ...loaded, game: updated }], 2000);
  const restored = readSnapshot(filename)[0].game;
  assert.equal(restored.players[0].manpower, 250);
  assert.equal(restored.players[0].manpowerCap, lowerCap);
  resolveTurn(restored);
  assert.equal(restored.players[0].manpower, 250);
  const capital = restored.provinces.find((province) => province.capitalOf === original.id)!;
  submitOrder(restored, original.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: capital.id,
    infantry: 2,
  });
  resolveTurn(restored);
  assert.equal(restored.players[0].manpower, 248);
  assert.equal(restored.players[0].manpowerCap, lowerCap);
  assert.equal(validGame(restored), true);
  restored.players[0].manpower = -1;
  assert.equal(validGame(restored), false);
  restored.players[0].manpower = Infinity;
  assert.equal(validGame(restored), false);
});

for (const schemaVersion of [3, 4, 5, 6])
  test(`v101: snapshot v${schemaVersion} migra e reexporta o estoque legado sem debitá-lo para o novo teto`, (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), `concordia-stock-v${schemaVersion}-`));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'rooms.json'),
      game = createGame('MIG101', 'campaign');
    for (const name of ['A', 'B', 'C']) addPlayer(game, name);
    startGame(game);
    const original = game.players[0];
    original.gold = 777;
    original.manpower = 250;
    original.manpowerCap = 400;
    original.influence = 23;
    original.prestige = 7;
    original.militaryXP = 49;
    const geometry = game.provinces.map((province) => ({
      id: province.id,
      rings: province.rings,
      path: province.path,
      x: province.x,
      y: province.y,
    }));
    const credentials = [{ playerId: original.id, tokenHash: 'a'.repeat(64) }];
    writeFileSync(
      filename,
      JSON.stringify({
        schemaVersion,
        rooms: [
          {
            game: { ...game, version: schemaVersion },
            sessions: credentials,
            touched: 1000,
            remainingMs: 60000,
          },
        ],
      }),
    );
    const migrated = readSnapshot(filename)[0];
    assert.equal(migrated.game.version, 7);
    assert.equal(migrated.game.players[0].gold, 777);
    assert.equal(migrated.game.players[0].manpower, 250);
    assert.deepEqual(migrated.sessions, credentials);
    assert.deepEqual(
      migrated.game.provinces.map((province) => ({
        id: province.id,
        rings: province.rings,
        path: province.path,
        x: province.x,
        y: province.y,
      })),
      geometry,
    );
    const updated = executeCommand(migrated.game, original.id, {
      type: 'SET_PLAYER_NAME',
      name: 'Legado retomado',
    });
    assert.ok(updated.players[0].manpowerCap < 250);
    const save = exportCampaign(updated, updated.hostId),
      imported = importCampaign(save, 'MIG102');
    assert.equal(imported.game.players[0].gold, 777);
    assert.equal(imported.game.players[0].manpower, 250);
    assert.equal(imported.game.players[0].influence, 23);
    assert.equal(imported.game.players[0].prestige, 7);
    assert.equal(imported.game.players[0].militaryXP, 49);
    assert.equal(imported.game.players[0].manpowerCap, updated.players[0].manpowerCap);
    assert.equal(validGame(imported.game), true);
    writeSnapshot(filename, [{ ...migrated, game: imported.game }], 2000);
    assert.equal(readSnapshot(filename)[0].game.players[0].manpower, 250);
  });
