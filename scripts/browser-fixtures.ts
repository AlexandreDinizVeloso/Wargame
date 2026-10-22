import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGame, addPlayer, startGame, resolveTurn } from '../server/game';
import { declareWar, offerPeace } from '../server/diplomacy';
import { resolveBattle } from '../server/combat';
import { writeSnapshot } from '../server/storage';
import { emptyTurnReport, type GameState, type GameView } from '../shared/types';
export interface FixtureSession {
  code: string;
  playerId: string;
  token: string;
}
export function seedBrowserFixtures(filename: string) {
  const make = (code: string) => {
    const g = createGame(code, 'campaign', false, 123);
    for (const n of ['vespera', 'aurelia', 'ferro_norte'] as const) addPlayer(g, n, false, n);
    startGame(g);
    g.isPublic = false;
    g.turn = 3;
    return g;
  };
  const alerts = make('ALERT6'),
    [host, attacker] = alerts.players;
  host.gold = 200;
  const war = declareWar(alerts, attacker.id, host.id, 'CONQUEST');
  const invasion = alerts.battalions.find((a) => a.ownerId === attacker.id && !a.isFleet)!;
  invasion.infantry = 24;
  invasion.provinceId = 'portugal';
  resolveBattle(
    alerts,
    invasion,
    alerts.provinces.find((p) => p.id === 'portugal')!,
    emptyTurnReport(3, alerts.diet),
  );
  offerPeace(alerts, attacker.id, war.id, []);
  const sandbox = make('SANDB6');
  sandbox.battalions = [];
  for (const c of sandbox.commanders) c.assignedBattalionId = null;
  sandbox.enableSecretObjectives = false;
  sandbox.matchConfig.enableSecretObjectives = false;
  sandbox.provinces
    .filter((p) => p.kind === 'LAND')
    .forEach((p, i) => {
      p.ownerId =
        i < 42 ? sandbox.players[0].id : i === 42 ? sandbox.players[1].id : sandbox.players[2].id;
      p.occupierId = null;
      p.pacification = 100;
      p.unrest = 0;
    });
  resolveTurn(sandbox);
  const transport = createGame('FERRY6', 'campaign', false, 123);
  for (const n of ['vespera', 'ferro_norte', 'kaldor'] as const) addPlayer(transport, n, false, n);
  startGame(transport);
  transport.isPublic = false;
  const lobby = createGame('LOBBY6', 'campaign', false, 123);
  addPlayer(lobby, 'Anfitrião', false, 'vespera');
  addPlayer(lobby, 'Convidado', false, 'sol_invicto');
  addPlayer(lobby, 'Conselho 3', true, 'aurelia');
  addPlayer(lobby, 'Conselho 4', true, 'ferro_norte');
  lobby.isPublic = false;
  const sessions = new Map<string, FixtureSession[]>();
  const rooms = [alerts, sandbox, transport, lobby].map((game: GameState) => {
    const auth = game.players.map((p) => ({
      code: game.code,
      playerId: p.id,
      token: randomBytes(24).toString('hex'),
    }));
    sessions.set(game.code, auth);
    return {
      game,
      touched: Date.now(),
      remainingMs: 60000,
      sessions: auth.map((s) => ({
        playerId: s.playerId,
        tokenHash: createHash('sha256').update(s.token).digest('hex'),
      })),
    };
  });
  writeSnapshot(filename, rooms, Date.now());
  return {
    lobby: sessions.get('LOBBY6')!,
    alerts: sessions.get('ALERT6')!,
    sandbox: sessions.get('SANDB6')!,
    transport: sessions.get('FERRY6')!,
    warId: war.id,
  };
}
export async function fixturePeer(base: string, session: FixtureSession) {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  let state: GameView | undefined;
  socket.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === 'state') state = m.state;
  });
  const until = async (predicate: (g: GameView) => boolean) => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      if (state && predicate(state)) return state;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Estado da sessão de teste não chegou.');
  };
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'resume', ...session }));
  await until(() => true);
  return {
    socket,
    until,
    send: (command: import('../shared/types').GameCommand) =>
      socket.send(JSON.stringify({ type: 'command', command })),
  };
}
