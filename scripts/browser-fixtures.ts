import { createBattalion } from '../server/state';
import { compositionOf } from '../shared/rules';
import { syncNationAuthority } from '../shared/economy';
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
  host.influence = 40;
  syncNationAuthority(host);
  const war = declareWar(alerts, attacker.id, host.id, 'CONQUEST');
  const invasion = alerts.battalions.find((a) => a.ownerId === attacker.id && !a.isFleet)!;
  invasion.infantry = 24;
  invasion.provinceId = 'castile';
  resolveBattle(
    alerts,
    invasion,
    alerts.provinces.find((p) => p.id === 'castile')!,
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
        i < Math.ceil(sandbox.provinces.filter((p) => p.kind === 'LAND').length * 0.75)
          ? sandbox.players[0].id
          : i === Math.ceil(sandbox.provinces.filter((p) => p.kind === 'LAND').length * 0.75)
            ? sandbox.players[1].id
            : sandbox.players[2].id;
      p.occupierId = null;
      p.pacification = 100;
      p.unrest = 0;
    });
  resolveTurn(sandbox);
  const transport = createGame('FERRY6', 'campaign', false, 123);
  for (const n of ['vespera', 'ferro_norte', 'kaldor'] as const) addPlayer(transport, n, false, n);
  startGame(transport);
  transport.isPublic = false;
  transport.players[0].gold = 100;
  const lobby = createGame('LOBBY6', 'campaign', false, 123);
  addPlayer(lobby, 'Anfitrião', false, 'vespera');
  addPlayer(lobby, 'Convidado', false, 'sol_invicto');
  addPlayer(lobby, 'Conselho 3', true, 'aurelia');
  addPlayer(lobby, 'Conselho 4', true, 'ferro_norte');
  lobby.isPublic = false;
  const visual = structuredClone(alerts);
  visual.code = 'VISRC9';
  visual.turn = 4;
  visual.season = 'WINTER';
  visual.players[0].influence = 30;
  syncNationAuthority(visual.players[0]);
  visual.players[0].activeDilemma = {
    id: 'military-council',
    turn: 4,
    targetProvinceId: 'castile',
  };
  const councilPolicy = make('POL101'),
    councilCrisis = make('CRS101');
  for (const [game, card] of [
    [councilPolicy, 'succession'],
    [councilCrisis, 'mint'],
  ] as const) {
    game.turn = 4;
    game.players[0].activeDilemma = { id: card, turn: 4, targetProvinceId: 'castile' };
  }
  const recruitment = make('MASS01');
  recruitment.turn = 1;
  recruitment.players[0].gold = 100;
  recruitment.players[0].manpower = 10;
  const recruitmentOwner = recruitment.players[0];
  for (const id of ['castile', 'france', 'italy']) {
    const province = recruitment.provinces.find((p) => p.id === id)!;
    Object.assign(province, {
      ownerId: recruitmentOwner.id,
      occupierId: null,
      siege: null,
      barracksLevel: 0,
      foundryLevel: 0,
      marketLevel: 0,
      pacification: 100,
      unrest: 0,
      religion: recruitmentOwner.faith,
      strategicResource: null,
    });
    recruitment.battalions = recruitment.battalions.filter(
      (a) => a.ownerId !== 'NEUTRAL' || a.provinceId !== id,
    );
  }
  recruitment.orders[recruitmentOwner.id] = [{ type: 'BUILD_MARKET', provinceId: 'castile' }];
  const structures = [
    'fortLevel',
    'barracksLevel',
    'marketLevel',
    'portLevel',
    'foundryLevel',
    'templeLevel',
  ] as const;
  visual.provinces
    .filter((p) => p.kind === 'LAND')
    .slice(0, 6)
    .forEach((p, i) => {
      p[structures[i]] = Math.max(1, p[structures[i]]);
      if (p.siege) p.siege.required = 2 + p.fortLevel * 2;
    });
  const owner = visual.players[0].id;
  const artillery = createBattalion(
    visual,
    owner,
    'castile',
    compositionOf({ infantry: 3, artillery: 2 }),
    { name: 'Canhões da Coroa', morale: 18 },
  );
  artillery.entrenched = true;
  artillery.encircled = true;
  createBattalion(visual, owner, 'france', compositionOf({ infantry: 1, cavalry: 4 }), {
    name: 'Cavalaria Real',
    morale: 75,
  });
  const navy = createBattalion(
    visual,
    owner,
    'mediterranean',
    compositionOf({ warships: 3, transports: 2 }),
    { name: 'Galeões Reais', morale: 80, isFleet: true },
  );
  const cargo = createBattalion(visual, owner, 'castile', compositionOf({ infantry: 4 }), {
    name: 'Fuzileiros embarcados',
    morale: 80,
  });
  cargo.provinceId = 'mediterranean';
  navy.embarkedArmyId = cargo.id;
  cargo.embarkedOnId = navy.id;
  const general = visual.commanders.find((c) => c.ownerId === owner && !c.isAdmiral);
  if (general) {
    general.assignedBattalionId = artillery.id;
    general.stars = 3;
    general.xp = 100;
  }
  const sessions = new Map<string, FixtureSession[]>();
  const gold = createGame('GOLD98', 'campaign', false, 98);
  gold.matchConfig.ruleset = 'GOLD_098';
  gold.matchConfig.createdVersion = '0.98.0';
  gold.matchConfig.scenarioId = 'SHATTERED_EMPIRES';
  gold.matchConfig.campaignId = 'browser-gold-098';
  for (const nation of ['vespera', 'aurelia', 'kaldor'] as const)
    addPlayer(gold, nation, false, nation);
  startGame(gold);
  gold.isPublic = false;
  const goldWar = declareWar(gold, gold.players[0].id, gold.players[1].id, 'CONQUEST');
  const captured = gold.provinces.filter((p) => p.ownerId === gold.players[1].id).slice(0, 2);
  for (const p of captured) p.occupierId = gold.players[0].id;
  goldWar.battleWins = 5;
  resolveTurn(gold);
  const cinematic = make('VERT99');
  cinematic.matchConfig.ruleset = 'GOLD_098';
  cinematic.matchConfig.verticalSlice = true;
  cinematic.matchConfig.createdVersion = '0.99.0';
  cinematic.matchConfig.campaignId = 'browser-vertical-099';
  cinematic.graceUntilTurn = 0;
  cinematic.enableSecretObjectives = false;
  cinematic.matchConfig.enableSecretObjectives = false;
  const [cinHost, cinEnemy] = cinematic.players;
  cinHost.gold = 500;
  cinHost.influence = 40;
  cinHost.militaryXP = 30;
  declareWar(cinematic, cinEnemy.id, cinHost.id, 'CONQUEST');
  const clash = createBattalion(
    cinematic,
    cinEnemy.id,
    'castile',
    compositionOf({ infantry: 14, cavalry: 2, artillery: 1 }),
    { morale: 90, training: 1.2, name: 'Coluna de Invasão' },
  );
  const cinematicReport = emptyTurnReport(cinematic.turn, cinematic.diet);
  resolveBattle(
    cinematic,
    clash,
    cinematic.provinces.find((p) => p.id === 'castile')!,
    cinematicReport,
  );
  cinematic.lastReport = cinematicReport;
  cinematic.reports.push(cinematicReport);
  cinematic.history.push({
    ...structuredClone(cinematicReport),
    nations: structuredClone(cinematic.players),
    wars: structuredClone(cinematic.wars),
    control: cinematic.provinces.map((p) => ({
      provinceId: p.id,
      ownerId: p.ownerId,
      occupierId: p.occupierId,
    })),
  });
  createBattalion(cinematic, cinEnemy.id, 'japan', compositionOf({ infantry: 20 }), {
    morale: 80,
    name: 'Exército secreto no Japão',
  });
  const rooms = [
    alerts,
    sandbox,
    transport,
    lobby,
    visual,
    gold,
    cinematic,
    councilPolicy,
    councilCrisis,
    recruitment,
  ].map((game: GameState) => {
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
    cinematic: sessions.get('VERT99')!,
    councilPolicy: sessions.get('POL101')!,
    councilCrisis: sessions.get('CRS101')!,
    recruitment: sessions.get('MASS01')!,
    gold: sessions.get('GOLD98')!,
    visual: sessions.get('VISRC9')!,
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
