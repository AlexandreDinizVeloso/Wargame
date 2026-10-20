import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { GameCommand, GameState, Objective, ServerMessage } from '../shared/types';
import { FACTIONS, OBJECTIVES } from '../shared/types';
import {
  addPlayer,
  assert,
  createGame,
  executeCommand,
  parseOrder,
  refreshScores,
  resolveTurn,
  startGame,
  viewFor,
} from './game';
import { readSnapshot, writeSnapshot } from './storage';

interface Session {
  tokenHash: string;
  socket: WebSocket | null;
}
export interface Room {
  game: GameState;
  sessions: Map<string, Session>;
  touched: number;
  remainingMs: number;
}
interface Options {
  stateFile?: string | null;
  tickMs?: number;
  now?: () => number;
}
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const send = (ws: WebSocket, message: ServerMessage) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};
const objectiveOf = (value: unknown): Objective =>
  typeof value === 'string' && Object.hasOwn(OBJECTIVES, value) ? (value as Objective) : 'conquest';
function readCommand(msg: Record<string, unknown>): GameCommand {
  const raw = msg.type === 'command' ? msg.command : msg;
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'Comando inválido.');
  const c = raw as Record<string, unknown>;
  if (msg.type === 'command') {
    assert(typeof c.type === 'string', 'Comando inválido.');
    if (c.type === 'SUBMIT_ORDER') return { type: c.type, order: parseOrder(c.order) };
    if (c.type === 'CANCEL_ORDER') {
      assert(typeof c.key === 'string', 'Chave de ordem inválida.');
      return { type: c.type, key: c.key };
    }
    if (c.type === 'READY') {
      assert(typeof c.ready === 'boolean', 'Estado pronto inválido.');
      return { type: c.type, ready: c.ready };
    }
    if (c.type === 'ANSWER_OFFER') {
      assert(typeof c.offerId === 'string' && typeof c.accept === 'boolean', 'Resposta inválida.');
      return { type: c.type, offerId: c.offerId, accept: c.accept };
    }
    if (c.type === 'START_GAME' || c.type === 'ADD_BOT') return { type: c.type };
    if (c.type === 'SET_MODE') {
      assert(c.mode === 'quick' || c.mode === 'campaign', 'Modo inválido.');
      return { type: c.type, mode: c.mode };
    }
    if (c.type === 'SET_IDENTITY') {
      assert(
        typeof c.objective === 'string' &&
          Object.hasOwn(OBJECTIVES, c.objective) &&
          (c.doctrine === 'devout' || c.doctrine === 'tolerant'),
        'Identidade inválida.',
      );
      return { type: c.type, objective: c.objective as Objective, doctrine: c.doctrine };
    }
    if (c.type === 'REPLACE_WITH_BOT') {
      assert(typeof c.playerId === 'string', 'Jogador inválido.');
      return { type: c.type, playerId: c.playerId };
    }
    if (c.type === 'CHAT') {
      assert(typeof c.text === 'string', 'Mensagem inválida.');
      return { type: c.type, text: c.text };
    }
    throw new Error('Comando desconhecido.');
  }
  // Version 1 envelopes are translated at the transport boundary; the engine uses version 2 only.
  switch (msg.type) {
    case 'order':
      return { type: 'SUBMIT_ORDER', order: parseOrder(msg.order) };
    case 'cancel':
      return { type: 'CANCEL_ORDER', key: String(msg.provinceId) };
    case 'ready':
      return { type: 'READY', ready: msg.ready === true };
    case 'answer':
      return { type: 'ANSWER_OFFER', offerId: String(msg.offerId), accept: msg.accept === true };
    case 'start':
      return { type: 'START_GAME' };
    case 'addBot':
      return { type: 'ADD_BOT' };
    case 'mode':
      assert(msg.mode === 'quick' || msg.mode === 'campaign', 'Modo inválido.');
      return { type: 'SET_MODE', mode: msg.mode };
    case 'identity':
      return {
        type: 'SET_IDENTITY',
        objective: objectiveOf(msg.objective),
        doctrine: msg.doctrine === 'devout' ? 'devout' : 'tolerant',
      };
    case 'replaceBot':
      return { type: 'REPLACE_WITH_BOT', playerId: String(msg.playerId) };
    case 'chat':
      assert(typeof msg.text === 'string', 'Mensagem inválida.');
      return { type: 'CHAT', text: msg.text };
    case 'offer':
    case 'break':
      return {
        type: 'SUBMIT_ORDER',
        order: {
          type: 'DIPLOMACY',
          action: msg.type === 'offer' ? 'PROPOSE_ALLIANCE' : 'BREAK_ALLIANCE',
          targetRealmId: String(msg.to),
        },
      };
    default:
      throw new Error('Ação desconhecida.');
  }
}
export function attachRooms(server: Server, options: Options = {}) {
  const clock = options.now ?? Date.now,
    rooms = new Map<string, Room>();
  let closed = false;
  if (options.stateFile)
    for (const saved of readSnapshot(options.stateFile)) {
      saved.game.persistenceEnabled = true;
      saved.game.players.forEach((p) => {
        p.online = p.bot;
      });
      if (saved.game.phase === 'planning') {
        saved.game.paused = true;
        saved.game.deadline = null;
      }
      rooms.set(saved.game.code, {
        game: saved.game,
        touched: saved.touched,
        remainingMs: saved.remainingMs,
        sessions: new Map(
          saved.sessions.map((s) => [s.playerId, { tokenHash: s.tokenHash, socket: null }]),
        ),
      });
    }
  function persist() {
    if (!options.stateFile || closed) return;
    const now = clock();
    writeSnapshot(
      options.stateFile,
      [...rooms.values()].map((room) => ({
        game: room.game,
        sessions: [...room.sessions.entries()].map(([playerId, s]) => ({
          playerId,
          tokenHash: s.tokenHash,
        })),
        touched: room.touched,
        remainingMs:
          room.game.deadline === null ? room.remainingMs : Math.max(0, room.game.deadline - now),
      })),
      now,
    );
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const upgrade: Parameters<Server['on']>[1] = (
    request: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ) => {
    if (request.url?.split('?')[0] !== '/ws') return;
    if (request.headers.origin) {
      try {
        if (new URL(request.headers.origin).host !== request.headers.host) {
          socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  };
  server.on('upgrade', upgrade);
  function broadcast(room: Room) {
    refreshScores(room.game);
    for (const [id, s] of room.sessions)
      if (s.socket) send(s.socket, { type: 'state', state: viewFor(room.game, id) });
  }
  wss.on('connection', (ws) => {
    let current: { room: Room; playerId: string } | null = null,
      windowStart = clock(),
      messages = 0,
      alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    const ping = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30_000);
    function detach() {
      if (!current) return;
      const { room, playerId } = current,
        session = room.sessions.get(playerId);
      if (session?.socket === ws) {
        session.socket = null;
        room.game.players.find((p) => p.id === playerId)!.online = false;
        if (room.game.hostId === playerId)
          room.game.hostId = room.game.players.find((p) => !p.bot && p.online)?.id ?? playerId;
        if (room.game.phase === 'planning' && !room.game.players.some((p) => !p.bot && p.online)) {
          room.remainingMs =
            room.game.deadline === null
              ? room.remainingMs
              : Math.max(0, room.game.deadline - clock());
          room.game.deadline = null;
          room.game.paused = true;
        }
        persist();
        broadcast(room);
      }
      current = null;
    }
    function bind(room: Room, id: string, token: string) {
      detach();
      const old = room.sessions.get(id)?.socket;
      room.sessions.set(id, { tokenHash: hashToken(token), socket: ws });
      current = { room, playerId: id };
      room.touched = clock();
      room.game.players.find((p) => p.id === id)!.online = true;
      if (!room.game.players.find((p) => p.id === room.game.hostId)?.online) room.game.hostId = id;
      if (room.game.phase === 'planning' && room.game.paused) {
        room.game.paused = false;
        room.game.deadline = room.game.demo ? null : clock() + Math.max(15_000, room.remainingMs);
      }
      if (old && old !== ws) old.close(4001, 'Sessão aberta em outra conexão.');
      persist();
      send(ws, { type: 'joined', code: room.game.code, playerId: id, token });
      broadcast(room);
    }
    ws.on('message', (raw) => {
      if (clock() - windowStart > 1000) {
        windowStart = clock();
        messages = 0;
      }
      if (++messages > 35) {
        send(ws, { type: 'error', message: 'Muitas ações. Aguarde um instante.' });
        return;
      }
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        assert(
          msg && typeof msg === 'object' && !Array.isArray(msg) && typeof msg.type === 'string',
          'Mensagem inválida.',
        );
        if (msg.type === 'create') {
          assert(rooms.size < 200, 'Limite de salas atingido neste servidor.');
          let code = randomBytes(3).toString('hex').toUpperCase();
          while (rooms.has(code)) code = randomBytes(3).toString('hex').toUpperCase();
          const g = createGame(
            code,
            msg.mode === 'campaign' ? 'campaign' : 'quick',
            msg.demo === true,
            randomBytes(4).readUInt32LE(),
          );
          g.persistenceEnabled = !!options.stateFile;
          const p = addPlayer(
            g,
            typeof msg.name === 'string' ? msg.name : 'Estrategista',
            false,
            objectiveOf(msg.objective),
          );
          const room: Room = {
            game: g,
            sessions: new Map(),
            touched: clock(),
            remainingMs: g.turnSeconds * 1000,
          };
          rooms.set(code, room);
          if (g.demo) {
            for (let i = 0; i < 3; i++)
              addPlayer(
                g,
                `Conselho de ${FACTIONS[i + 1].nation}`,
                true,
                (['conquest', 'prosperity', 'faith'] as Objective[])[i],
              );
            startGame(g, clock());
          }
          bind(room, p.id, randomBytes(24).toString('hex'));
          return;
        }
        if (msg.type === 'join') {
          const room = rooms.get(String(msg.code).trim().toUpperCase());
          assert(room, 'Sala não encontrada. Confira o código e o servidor.');
          const p = addPlayer(
            room.game,
            typeof msg.name === 'string' ? msg.name : 'Estrategista',
            false,
            objectiveOf(msg.objective),
          );
          bind(room, p.id, randomBytes(24).toString('hex'));
          return;
        }
        if (msg.type === 'resume') {
          const room = rooms.get(String(msg.code)),
            session = room?.sessions.get(String(msg.playerId)),
            token = typeof msg.token === 'string' ? msg.token : '';
          const incoming = Buffer.from(hashToken(token), 'hex'),
            expected = Buffer.from(session?.tokenHash ?? '', 'hex');
          assert(
            room &&
              session &&
              token.length > 0 &&
              incoming.length === expected.length &&
              timingSafeEqual(incoming, expected),
            'Não foi possível recuperar a sessão. Confira a sala e o arquivo de campanhas do servidor.',
          );
          bind(room, String(msg.playerId), token);
          return;
        }
        if (msg.type === 'leave') {
          detach();
          send(ws, { type: 'left' });
          return;
        }
        assert(current, 'Entre em uma sala primeiro.');
        const { room, playerId } = current;
        assert(
          room.sessions.get(playerId)?.socket === ws,
          'Esta sessão está ativa em outra conexão.',
        );
        const command = readCommand(msg);
        const previous = room.game;
        const previousTouched = room.touched;
        const replacedSession =
          command.type === 'REPLACE_WITH_BOT' ? room.sessions.get(command.playerId) : undefined;
        room.game = executeCommand(previous, playerId, command, clock());
        room.touched = clock();
        if (command.type === 'REPLACE_WITH_BOT') room.sessions.delete(command.playerId);
        try {
          persist();
        } catch (error) {
          room.game = previous;
          room.touched = previousTouched;
          if (command.type === 'REPLACE_WITH_BOT' && replacedSession)
            room.sessions.set(command.playerId, replacedSession);
          throw error;
        }
        broadcast(room);
      } catch (error) {
        send(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível executar a ação.',
        });
      }
    });
    ws.on('close', () => {
      clearInterval(ping);
      if (closed) return;
      try {
        detach();
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Falha ao salvar a sessão.');
      }
    });
    ws.on('error', () => {});
  });
  function tick() {
    if (closed) return;
    let changed = false;
    for (const [code, room] of rooms) {
      if (
        room.game.phase === 'planning' &&
        !room.game.paused &&
        room.game.deadline !== null &&
        clock() >= room.game.deadline
      ) {
        const previous = room.game,
          next = structuredClone(previous);
        resolveTurn(next, clock());
        room.game = next;
        try {
          persist();
          broadcast(room);
        } catch (error) {
          room.game = previous;
          room.game.paused = true;
          room.game.deadline = null;
          for (const s of room.sessions.values())
            if (s.socket)
              send(s.socket, {
                type: 'error',
                message: 'Falha ao salvar campanha; o cronômetro foi pausado.',
              });
          console.error(error instanceof Error ? error.message : 'Falha de persistência.');
        }
        changed = true;
      }
      if (
        room.game.phase !== 'planning' &&
        clock() - room.touched > 24 * 60 * 60 * 1000 &&
        ![...room.sessions.values()].some((s) => s.socket)
      ) {
        rooms.delete(code);
        changed = true;
      }
    }
    if (changed) persist();
  }
  const timer = setInterval(() => {
    try {
      tick();
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Falha de persistência.');
    }
  }, options.tickMs ?? 1000);
  timer.unref();
  return {
    rooms,
    wss,
    persist,
    tick,
    close: () => {
      if (closed) return;
      persist();
      closed = true;
      clearInterval(timer);
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.off('upgrade', upgrade);
    },
  };
}
