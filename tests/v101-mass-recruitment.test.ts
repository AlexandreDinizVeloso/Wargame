import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, resolveTurn, submitOrder, viewFor } from '../server/game';
import { declareWar } from '../server/diplomacy';
import { planMassRecruitment, MAX_MASS_RECRUITMENT } from '../shared/massRecruitment';
import { landCount, orderKey, reservedResources } from '../shared/rules';
import type { GameCommand, GameState, RecruitmentComposition } from '../shared/types';
import { createBattalion } from '../server/state';
import { compositionOf } from '../shared/rules';
import { army, setup } from './fixtures';

const request = (infantry = 0, cavalry = 0, artillery = 0): RecruitmentComposition => ({
  infantry,
  cavalry,
  artillery,
});
const province = (g: GameState, id: string) => g.provinces.find((p) => p.id === id)!;
function recruitmentFixture() {
  const f = setup();
  const me = f.players[0];
  me.nationId = 'aurelia';
  me.gold = 1000;
  me.manpower = 100;
  for (const id of ['castile', 'italy', 'balkans']) {
    const city = province(f.g, id);
    Object.assign(city, {
      ownerId: me.id,
      occupierId: null,
      siege: null,
      religion: me.faith,
      pacification: 100,
      unrest: 0,
      barracksLevel: 0,
      foundryLevel: 0,
      marketLevel: 0,
      recruitmentTurn: 0,
      recruitedThisTurn: 0,
    });
  }
  return { ...f, me };
}

test('v101: orçamento exato de 20,40 paga três ordens de 6,80 sem erro binário', () => {
  const { g, me } = recruitmentFixture();
  me.gold = 20.4;
  for (const id of ['castile', 'italy', 'balkans']) province(g, id).strategicResource = 'IRON';
  const plan = planMassRecruitment(g, me.id, request(3));
  assert.equal(plan.allocated.infantry, 3);
  assert.equal(plan.orders.length, 3);
  assert.equal(plan.cost.gold, 20.4);
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(3) });
  assert.deepEqual(next.orders[me.id], plan.orders);
  assert.equal(reservedResources(next, me.id).gold, 20.4);
});

test('v101: orçamento exato após duas reservas mantém a terceira cidade disponível', () => {
  const { g, me } = recruitmentFixture();
  me.gold = 20.4;
  for (const id of ['castile', 'italy', 'balkans']) province(g, id).strategicResource = 'IRON';
  for (const id of ['castile', 'italy'])
    submitOrder(g, me.id, { type: 'RECRUIT_BATTALION', provinceId: id, infantry: 1 });
  const plan = planMassRecruitment(g, me.id, request(1));
  assert.equal(plan.allocated.infantry, 1);
  assert.equal(plan.orders[0].provinceId, 'balkans');
  assert.equal(plan.cost.gold, 6.8);
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(1) });
  assert.equal(next.orders[me.id].length, 3);
  assert.equal(reservedResources(next, me.id).gold, 20.4);
});

test('v101: recrutamento em massa distribui tropas e o servidor enfileira exatamente a prévia pura', () => {
  const { g, me } = recruitmentFixture();
  province(g, 'italy').barracksLevel = 1;
  province(g, 'balkans').foundryLevel = 1;
  const existing = army(g, me.id, 'castile', { infantry: 3 });
  const composition = request(6, 2, 2),
    before = structuredClone(g);
  const plan = planMassRecruitment(g, me.id, composition);
  assert.deepEqual(g, before);
  assert.deepEqual(plan.allocated, composition);
  assert.deepEqual(plan.unfilled, request());
  assert.equal(plan.orders.length, 3);
  assert.deepEqual(
    plan.byProvince.map((row) => [row.provinceId, row.composition]),
    [
      ['balkans', request(4)],
      ['castile', request(2)],
      ['italy', request(0, 2, 2)],
    ],
  );
  assert.equal(
    plan.orders.find((order) => order.provinceId === 'castile')!.battalionId,
    existing.id,
  );
  assert.deepEqual(planMassRecruitment(viewFor(g, me.id), me.id, composition), plan);
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition });
  assert.deepEqual(g, before);
  assert.deepEqual(next.orders[me.id], plan.orders);
  assert.equal(next.battalions.length, g.battalions.length, 'A entrega aguarda a resolução.');
  assert.equal(next.players[0].gold, me.gold);
  assert.equal(next.players[0].manpower, me.manpower);
  const reserved = reservedResources(next, me.id);
  assert.deepEqual(
    [reserved.gold, reserved.manpower, reserved.influence],
    [plan.cost.gold, plan.cost.manpower, plan.cost.authority],
  );
  const troopsBefore = g.battalions
    .filter((a) => a.ownerId === me.id)
    .reduce((n, a) => n + landCount(a), 0);
  const report = resolveTurn(next);
  assert.equal(
    next.battalions.filter((a) => a.ownerId === me.id).reduce((n, a) => n + landCount(a), 0),
    troopsBefore + 10,
  );
  assert.equal(next.battalions.find((a) => a.id === existing.id)!.infantry, 5);
  assert.ok(next.battalions.every((a) => next.provinces.some((p) => p.id === a.provinceId)));
  assert.ok(
    Math.abs(
      next.players[0].gold -
        (me.gold - plan.cost.gold + report.economy.find((e) => e.playerId === me.id)!.net),
    ) < 0.02,
  );
});

test('v101: atendimento parcial respeita ouro/recrutas livres e preserva ordens de cidade e formação', () => {
  const { g, me } = recruitmentFixture();
  me.gold = 50;
  me.manpower = 5;
  const unit = army(g, me.id, 'castile');
  submitOrder(g, me.id, { type: 'BUILD_MARKET', provinceId: 'castile' });
  submitOrder(g, me.id, { type: 'ENTRENCH_BATTALION', battalionId: unit.id });
  const old = structuredClone(g.orders[me.id]);
  const plan = planMassRecruitment(g, me.id, request(8));
  assert.deepEqual(plan.allocated, request(3));
  assert.deepEqual(plan.unfilled, request(5));
  assert.equal(plan.cost.gold, 24);
  assert.equal(plan.cost.manpower, 3);
  assert.ok(plan.reasons.some((reason) => reason.includes('preservadas')));
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(8) });
  assert.deepEqual(next.orders[me.id].slice(0, old.length), old);
  assert.deepEqual(next.orders[me.id].slice(old.length), plan.orders);
  assert.equal(new Set(next.orders[me.id].map(orderKey)).size, next.orders[me.id].length);
  assert.equal(reservedResources(next, me.id).gold, 48);
  const manpowerLimited = recruitmentFixture();
  manpowerLimited.me.manpower = 1;
  assert.deepEqual(
    planMassRecruitment(manpowerLimited.g, manpowerLimited.me.id, request(6)).allocated,
    request(1),
  );
});

test('v101: distribuição não inventa infraestrutura e exclui cidades ocupadas, sitiadas ou hostis', () => {
  const {
    g,
    me,
    players: [, enemy],
  } = recruitmentFixture();
  const basic = planMassRecruitment(g, me.id, request(7, 1, 1));
  assert.deepEqual(basic.allocated, request(6));
  assert.deepEqual(basic.unfilled, request(1, 1, 1));
  province(g, 'castile').siege = {
    attackerOwnerId: enemy.id,
    progress: 1,
    required: 2,
    turnsUnderSiege: 1,
    startedTurn: g.turn,
    lastProgressTurn: g.turn,
  };
  province(g, 'italy').occupierId = enemy.id;
  declareWar(g, enemy.id, me.id, 'CONQUEST');
  army(g, enemy.id, 'balkans');
  Object.assign(province(g, 'poland'), {
    ownerId: me.id,
    occupierId: null,
    barracksLevel: 0,
    foundryLevel: 0,
  });
  const safe = planMassRecruitment(g, me.id, request(8));
  assert.deepEqual(
    safe.byProvince.map((row) => row.provinceId),
    ['poland'],
  );
  assert.deepEqual(safe.allocated, request(2));
  assert.ok(safe.reasons.some((reason) => reason.includes('sitiadas')));
});

test('v101: consumo local de mercenários instantâneos reduz as vagas da convocação em massa', () => {
  const { g, me } = recruitmentFixture();
  me.nationId = 'vespera';
  submitOrder(g, me.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: 'castile',
    infantry: 1,
    isMercenary: true,
  });
  assert.equal(province(g, 'castile').recruitedThisTurn, 1);
  const plan = planMassRecruitment(g, me.id, request(10));
  assert.deepEqual(plan.allocated, request(5));
  assert.equal(
    plan.byProvince.find((row) => row.provinceId === 'castile')!.composition.infantry,
    1,
  );
  assert.ok(
    !plan.orders.find((order) => order.provinceId === 'castile')!.battalionId,
    'Tropas regulares não reforçam uma companhia mercenária.',
  );
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(10) });
  assert.deepEqual(next.orders[me.id], plan.orders);
});

test('v101: desarmamento e formações pendentes limitam a distribuição sem impedir reforços legais', () => {
  const { g, me } = recruitmentFixture();
  me.disarmUntil = g.turn;
  army(g, me.id, 'castile', { infantry: 6 });
  const plan = planMassRecruitment(g, me.id, request(8));
  assert.deepEqual(plan.allocated, request(2));
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(8) });
  assert.deepEqual(planMassRecruitment(next, me.id, request(8)).allocated, request());
  const capped = recruitmentFixture();
  for (let i = 0; i < 79; i++) army(capped.g, capped.me.id, 'castile', { infantry: 1 });
  submitOrder(capped.g, capped.me.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: 'italy',
    infantry: 1,
  });
  const reinforcement = planMassRecruitment(capped.g, capped.me.id, request(8));
  assert.deepEqual(reinforcement.allocated, request(2));
  assert.deepEqual(
    reinforcement.byProvince.map((row) => row.provinceId),
    ['castile'],
  );
  assert.ok(reinforcement.orders[0].battalionId);
  assert.ok(reinforcement.reasons.some((reason) => reason.includes('80 formações')));
});

test('v101: contrato rejeita composições inválidas, turno confirmado e falta total de recursos atomicamente', () => {
  const { g, me } = recruitmentFixture();
  assert.equal(MAX_MASS_RECRUITMENT, 240);
  for (const composition of [
    request(),
    request(-1),
    request(1.5),
    request(NaN),
    request(Infinity),
    request(241),
    request(120, 120, 1),
    { ...request(1), warships: 1 },
    { ...request(1), transports: 1 },
    { ...request(1), isMercenary: true },
    { infantry: 1 },
  ]) {
    const before = structuredClone(g);
    assert.throws(() =>
      executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition } as unknown as GameCommand),
    );
    assert.deepEqual(g, before);
  }
  for (const blocked of ['ready', 'resources', 'phase'] as const) {
    const state = structuredClone(g);
    if (blocked === 'ready') state.players[0].ready = true;
    if (blocked === 'resources') state.players[0].gold = 0;
    if (blocked === 'phase') state.phase = 'finished';
    const before = structuredClone(state);
    assert.deepEqual(planMassRecruitment(state, me.id, request(1)).allocated, request());
    assert.throws(() =>
      executeCommand(state, me.id, { type: 'MASS_RECRUIT', composition: request(1) }),
    );
    assert.deepEqual(state, before);
  }
});

test('v101: prévia usa o saldo real sem arredondar para cima e prioriza recrutamento com desconto', () => {
  const { g, me } = recruitmentFixture();
  province(g, 'italy').ownerId = null;
  province(g, 'balkans').ownerId = null;
  me.gold = 7.999;
  assert.deepEqual(planMassRecruitment(g, me.id, request(1)).allocated, request());
  const before = structuredClone(g);
  assert.throws(() => executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(1) }));
  assert.deepEqual(g, before);
  province(g, 'italy').ownerId = me.id;
  province(g, 'italy').barracksLevel = 1;
  me.gold = 13.6;
  const plan = planMassRecruitment(g, me.id, request(2));
  assert.deepEqual(plan.allocated, request(2));
  assert.equal(plan.cost.gold, 13.6);
  assert.deepEqual(
    plan.byProvince.map((row) => row.provinceId),
    ['italy'],
  );
  assert.deepEqual(
    executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(2) }).orders[me.id],
    plan.orders,
  );
});

test('v101: embarque pendente não absorve recrutas novos numa formação que já deixou a cidade', () => {
  const { g, me } = recruitmentFixture();
  province(g, 'italy').ownerId = null;
  province(g, 'balkans').ownerId = null;
  const departing = army(g, me.id, 'castile', { infantry: 5 });
  const fleet = createBattalion(g, me.id, 'castile', compositionOf({ transports: 2 }), {
    isFleet: true,
  });
  submitOrder(g, me.id, { type: 'EMBARK_BATTALION', battalionId: departing.id, fleetId: fleet.id });
  const plan = planMassRecruitment(g, me.id, request(1));
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.orders[0].battalionId, undefined);
  const next = executeCommand(g, me.id, { type: 'MASS_RECRUIT', composition: request(1) });
  resolveTurn(next);
  assert.equal(next.battalions.find((a) => a.id === departing.id)!.infantry, 5);
  assert.equal(next.battalions.find((a) => a.id === departing.id)!.embarkedOnId, fleet.id);
  assert.ok(
    next.battalions.some(
      (a) =>
        a.ownerId === me.id &&
        a.id !== departing.id &&
        !a.isFleet &&
        a.infantry === 1 &&
        !a.embarkedOnId,
    ),
  );
});
