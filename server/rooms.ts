import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { GameState, Objective, Order } from '../shared/types';
import { FACTIONS, OBJECTIVES } from '../shared/types';
import {
  addPlayer,
  allReady,
  answerAlliance,
  assert,
  breakAlliance,
  cancelOrder,
  createGame,
  proposeAlliance,
  refreshScores,
  resolveTurn,
  setMode,
  startGame,
  submitOrder,
  viewFor,
} from './game';

interface Session {
  token: string;
  socket: WebSocket | null;
}
interface Room {
  game: GameState;
  sessions: Map<string, Session>;
  touched: number;
}
const send = (ws: WebSocket, data: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
};
const codeFor = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const objectiveOf = (value: unknown): Objective =>
  typeof value === 'string' && Object.hasOwn(OBJECTIVES, value) ? (value as Objective) : 'conquest';

export function attachRooms(server: Server) {
  const rooms = new Map<string, Room>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (request, socket, head) => {
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
  });
  function broadcast(room: Room) {
    refreshScores(room.game);
    for (const [id, session] of room.sessions)
      if (session.socket) send(session.socket, { type: 'state', state: viewFor(room.game, id) });
  }
  function maybeResolve(room: Room) {
    if (room.game.phase === 'planning' && allReady(room.game)) resolveTurn(room.game);
  }
  wss.on('connection', (ws) => {
    let current: { room: Room; playerId: string } | null = null;
    let windowStart = Date.now(),
      messages = 0,
      alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);
    function detach() {
      if (!current) return;
      const { room, playerId } = current,
        session = room.sessions.get(playerId);
      if (session?.socket === ws) {
        session.socket = null;
        const p = room.game.players.find((p) => p.id === playerId)!;
        p.online = false;
        if (room.game.hostId === playerId)
          room.game.hostId = room.game.players.find((p) => !p.bot && p.online)?.id ?? playerId;
        broadcast(room);
      }
      current = null;
    }
    function bind(room: Room, playerId: string, token: string) {
      detach();
      const previous = room.sessions.get(playerId)?.socket;
      room.sessions.set(playerId, { token, socket: ws });
      current = { room, playerId };
      room.game.players.find((p) => p.id === playerId)!.online = true;
      if (previous && previous !== ws) previous.close(4001, 'Sessão aberta em outra conexão.');
      send(ws, { type: 'joined', code: room.game.code, playerId, token });
      broadcast(room);
    }
    ws.on('message', (raw) => {
      if (Date.now() - windowStart > 1000) {
        windowStart = Date.now();
        messages = 0;
      }
      if (++messages > 35) {
        send(ws, { type: 'error', message: 'Muitas ações. Aguarde um instante.' });
        return;
      }
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        assert(
          msg && typeof msg === 'object' && typeof msg.type === 'string',
          'Mensagem inválida.',
        );
        if (msg.type === 'create') {
          assert(rooms.size < 200, 'Limite de salas atingido neste servidor.');
          let code = codeFor();
          while (rooms.has(code)) code = codeFor();
          const g = createGame(
            code,
            msg.mode === 'campaign' ? 'campaign' : 'quick',
            msg.demo === true,
          );
          const player = addPlayer(
            g,
            typeof msg.name === 'string' ? msg.name : 'Estrategista',
            false,
            objectiveOf(msg.objective),
          );
          const room: Room = { game: g, sessions: new Map(), touched: Date.now() };
          rooms.set(code, room);
          if (g.demo) {
            for (let i = 0; i < 3; i++)
              addPlayer(
                g,
                `Conselho de ${FACTIONS[i + 1].nation}`,
                true,
                (['conquest', 'prosperity', 'faith'] as Objective[])[i],
              );
            startGame(g);
          }
          bind(room, player.id, randomBytes(24).toString('hex'));
          return;
        }
        if (msg.type === 'join') {
          const room = rooms.get(String(msg.code).trim().toUpperCase());
          assert(room, 'Sala não encontrada. Confira o código e o servidor.');
          const player = addPlayer(
            room.game,
            typeof msg.name === 'string' ? msg.name : 'Estrategista',
            false,
            objectiveOf(msg.objective),
          );
          room.touched = Date.now();
          bind(room, player.id, randomBytes(24).toString('hex'));
          return;
        }
        if (msg.type === 'resume') {
          const room = rooms.get(String(msg.code)),
            session = room?.sessions.get(String(msg.playerId));
          const incoming = Buffer.from(typeof msg.token === 'string' ? msg.token : '');
          const expected = Buffer.from(session?.token ?? '');
          assert(
            room &&
              session &&
              incoming.length === expected.length &&
              incoming.length > 0 &&
              timingSafeEqual(incoming, expected),
            'Não foi possível recuperar a sessão. A sala pode ter encerrado com o servidor.',
          );
          bind(room, String(msg.playerId), session.token);
          return;
        }
        if (msg.type === 'leave') {
          detach();
          send(ws, { type: 'left' });
          return;
        }
        assert(current, 'Entre em uma sala primeiro.');
        const { room, playerId } = current,
          g = room.game,
          player = g.players.find((p) => p.id === playerId)!;
        assert(
          room.sessions.get(playerId)?.socket === ws,
          'Esta sessão está ativa em outra conexão.',
        );
        room.touched = Date.now();
        if (msg.type === 'addBot') {
          assert(g.hostId === playerId, 'Somente o anfitrião pode adicionar bots.');
          addPlayer(
            g,
            `Conselho de ${FACTIONS[g.players.length]?.nation ?? 'reserva'}`,
            true,
            (['conquest', 'prosperity', 'concord', 'faith'] as Objective[])[g.players.length % 4],
          );
        } else if (msg.type === 'start') {
          assert(g.hostId === playerId, 'Somente o anfitrião pode iniciar.');
          startGame(g);
        } else if (msg.type === 'mode') {
          assert(g.hostId === playerId, 'Somente o anfitrião pode mudar o modo.');
          setMode(g, msg.mode as 'quick' | 'campaign');
        } else if (msg.type === 'identity') {
          assert(g.phase === 'lobby', 'Escolha seus objetivos antes do início da campanha.');
          player.objective = objectiveOf(msg.objective);
          player.doctrine = msg.doctrine === 'devout' ? 'devout' : 'tolerant';
        } else if (msg.type === 'order') submitOrder(g, playerId, msg.order as Order);
        else if (msg.type === 'cancel') cancelOrder(g, playerId, String(msg.provinceId));
        else if (msg.type === 'ready') {
          assert(g.phase === 'planning', 'A campanha não está em andamento.');
          player.ready = msg.ready === true;
          maybeResolve(room);
        } else if (msg.type === 'offer') proposeAlliance(g, playerId, String(msg.to));
        else if (msg.type === 'answer')
          answerAlliance(g, playerId, String(msg.offerId), msg.accept === true);
        else if (msg.type === 'break') breakAlliance(g, playerId, String(msg.to));
        else if (msg.type === 'replaceBot') {
          assert(g.hostId === playerId, 'Somente o anfitrião pode substituir jogadores.');
          const target = g.players.find((p) => p.id === msg.playerId);
          assert(
            target && !target.online && !target.bot,
            'Somente jogadores desconectados podem ser substituídos.',
          );
          target.bot = true;
          target.ready = true;
          room.sessions.delete(target.id);
          maybeResolve(room);
        } else if (msg.type === 'chat') {
          assert(
            typeof msg.text === 'string' && msg.text.trim().length > 0 && msg.text.length <= 280,
            'Escreva uma mensagem de até 280 caracteres.',
          );
          g.chat.push({ id: (g.chat.at(-1)?.id ?? 0) + 1, playerId, text: msg.text.trim() });
          g.chat = g.chat.slice(-60);
        } else throw new Error('Ação desconhecida.');
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
      detach();
    });
    ws.on('error', () => {});
  });
  const timer = setInterval(() => {
    for (const [code, room] of rooms) {
      if (
        room.game.phase === 'planning' &&
        room.game.deadline &&
        Date.now() >= room.game.deadline
      ) {
        resolveTurn(room.game);
        broadcast(room);
      }
      if (
        Date.now() - room.touched > 24 * 60 * 60 * 1000 &&
        ![...room.sessions.values()].some((s) => s.socket)
      )
        rooms.delete(code);
    }
  }, 1000);
  timer.unref();
  return {
    rooms,
    wss,
    close: () => {
      clearInterval(timer);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
