import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket, type RawData } from 'ws';
import type { ServerMessage } from '../shared/types';

async function start(filename: string) {
  const child = fork(path.resolve('server/index.ts'), ['--headless'], {
    execArgv: ['--import', 'tsx'],
    silent: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', ROOMS_STATE_FILE: filename },
  });
  let diagnostics = '';
  child.stderr?.on('data', (chunk) => {
    diagnostics += String(chunk).slice(0, 2000);
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Servidor headless não iniciou. ${diagnostics}`));
    }, 10000);
    child.on('message', (message) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'listening' &&
        'port' in message &&
        typeof message.port === 'number'
      ) {
        clearTimeout(timer);
        resolve(message.port);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Servidor encerrou: ${code}. ${diagnostics}`));
    });
  });
  return { child, port };
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, 'exit');
  child.kill(signal);
  await ended;
}
function wait<T extends ServerMessage['type']>(
  ws: WebSocket,
  type: T,
  predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
) {
  return new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', listen);
      reject(new Error(`Mensagem ${type} não recebida.`));
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
  const response = wait(ws, type, predicate);
  ws.send(JSON.stringify(payload));
  return response;
}
async function connect(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.on('error', () => {});
  await once(ws, 'open');
  return ws;
}
test('servidor headless responde sem frontend e recupera a campanha após SIGKILL real', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-process-')),
    filename = path.join(directory, 'rooms.json');
  const children: ChildProcess[] = [],
    sockets: WebSocket[] = [];
  t.after(async () => {
    sockets.forEach((ws) => ws.terminate());
    for (const child of children) await stop(child);
    rmSync(directory, { recursive: true, force: true });
  });
  const initial = await start(filename);
  children.push(initial.child);
  const schema = (await fetch(`http://127.0.0.1:${initial.port}/api/schema`).then((r) =>
    r.json(),
  )) as {
    protocolVersion: number;
    map: { terrain: string; path: string }[];
    orderTypes: string[];
    skills: unknown[];
    dilemmas: unknown[];
    rivers: unknown[];
    impassableFeatures: unknown[];
    commanderTraits: Record<string, unknown>;
    buildings: Record<string, unknown>;
  };
  assert.equal(schema.protocolVersion, 7);
  for (const type of ['BUILD_BUILDING', 'DEMOLISH_BUILDING', 'ASSAULT_SIEGE', 'NAVAL_BRIDGE'])
    assert.ok(schema.orderTypes.includes(type));
  assert.equal(schema.skills.length, 16);
  assert.equal(schema.dilemmas.length, 10);
  assert.equal(schema.rivers.length, 11);
  assert.equal(schema.impassableFeatures.length, 4);
  assert.equal(Object.keys(schema.commanderTraits).length, 6);
  assert.equal(Object.keys(schema.buildings).length, 6);
  assert.equal(schema.map.filter((p) => p.terrain).length, 108);
  assert.ok(schema.map.every((p) => p.terrain && p.path));
  assert.equal((await fetch(`http://127.0.0.1:${initial.port}/`)).status, 404);
  const socket = await connect(initial.port);
  sockets.push(socket);
  const session = await action(socket, { type: 'create', name: 'Jogador headless' }, 'joined');
  for (let i = 0; i < 2; i++)
    await action(
      socket,
      { type: 'command', command: { type: 'ADD_BOT' } },
      'state',
      (m) => m.state.players.length === i + 2,
    );
  await action(
    socket,
    { type: 'command', command: { type: 'START_GAME' } },
    'state',
    (m) => m.state.phase === 'planning',
  );
  await action(
    socket,
    {
      type: 'command',
      command: { type: 'SUBMIT_ORDER', order: { type: 'TRAIN_BATTALION', battalionId: 'army-1' } },
    },
    'state',
    (m) => m.state.plannedOrders.length === 1,
  );
  const resolved = await action(
    socket,
    { type: 'command', command: { type: 'READY', ready: true } },
    'state',
    (m) => m.state.turn === 2,
  );
  await stop(initial.child, 'SIGKILL');
  const recovered = await start(filename);
  children.push(recovered.child);
  const resumed = await connect(recovered.port);
  sockets.push(resumed);
  const state = wait(resumed, 'state');
  await action(
    resumed,
    { type: 'resume', code: session.code, playerId: session.playerId, token: session.token },
    'joined',
  );
  const result = (await state).state;
  assert.equal(result.turn, 2);
  assert.deepEqual(result.provinces, resolved.state.provinces);
  assert.equal(result.players[0].gold, resolved.state.players[0].gold);
  assert.deepEqual(result.lastReport, resolved.state.lastReport);
  assert.equal(result.persistenceEnabled, true);
});
