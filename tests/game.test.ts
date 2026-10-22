import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPlayer,
  cancelOrder,
  createGame,
  executeCommand,
  resolveTurn,
  setMode,
  startGame,
  submitOrder,
  viewFor,
} from '../server/game';
import { reservedResources, unitCount, victoryStatus } from '../shared/rules';
import { declareWar } from '../server/diplomacy';
import { setup, army } from './fixtures';

test('início exige 3–8 jogadores, nações únicas e territórios sem sobreposição', () => {
  const g = createGame('START');
  assert.throws(() => startGame(g));
  addPlayer(g, 'A');
  assert.throws(() => addPlayer(g, 'Duplicado', false, 'aurelia'));
  addPlayer(g, 'B');
  assert.throws(() => startGame(g));
  for (let i = 2; i < 8; i++) addPlayer(g, String(i));
  assert.throws(() => addPlayer(g, 'Nove'));
  startGame(g);
  assert.equal(g.provinces.filter((p) => p.ownerId).length, 16);
  assert.equal(new Set(g.players.map((p) => p.nationId)).size, 8);
  assert.ok(g.battalions.every((a) => unitCount(a) > 0));
  assert.throws(() => setMode(g, 'campaign'));
});
test('troca de teatro no lobby reconstrói apenas o tabuleiro', () => {
  const g = createGame('LOBBY');
  addPlayer(g, 'A');
  setMode(g, 'quick', 'ASIA');
  assert.equal(g.players.length, 1);
  assert.equal(g.provinces.filter((p) => p.kind === 'LAND').length, 16);
  assert.ok(g.provinces.some((p) => p.id === 'japan'));
  setMode(g, 'campaign');
  assert.equal(g.provinces.filter((p) => p.kind === 'LAND').length, 56);
});
test('cidade e batalhão têm filas independentes; substituição e cancelamento liberam reservas', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'portugal');
  submitOrder(g, a.id, { type: 'TRAIN_BATTALION', battalionId: unit.id });
  submitOrder(g, a.id, { type: 'BUILD_MARKET', provinceId: 'portugal' });
  assert.equal(g.orders[a.id].length, 2);
  assert.equal(reservedResources(g, a.id).gold, 26);
  submitOrder(g, a.id, { type: 'PACIFY', provinceId: 'portugal' });
  assert.equal(reservedResources(g, a.id).gold, 14);
  cancelOrder(g, a.id, 'city:portugal');
  assert.equal(reservedResources(g, a.id).gold, 6);
});
test('comandos rejeitam batalhão alheio, rotas ilegais, NaN e valores fracionários', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    unit = army(g, a.id, 'portugal');
  for (const command of [
    { type: 'TRAIN_BATTALION', battalionId: unit.id },
    { type: 'MOVE_BATTALION', battalionId: unit.id, targetProvinceId: 'castile' },
  ] as const)
    assert.throws(() => submitOrder(g, b.id, command));
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: 'portugal', infantry: NaN }),
  );
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: 'portugal', infantry: 1.5 }),
  );
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: unit.id, path: ['japan'] }),
  );
});
test('mercenários imediatos respeitam ouro reservado, reserva humana e desconto mercante', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.gold = 22;
  submitOrder(g, a.id, { type: 'BUILD_MARKET', provinceId: 'portugal' });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'RECRUIT_BATTALION',
      provinceId: 'portugal',
      infantry: 1,
      isMercenary: true,
    }),
  );
  cancelOrder(g, a.id, 'city:portugal');
  const manpower = a.manpower;
  submitOrder(g, a.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: 'portugal',
    infantry: 2,
    isMercenary: true,
  });
  assert.equal(a.gold, 16.15);
  assert.equal(a.manpower, manpower);
  assert.equal(g.battalions[0].training, 1);
  assert.equal(g.battalions[0].isMercenary, true);
});
test('recrutamento de cidade reforça a entidade e dilui treinamento', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'portugal', { infantry: 3 });
  unit.training = 1.5;
  submitOrder(g, a.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: 'portugal',
    battalionId: unit.id,
    infantry: 2,
  });
  resolveTurn(g);
  assert.equal(unit.infantry, 5);
  assert.equal(unit.training, 1.3);
  assert.equal(g.battalions.filter((b) => b.ownerId === a.id).length, 1);
});
test('treinamento, divisão e fusão preservam composição, dono e quantidade', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'portugal', { infantry: 6, cavalry: 2, artillery: 2 });
  submitOrder(g, a.id, {
    type: 'SPLIT_BATTALION',
    battalionId: unit.id,
    composition: { infantry: 2, cavalry: 1, artillery: 1, warships: 0, transports: 0 },
  });
  resolveTurn(g);
  const second = g.battalions.find((b) => b.id !== unit.id)!;
  assert.equal(unitCount(unit) + unitCount(second), 10);
  submitOrder(g, a.id, {
    type: 'MERGE_BATTALIONS',
    battalionId: second.id,
    targetBattalionId: unit.id,
  });
  resolveTurn(g);
  assert.equal(unitCount(unit), 10);
  submitOrder(g, a.id, { type: 'TRAIN_BATTALION', battalionId: unit.id });
  resolveTurn(g);
  assert.ok(unit.training > 1.29);
});
test('marcha continua uma aresta por rodada e atravessar fronteira exige guerra ou acesso', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    unit = army(g, a.id, 'portugal', { infantry: 8 });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'MOVE_BATTALION',
      battalionId: unit.id,
      targetProvinceId: 'france',
    }),
  );
  declareWar(g, a.id, b.id, 'CONQUEST');
  g.provinces.find((p) => p.id === 'japan')!.ownerId = g.players[2].id;
  g.provinces.find((p) => p.id === 'france')!.ownerId = a.id;
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    path: ['castile', 'france'],
  });
  resolveTurn(g);
  assert.equal(unit.provinceId, 'castile');
  assert.deepEqual(unit.pathQueue, []);
  const fort = g.provinces.find((p) => p.id === 'castile')!;
  assert.equal(fort.occupierId, null);
  assert.equal(fort.siege?.progress, 1);
  resolveTurn(g);
  assert.equal(fort.occupierId, a.id);
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    targetProvinceId: 'france',
  });
  resolveTurn(g);
  assert.equal(unit.provinceId, 'france');
  assert.deepEqual(unit.pathQueue, []);
});
test('guarnição não é doada ao atravessar território com acesso militar', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    unit = army(g, a.id, 'portugal');
  g.relations.find((r) => r.a === a.id && r.b === b.id)!.militaryAccess.push(a.id);
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    targetProvinceId: 'castile',
  });
  resolveTurn(g);
  assert.equal(unit.provinceId, 'castile');
  assert.equal(unit.ownerId, a.id);
  assert.equal(g.provinces.find((p) => p.id === 'castile')!.ownerId, b.id);
  assert.equal(g.provinces.find((p) => p.id === 'castile')!.occupierId, null);
});
test('entrancheiramento cancela rota e não usa a ordem da cidade', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'portugal');
  unit.pathQueue = ['castile'];
  submitOrder(g, a.id, { type: 'ENTRENCH_BATTALION', battalionId: unit.id });
  submitOrder(g, a.id, { type: 'BUILD_FORT', provinceId: 'portugal' });
  resolveTurn(g);
  assert.equal(unit.entrenched, true);
  assert.equal(unit.provinceId, 'portugal');
  assert.equal(g.provinces[0].fortLevel, 1);
});
test('máquina de comandos não muda a entrada, inclusive em rejeições', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'portugal'),
    before = structuredClone(g);
  const command = {
    type: 'SUBMIT_ORDER',
    order: { type: 'TRAIN_BATTALION', battalionId: unit.id },
  } as const;
  assert.deepEqual(executeCommand(g, a.id, command), executeCommand(g, a.id, command));
  assert.deepEqual(g, before);
  assert.throws(() =>
    executeCommand(g, a.id, {
      type: 'SUBMIT_ORDER',
      order: { type: 'TRAIN_BATTALION', battalionId: 'falso' },
    }),
  );
  assert.deepEqual(g, before);
});
test('visões privadas escondem ordens, semente e caminhos adversários', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    unit = army(g, a.id, 'portugal');
  unit.pathQueue = ['castile'];
  submitOrder(g, a.id, { type: 'TRAIN_BATTALION', battalionId: unit.id });
  const own = viewFor(g, a.id),
    other = viewFor(g, b.id);
  assert.equal(own.plannedOrders.length, 1);
  assert.equal(other.plannedOrders.length, 0);
  assert.equal('seed' in other, false);
  assert.equal('orders' in other, false);
  assert.deepEqual(other.battalions[0].pathQueue, []);
});
test('dominação exige 75% com vassalos ponderados e a partida não acaba por rodadas', () => {
  const {
    g,
    players: [a],
  } = setup();
  assert.equal(victoryStatus(g), null);
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  lands.slice(0, Math.ceil(lands.length * 0.75)).forEach((p) => (p.ownerId = a.id));
  assert.equal(victoryStatus(g)?.objective, 'DOMINATION');
  const running = setup();
  running.g.maxTurns = 1;
  resolveTurn(running.g);
  assert.equal(running.g.phase, 'planning');
  assert.equal(running.g.finishReason, null);
});
