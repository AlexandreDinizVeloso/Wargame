import path from 'node:path';
import { syncNationAuthority } from '../shared/economy';
import { applyAfkRegency, restoreRegency, replaceableBot } from './regency';
import { issueDilemmas } from './dilemmas';
import { exportCampaign, importCampaign } from './campaignSaves';
import { SCENARIOS } from '../shared/scenarios';
import { createMapPing, pingRecipients } from './mapPings';
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
import { NATIONS, orderCost, realmEconomy, reservedResources } from '../shared/rules';
import { BUILDINGS, canBuild } from '../shared/development';
import { seasonAt } from '../shared/strategy';
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
import {
  readSnapshot,
  writeSnapshot,
  readRoomArchive,
  writeRoomArchive,
  type SavedRoom,
} from './storage';

interface Session {
  tokenHash: string;
  socket: WebSocket | null;
  httpSeenAt?: number;
}
export interface Room {
  game: GameState;
  sessions: Map<string, Session>;
  touched: number;
  remainingMs: number;
  lastHumanActivityAt: number;
}
interface Options {
  stateFile?: string | null;
  tickMs?: number;
  archiveDir?: string;
  now?: () => number;
}
export const ROOM_INACTIVITY_MS = 15 * 60 * 1000;
export const ROOM_CLEANUP_INTERVAL_MS = 60 * 1000;
export const HTTP_PRESENCE_MS = 15_000;
export class RoomSaveDownloadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
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
  const archiveDir =
    options.archiveDir ??
    (options.stateFile ? path.join(path.dirname(options.stateFile), 'archived-rooms') : null);
  const memoryArchives = new Map<string, SavedRoom>();
  let lastCleanupAt = clock();
  const lastPings = new WeakMap<Room, Map<string, number>>();
  let closed = false;
  if (options.stateFile)
    for (const saved of readSnapshot(options.stateFile)) {
      saved.game.persistenceEnabled = true;
      saved.game.season = seasonAt(saved.game.turn);
      saved.game.players.forEach((p) => {
        p.online = p.bot && !p.afkRegent;
        syncNationAuthority(p);
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
        lastHumanActivityAt:
          saved.lastHumanActivityAt ??
          (Number.isFinite(saved.touched) && saved.touched >= 0 ? saved.touched : clock()),
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
        lastHumanActivityAt: room.lastHumanActivityAt,
        remainingMs:
          room.game.deadline === null ? room.remainingMs : Math.max(0, room.game.deadline - now),
      })),
      now,
    );
  }
  function savedRoom(room: Room): SavedRoom {
    return {
      game: structuredClone(room.game),
      sessions: [...room.sessions.entries()].map(([playerId, session]) => ({
        playerId,
        tokenHash: session.tokenHash,
      })),
      touched: room.touched,
      lastHumanActivityAt: room.lastHumanActivityAt,
      remainingMs:
        room.game.deadline === null ? room.remainingMs : Math.max(0, room.game.deadline - clock()),
    };
  }
  function archivedRoom(code: string): SavedRoom | null {
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    return (
      memoryArchives.get(code) ??
      (archiveDir ? readRoomArchive(path.join(archiveDir, `${code}.json`)) : null)
    );
  }
  function hasSessionCredential(
    saved: Pick<SavedRoom, 'sessions'>,
    playerId: string,
    token: string,
  ): boolean {
    const session = saved.sessions.find((s) => s.playerId === playerId);
    const expected = Buffer.from(session?.tokenHash ?? '', 'hex');
    const incoming = Buffer.from(hashToken(token), 'hex');
    return (
      token.length > 0 && incoming.length === expected.length && timingSafeEqual(incoming, expected)
    );
  }
  function cleanupInactiveRooms(now = clock()): number {
    if (closed) return 0;
    let archived = 0;
    lastCleanupAt = now;
    for (const [code, room] of rooms) {
      if (now - room.lastHumanActivityAt < ROOM_INACTIVITY_MS) continue;
      try {
        const snapshot = savedRoom(room);
        if (archiveDir) writeRoomArchive(path.join(archiveDir, `${code}.json`), snapshot, now);
        if (!archiveDir) memoryArchives.set(code, snapshot);
        rooms.delete(code);
        try {
          persist();
        } catch (error) {
          rooms.set(code, room);
          throw error;
        }
        for (const session of room.sessions.values())
          if (session.socket) {
            send(session.socket, {
              type: 'error',
              message:
                'Sala arquivada após 15 minutos sem atividade humana. O progresso foi salvo; reconecte para retomar.',
            });
            session.socket.close(4004, 'Sala arquivada com progresso salvo.');
          }
        archived++;
      } catch (error) {
        console.error(
          error instanceof Error
            ? error.message
            : 'Falha ao arquivar sala; estado ativo preservado.',
        );
      }
    }
    return archived;
  }
  function downloadSave(code: string, playerId = '', token = '') {
    cleanupInactiveRooms();
    const normalized = code.trim().toUpperCase();
    const active = rooms.get(normalized);
    const snapshot = active ? savedRoom(active) : archivedRoom(normalized);
    if (!snapshot)
      throw new RoomSaveDownloadError(404, 'Sala ou arquivo de campanha não encontrado.');
    if (snapshot.game.hostId !== playerId || !hasSessionCredential(snapshot, playerId, token))
      throw new RoomSaveDownloadError(
        403,
        'Somente o anfitrião com sua credencial privada pode baixar o save completo.',
      );
    return exportCampaign(snapshot.game, playerId);
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 9 * 1024 * 1024 });
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
  /** Both transports hand the room to the first human who is still connected. */
  function handOffHost(room: Room) {
    const host = room.game.players.find((player) => player.id === room.game.hostId);
    if (!host || host.bot || !host.online)
      room.game.hostId =
        room.game.players.find((player) => !player.bot && player.online)?.id ?? room.game.hostId;
  }
  function activateSession(room: Room, id: string, token: string, socket: WebSocket | null) {
    const old = room.sessions.get(id)?.socket;
    room.sessions.set(id, {
      tokenHash: hashToken(token),
      socket,
      ...(socket ? {} : { httpSeenAt: clock() }),
    });
    room.touched = clock();
    room.lastHumanActivityAt = clock();
    room.game.season = seasonAt(room.game.turn);
    const resumed = room.game.players.find((p) => p.id === id)!;
    restoreRegency(resumed);
    syncNationAuthority(resumed);
    resumed.online = true;
    issueDilemmas(room.game);
    if (!room.game.players.find((p) => p.id === room.game.hostId)?.online) room.game.hostId = id;
    if (room.game.phase === 'planning' && room.game.paused) {
      room.game.paused = false;
      room.game.deadline = room.game.firstReadyPlayerName
        ? clock() + Math.max(1000, room.remainingMs)
        : null;
      room.game.turnDeadlineAt = room.game.deadline;
    }
    if (old && old !== socket) old.close(4001, 'Sessão aberta em outra conexão.');
    persist();
  }
  function authenticatedRoom(code: string, playerId: string, token: string): Room {
    cleanupInactiveRooms();
    const room = rooms.get(code.trim().toUpperCase());
    if (!room)
      throw new RoomSaveDownloadError(
        410,
        'Sala indisponível ou arquivada. Use Retomar com sua credencial privada.',
      );
    const session = room.sessions.get(playerId);
    if (
      !session ||
      !hasSessionCredential(
        { sessions: [{ playerId, tokenHash: session.tokenHash }] },
        playerId,
        token,
      )
    )
      throw new RoomSaveDownloadError(401, 'Credencial de jogador inválida.');
    session.httpSeenAt = clock();
    const player = room.game.players.find((p) => p.id === playerId)!;
    player.online = true;
    return room;
  }
  function httpState(room: Room, playerId: string) {
    refreshScores(room.game);
    const player = room.game.players.find((p) => p.id === playerId)!;
    const orderCosts = Object.fromEntries(
      room.game.provinces
        .filter((p) => p.kind === 'LAND' && p.ownerId === playerId)
        .map((province) => [
          province.id,
          {
            build: Object.fromEntries(
              Object.keys(BUILDINGS).map((key) => {
                const building = key as import('../shared/types').BuildingType;
                return [
                  building,
                  {
                    ...orderCost(
                      { type: 'BUILD_BUILDING', provinceId: province.id, building },
                      province,
                      player,
                      room.game,
                    ),
                    allowed: !province.occupierId && canBuild(province, building, player),
                  },
                ];
              }),
            ),
            recruit: Object.fromEntries(
              ['infantry', 'cavalry', 'artillery', 'warships', 'transports'].map((unit) => [
                unit,
                orderCost(
                  {
                    type: 'RECRUIT_BATTALION',
                    provinceId: province.id,
                    isFleet: ['warships', 'transports'].includes(unit),
                    [unit]: 1,
                  },
                  province,
                  player,
                  room.game,
                ),
              ]),
            ),
            pacify: orderCost(
              { type: 'PACIFY', provinceId: province.id },
              province,
              player,
              room.game,
            ),
          },
        ]),
    );
    return {
      state: viewFor(room.game, playerId),
      economy: realmEconomy(room.game, playerId),
      reserved: reservedResources(room.game, playerId),
      orderCosts,
    };
  }
  function httpEntry(message: Record<string, unknown>) {
    const { room, playerId, token } = enterRoom(message);
    activateSession(room, playerId, token, null);
    broadcast(room);
    return { code: room.game.code, playerId, token, ...httpState(room, playerId) };
  }
  function enterRoom(msg: Record<string, unknown>): {
    room: Room;
    playerId: string;
    token: string;
  } {
    if (msg.type === 'create') {
      assert(rooms.size < 200, 'Limite de salas atingido neste servidor.');
      let code = randomBytes(3).toString('hex').toUpperCase();
      while (rooms.has(code) || archivedRoom(code))
        code = randomBytes(3).toString('hex').toUpperCase();
      assert(
        msg.tutorial === undefined || typeof msg.tutorial === 'boolean',
        'Opção de tutorial inválida.',
      );
      const tutorial = msg.tutorial === true;
      const scenarioId = msg.scenarioId === undefined ? 'CLASSIC' : String(msg.scenarioId);
      const scenario = SCENARIOS.find((s) => s.id === scenarioId);
      assert(scenario, 'Cenário desconhecido.');
      const g = createGame(
        code,
        tutorial ? 'campaign' : (scenario.mode ?? (msg.mode === 'campaign' ? 'campaign' : 'quick')),
        msg.demo === true || tutorial,
        randomBytes(4).readUInt32LE(),
        scenario.theater ??
          (['EUROPE', 'AMERICAS', 'ASIA'].includes(String(msg.theater))
            ? (msg.theater as Theater)
            : 'EUROPE'),
      );
      if (!tutorial) {
        g.matchConfig.campaignId = randomBytes(16).toString('hex');
        g.matchConfig.ruleset = 'GOLD_098';
        g.matchConfig.scenarioId = scenario.id;
        g.matchConfig.createdVersion = '1.1.0';
        g.matchConfig.verticalSlice = true;
      }
      g.roomName =
        typeof msg.roomName === 'string' && msg.roomName.trim()
          ? msg.roomName.trim().slice(0, 60)
          : `Campanha ${code}`;
      g.isPublic = !tutorial && msg.isPublic !== false;
      g.enableSecretObjectives = !tutorial && msg.enableSecretObjectives !== false;
      assert(
        msg.allowBotSecretVictory === undefined || typeof msg.allowBotSecretVictory === 'boolean',
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
        lastHumanActivityAt: clock(),
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
      return { room, playerId: p.id, token: randomBytes(24).toString('hex') };
    }
    if (msg.type === 'join') {
      const room = rooms.get(String(msg.code).trim().toUpperCase());
      assert(room, 'Sala não encontrada. Confira o código e o servidor.');
      assert(!room.game.matchConfig.tutorial, 'O tutorial é uma mesa de treino individual.');
      const requested = nationOfMessage(msg.nationId);
      const availableBot = room.game.players.find(
        (p) =>
          replaceableBot(p) && !room.sessions.has(p.id) && (!requested || p.nationId === requested),
      );
      let p;
      if (room.game.phase !== 'lobby' || room.game.players.length >= 8) {
        assert(
          room.game.isPublic || room.game.phase === 'lobby',
          'Somente salas públicas permitem assumir um bot em campanha.',
        );
        assert(availableBot, 'Não há bot disponível para assumir.');
        p = availableBot;
        p.bot = false;
        p.afkRegent = false;
        p.afkStreak = 0;
        p.online = false;
        p.ready = false;
        p.name =
          typeof msg.name === 'string' ? msg.name.trim().slice(0, 30) || 'Convidado' : 'Convidado';
        room.game.orders[p.id] = [];
      } else
        p = addPlayer(
          room.game,
          typeof msg.name === 'string' ? msg.name : 'Estrategista',
          false,
          requested,
        );
      return { room, playerId: p.id, token: randomBytes(24).toString('hex') };
    }
    if (msg.type === 'resume') {
      const resumeCode = String(msg.code).trim().toUpperCase();
      let room = rooms.get(resumeCode);
      const token = typeof msg.token === 'string' ? msg.token : '';
      if (!room) {
        const saved = archivedRoom(resumeCode);
        if (saved && hasSessionCredential(saved, String(msg.playerId), token)) {
          const game = structuredClone(saved.game);
          game.paused = true;
          game.deadline = null;
          game.turnDeadlineAt = null;
          for (const player of game.players) player.online = player.bot && !player.afkRegent;
          room = {
            game,
            touched: clock(),
            lastHumanActivityAt: clock(),
            remainingMs: saved.remainingMs,
            sessions: new Map(
              saved.sessions.map((s) => [s.playerId, { tokenHash: s.tokenHash, socket: null }]),
            ),
          };
          rooms.set(resumeCode, room);
        }
      }
      const session = room?.sessions.get(String(msg.playerId));
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
      return { room, playerId: String(msg.playerId), token };
    }
    throw new Error('Entrada de sala inválida.');
  }
  function applyRoomCommand(room: Room, playerId: string, command: GameCommand) {
    const previous = room.game;
    const previousTouched = room.touched;
    const previousActivity = room.lastHumanActivityAt;
    const replacedSession =
      command.type === 'REPLACE_WITH_BOT' ? room.sessions.get(command.playerId) : undefined;
    const input = structuredClone(previous);
    restoreRegency(input.players.find((p) => p.id === playerId)!);
    if (input.paused) {
      input.paused = false;
      input.deadline = input.firstReadyPlayerName
        ? clock() + Math.max(1000, room.remainingMs)
        : null;
      input.turnDeadlineAt = input.deadline;
    }
    room.game = executeCommand(input, playerId, command, clock());
    room.touched = clock();
    room.lastHumanActivityAt = clock();
    if (command.type === 'REPLACE_WITH_BOT') room.sessions.delete(command.playerId);
    try {
      persist();
    } catch (error) {
      room.game = previous;
      room.touched = previousTouched;
      room.lastHumanActivityAt = previousActivity;
      if (command.type === 'REPLACE_WITH_BOT' && replacedSession)
        room.sessions.set(command.playerId, replacedSession);
      throw error;
    }
    broadcast(room);
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
        room.game.players.find((p) => p.id === playerId)!.online =
          session.httpSeenAt !== undefined && clock() - session.httpSeenAt <= HTTP_PRESENCE_MS;
        handOffHost(room);
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
      current = { room, playerId: id };
      activateSession(room, id, token, ws);
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
        if (msg.type === 'import_campaign') {
          assert(rooms.size < 200, 'Limite de salas atingido.');
          let code = randomBytes(3).toString('hex').toUpperCase();
          while (rooms.has(code) || archivedRoom(code))
            code = randomBytes(3).toString('hex').toUpperCase();
          const imported = importCampaign(msg.save, code),
            g = imported.game;
          g.persistenceEnabled = !!options.stateFile;
          const room: Room = {
            game: g,
            sessions: new Map(),
            touched: clock(),
            lastHumanActivityAt: clock(),
            remainingMs: g.turnSeconds * 1000,
          };
          const invites: import('../shared/types').SeatInvite[] = [];
          for (const p of g.players.filter((p) => !p.bot && p.id !== imported.hostId)) {
            const token = randomBytes(24).toString('hex');
            room.sessions.set(p.id, { tokenHash: hashToken(token), socket: null });
            invites.push({ code, playerId: p.id, name: p.name, token });
          }
          rooms.set(code, room);
          bind(room, imported.hostId, randomBytes(24).toString('hex'));
          send(ws, { type: 'seat_invites', invites });
          return;
        }
        if (['create', 'join', 'resume'].includes(msg.type)) {
          const entry = enterRoom(msg);
          bind(entry.room, entry.playerId, entry.token);
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
          rooms.get(room.game.code) === room,
          'Sala arquivada. Reconecte com sua credencial para retomar.',
        );
        assert(
          room.sessions.get(playerId)?.socket === ws,
          'Esta sessão está ativa em outra conexão.',
        );
        if (msg.type === 'export_campaign') {
          room.lastHumanActivityAt = clock();
          persist();
          send(ws, { type: 'campaign_export', save: exportCampaign(room.game, playerId) });
          return;
        }
        if (msg.type === 'map_ping') {
          const now = clock();
          const limits = lastPings.get(room) ?? new Map<string, number>();
          assert(
            now - (limits.get(playerId) ?? -Infinity) >= 1500,
            'Aguarde um instante antes de sinalizar novamente.',
          );
          const ping = createMapPing(room.game, playerId, msg.provinceId, msg.note, now);
          limits.set(playerId, now);
          lastPings.set(room, limits);
          room.lastHumanActivityAt = now;
          persist();
          for (const recipient of pingRecipients(room.game, playerId)) {
            const socket = room.sessions.get(recipient)?.socket;
            if (socket) send(socket, { type: 'map_ping', ping });
          }
          return;
        }
        applyRoomCommand(room, playerId, readCommand(msg));
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
    if (clock() - lastCleanupAt >= ROOM_CLEANUP_INTERVAL_MS) cleanupInactiveRooms();
    let changed = false;
    for (const room of rooms.values()) {
      let expiredPresence = false;
      for (const [id, session] of room.sessions) {
        if (session.httpSeenAt !== undefined && clock() - session.httpSeenAt > HTTP_PRESENCE_MS) {
          delete session.httpSeenAt;
          const player = room.game.players.find((p) => p.id === id);
          if (player && !session.socket) {
            player.online = false;
            expiredPresence = true;
          }
        }
      }
      if (expiredPresence) {
        handOffHost(room);
        if (!room.game.players.some((p) => !p.bot && p.online) && room.game.phase === 'planning') {
          room.remainingMs =
            room.game.deadline === null
              ? room.remainingMs
              : Math.max(0, room.game.deadline - clock());
          room.game.paused = true;
          room.game.deadline = null;
          room.game.turnDeadlineAt = null;
        }
        persist();
        broadcast(room);
      }
      if (
        room.game.phase === 'planning' &&
        !room.game.paused &&
        ((room.game.deadline !== null && clock() >= room.game.deadline) || allReady(room.game))
      ) {
        const previous = room.game,
          next = structuredClone(previous);
        if (previous.deadline !== null && clock() >= previous.deadline) applyAfkRegency(next);
        resolveTurn(next, clock());
        if (!next.players.some((p) => !p.bot && p.online)) {
          next.paused = true;
          next.deadline = null;
          next.turnDeadlineAt = null;
        }
        room.game = next;
        const previousActivity = room.lastHumanActivityAt;
        if (previous.players.some((p) => !p.bot && p.online && p.ready))
          room.lastHumanActivityAt = clock();
        try {
          persist();
          broadcast(room);
        } catch (error) {
          room.game = previous;
          room.lastHumanActivityAt = previousActivity;
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
    listPublicRooms: (onlyJoinable = false): PublicRoom[] => {
      cleanupInactiveRooms();
      return [...rooms.values()]
        .filter(
          (r) =>
            clock() - r.lastHumanActivityAt < ROOM_INACTIVITY_MS &&
            r.game.isPublic &&
            r.game.phase !== 'finished' &&
            (!onlyJoinable ||
              (r.game.phase === 'lobby' && r.game.players.length < 8) ||
              r.game.players.some((p) => replaceableBot(p) && !r.sessions.has(p.id))),
        )
        .map(({ game: g }) => ({
          scenario:
            SCENARIOS.find((s) => s.id === g.matchConfig.scenarioId)?.name ?? 'Configuração livre',
          replaceableBots: g.players.filter((p) => replaceableBot(p)).length,
          humanPlayersCount: g.players.filter((p) => !p.bot || p.afkRegent).length,
          joinable:
            (g.phase === 'lobby' && g.players.length < 8) ||
            g.players.some((p) => replaceableBot(p)),
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
        }));
    },
    http: {
      create: (message: Record<string, unknown>) => httpEntry({ ...message, type: 'create' }),
      join: (code: string, message: Record<string, unknown>) =>
        httpEntry({ ...message, type: 'join', code }),
      resume: (code: string, playerId: string, token: string) =>
        httpEntry({ type: 'resume', code, playerId, token }),
      state: (code: string, playerId: string, token: string) =>
        httpState(authenticatedRoom(code, playerId, token), playerId),
      command: (code: string, playerId: string, token: string, raw: unknown) => {
        const room = authenticatedRoom(code, playerId, token);
        applyRoomCommand(room, playerId, parseCommand(raw));
        tick();
        return httpState(room, playerId);
      },
      leave: (code: string, playerId: string, token: string) => {
        const room = authenticatedRoom(code, playerId, token);
        const session = room.sessions.get(playerId)!;
        delete session.httpSeenAt;
        if (!session.socket) room.game.players.find((p) => p.id === playerId)!.online = false;
        handOffHost(room);
        if (!room.game.players.some((p) => !p.bot && p.online) && room.game.phase === 'planning') {
          room.remainingMs =
            room.game.deadline === null
              ? room.remainingMs
              : Math.max(0, room.game.deadline - clock());
          room.game.paused = true;
          room.game.deadline = null;
          room.game.turnDeadlineAt = null;
        }
        persist();
        broadcast(room);
        return { left: true };
      },
    },
    cleanupInactiveRooms,
    downloadSave,
    archiveDir,
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
