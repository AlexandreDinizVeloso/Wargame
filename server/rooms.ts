import { prepareTutorial } from './tutorial';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  GameCommand,
  GameState,
  NationId,
  ServerMessage,
  Theater,
  PublicRoom,
} from '../shared/types';
import { NATIONS } from '../shared/rules';
import { parseCommand } from './commands';
import {
  addPlayer,
  allReady,
  assert,
  createGame,
  executeCommand,
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
function readCommand(msg: Record<string, unknown>): GameCommand {
  assert(msg.type === 'command', 'Cliente antigo: atualize a página para o protocolo 7.');
  return parseCommand(msg.command);
}
const nationOfMessage = (value: unknown): NationId | undefined => {
  if (value === undefined) return undefined;
  assert(
    NATIONS.some((n) => n.id === value),
    'Nação inválida.',
  );
  return value as NationId;
};
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
        saved.game.turnDeadlineAt = null;
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
          room.game.turnDeadlineAt = null;
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
        room.game.deadline = room.game.firstReadyPlayerName
          ? clock() + Math.max(1000, room.remainingMs)
          : null;
        room.game.turnDeadlineAt = room.game.deadline;
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
          assert(
            msg.tutorial === undefined || typeof msg.tutorial === 'boolean',
            'Opção de tutorial inválida.',
          );
          const tutorial = msg.tutorial === true;
          const g = createGame(
            code,
            tutorial || msg.mode === 'campaign' ? 'campaign' : 'quick',
            msg.demo === true || tutorial,
            randomBytes(4).readUInt32LE(),
            ['EUROPE', 'AMERICAS', 'ASIA'].includes(String(msg.theater))
              ? (msg.theater as Theater)
              : 'EUROPE',
          );
          g.roomName =
            typeof msg.roomName === 'string' && msg.roomName.trim()
              ? msg.roomName.trim().slice(0, 60)
              : `Campanha ${code}`;
          g.isPublic = !tutorial && msg.isPublic !== false;
          g.enableSecretObjectives = !tutorial && msg.enableSecretObjectives !== false;
          assert(
            msg.allowBotSecretVictory === undefined ||
              typeof msg.allowBotSecretVictory === 'boolean',
            'Opção de vitória de bots inválida.',
          );
          g.allowBotSecretVictory = msg.allowBotSecretVictory === true;
          g.matchConfig.allowBotSecretVictory = g.allowBotSecretVictory;
          if (msg.turnTimerSeconds !== undefined)
            assert(
              Number.isInteger(msg.turnTimerSeconds) &&
                Number(msg.turnTimerSeconds) >= 15 &&
                Number(msg.turnTimerSeconds) <= 600,
              'Timer deve ser 15–600 segundos.',
            );
          g.turnSeconds = tutorial ? 600 : Number(msg.turnTimerSeconds ?? 60);
          g.matchConfig.turnSeconds = g.turnSeconds;
          g.matchConfig.enableSecretObjectives = g.enableSecretObjectives;
          g.persistenceEnabled = !!options.stateFile;
          const p = addPlayer(
            g,
            typeof msg.name === 'string' ? msg.name : 'Estrategista',
            false,
            tutorial ? 'vespera' : nationOfMessage(msg.nationId),
          );
          const room: Room = {
            game: g,
            sessions: new Map(),
            touched: clock(),
            remainingMs: g.turnSeconds * 1000,
          };
          rooms.set(code, room);
          if (g.demo) {
            if (tutorial) {
              addPlayer(g, 'Conselho do Norte', true, 'ferro_norte', 'Diplomat');
              addPlayer(g, 'Conselho do Sul', true, 'kaldor', 'Merchant');
            } else for (let i = 0; i < 3; i++) addPlayer(g, `Conselho ${i + 1}`, true);
            startGame(g, clock());
            if (tutorial) prepareTutorial(g, p.id);
          }
          bind(room, p.id, randomBytes(24).toString('hex'));
          return;
        }
        if (msg.type === 'join') {
          const room = rooms.get(String(msg.code).trim().toUpperCase());
          assert(room, 'Sala não encontrada. Confira o código e o servidor.');
          assert(!room.game.matchConfig.tutorial, 'O tutorial é uma mesa de treino individual.');
          const p = addPlayer(
            room.game,
            typeof msg.name === 'string' ? msg.name : 'Estrategista',
            false,
            nationOfMessage(msg.nationId),
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
        ((room.game.deadline !== null && clock() >= room.game.deadline) || allReady(room.game))
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
          room.game.turnDeadlineAt = null;
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
    listPublicRooms: (): PublicRoom[] =>
      [...rooms.values()]
        .filter((r) => r.game.isPublic && r.game.phase !== 'finished')
        .map(({ game: g }) => ({
          roomId: g.code,
          roomName: g.roomName,
          hostName: g.players.find((p) => p.id === g.hostId)?.name ?? 'Anfitrião',
          theater:
            g.mode === 'campaign'
              ? 'Mapa-Múndi'
              : g.theater === 'EUROPE'
                ? 'Europa'
                : g.theater === 'AMERICAS'
                  ? 'Américas'
                  : 'Ásia',
          enableSecretObjectives: g.enableSecretObjectives,
          playersCount: g.players.length,
          maxPlayers: 8,
          status: g.phase === 'lobby' ? 'LOBBY' : 'IN_GAME',
          turn: g.turn,
        })),
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
