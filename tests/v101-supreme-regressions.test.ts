import assert from 'node:assert/strict';
import test from 'node:test';
import { compositionPower } from '../shared/combat';
import { movementAllowance } from '../shared/military';
import { supremeCommandBlock } from '../shared/supreme';
import { declareWar } from '../server/diplomacy';
import { issueDilemmas, chooseDilemma, applyDilemmaBuildingCredits } from '../server/dilemmas';
import {
  addPlayer,
  createGame,
  executeCommand,
  resolveTurn,
  startGame,
  submitOrder,
  viewFor,
} from '../server/game';
import { executeSupremeCommand } from '../server/supreme';

function campaign() {
  const g = createGame('SUP-REVIEW-101', 'campaign', false, 101);
  for (const nation of ['vespera', 'veridia', 'sol_invicto'] as const)
    addPlayer(g, nation, false, nation);
  startGame(g);
  g.graceUntilTurn = 0;
  for (const p of g.players) {
    p.influence = 0;
    p.prestige = 0;
    p.militaryXP = 1000;
    p.ready = false;
  }
  return g;
}

test('v101 supreme: sabotagem respeita a mesma camuflagem e reconhecimento da visão do jogador', () => {
  const g = campaign(),
    [actor, enemy] = g.players;
  g.matchConfig.verticalSlice = true;
  declareWar(g, actor.id, enemy.id, 'CONQUEST');
  const target = g.battalions.find((a) => a.ownerId === enemy.id && !a.isFleet)!;
  const province = g.provinces.find((p) => p.id === target.provinceId)!;
  province.terrain = 'forest';
  const command = {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'SABOTAGE_SUPPLY',
    battalionId: target.id,
  } as const;
  g.visionContracts.push({ buyerId: actor.id, targetId: enemy.id, untilTurn: g.turn + 2 });
  assert.ok(viewFor(g, actor.id).battalions.some((a) => a.id === target.id));
  assert.equal(supremeCommandBlock(g, actor.id, command), null);
  g.visionContracts = [];
  g.battalions.find((a) => a.ownerId === actor.id && !a.isFleet)!.provinceId = target.provinceId;
  assert.equal(
    viewFor(g, actor.id).battalions.some((a) => a.id === target.id),
    false,
  );
  assert.match(supremeCommandBlock(g, actor.id, command)!, /oculta/);
});

test('v101 supreme: Blitz não deixa crédito de movimento extra depois da rodada de uso', () => {
  for (const moveNow of [false, true]) {
    const g = campaign(),
      actor = g.players[0];
    const army = g.battalions.find((a) => a.ownerId === actor.id && !a.isFleet)!;
    const origin = g.provinces.find((p) => p.id === army.provinceId)!;
    const target = g.provinces.find(
      (p) =>
        p.kind === 'LAND' &&
        origin.neighbors.includes(p.id) &&
        !origin.straitNeighbors.includes(p.id),
    )!;
    target.ownerId = actor.id;
    target.occupierId = null;
    target.terrain = moveNow ? 'plains' : 'forest';
    g.battalions = g.battalions.filter((a) => a.provinceId !== target.id);
    army.movementCredit = 0;
    executeSupremeCommand(g, actor.id, {
      type: 'EXECUTE_SUPREME_COMMAND',
      command: 'BLITZ_MARCH',
      battalionId: army.id,
    });
    if (moveNow)
      submitOrder(g, actor.id, { type: 'MOVE_BATTALION', battalionId: army.id, path: [target.id] });
    resolveTurn(g);
    assert.equal(army.movementCredit, 0);
    assert.equal(movementAllowance(g, army), 1);
    if (moveNow) assert.equal(army.provinceId, target.id);
    else {
      submitOrder(g, actor.id, { type: 'MOVE_BATTALION', battalionId: army.id, path: [target.id] });
      resolveTurn(g);
      assert.equal(
        army.provinceId,
        origin.id,
        'Marcha Forçada expirada não paga o custo da floresta na rodada seguinte.',
      );
    }
  }
});

test('v101 supreme: Autoridade reservada continua protegida e rejeição não altera o estado de entrada', () => {
  const g = campaign(),
    actor = g.players[0],
    capital = g.provinces.find((p) => p.capitalOf === actor.id)!;
  actor.militaryXP = 50;
  capital.religion = actor.faith === 'SOLAR' ? 'MERCHANT' : 'SOLAR';
  submitOrder(g, actor.id, { type: 'CONVERT', targetProvinceId: capital.id });
  const snapshot = structuredClone(g);
  assert.throws(
    () =>
      executeCommand(g, actor.id, {
        type: 'EXECUTE_SUPREME_COMMAND',
        command: 'ELITE_GUARD',
        provinceId: capital.id,
      }),
    /Autoridade/,
  );
  assert.deepEqual(g, snapshot);
  g.orders[actor.id] = [];
  const before = g.battalions.length,
    recruits = actor.manpower;
  const result = executeCommand(g, actor.id, {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'ELITE_GUARD',
    provinceId: capital.id,
  });
  assert.equal(result.battalions.length, before + 1);
  assert.equal(result.players[0].manpower, recruits);
  assert.equal(
    g.battalions.length,
    before,
    'O comando retorna um estado novo sem editar a entrada.',
  );
});

test('v101 supreme: moral temporária do Conselho cobra manutenção e expira após três resoluções', () => {
  const g = campaign(),
    actor = g.players[0],
    army = g.battalions.find((a) => a.ownerId === actor.id && !a.isFleet)!;
  const province = g.provinces.find((p) => p.id === army.provinceId)!;
  army.morale = 100;
  g.turn = 4;
  const baseline = compositionPower(g, army, province);
  actor.activeDilemma = { id: 'military-council', turn: 4, targetProvinceId: province.id };
  chooseDilemma(g, actor.id, 1);
  assert.equal(
    actor.councilEffects!.find((e) => e.sourceId === 'military-council')!.expiresTurn,
    6,
  );
  for (let turn = 4; turn <= 6; turn++) {
    assert.equal(g.turn, turn);
    assert.ok(Math.abs(compositionPower(g, army, province) / baseline - 1.1) < 1e-10);
    resolveTurn(g);
  }
  assert.equal(g.turn, 7);
  assert.ok(Math.abs(compositionPower(g, army, province) / baseline - 1) < 1e-10);
});

test('v101 supreme: obra gratuita sob cerco atualiza resistência e preserva o save completo', async () => {
  const { validGame, writeSnapshot, readSnapshot } = await import('../server/storage');
  const { siegeResistance } = await import('../shared/siege');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const g = campaign(),
    [actor, enemy] = g.players,
    capital = g.provinces.find((p) => p.capitalOf === actor.id)!;
  g.turn = 4;
  capital.fortLevel = 0;
  declareWar(g, enemy.id, actor.id, 'CONQUEST');
  capital.siege = {
    attackerOwnerId: enemy.id,
    progress: 1,
    required: siegeResistance(g, capital),
    turnsUnderSiege: 1,
    startedTurn: g.turn,
    lastProgressTurn: g.turn,
  };
  assert.equal(validGame(g), true);
  actor.dilemmaBuildingCredits = 1;
  applyDilemmaBuildingCredits(g, actor);
  issueDilemmas(g);
  const updated = executeCommand(g, actor.id, { type: 'CHOOSE_DILEMMA', option: 0 });
  const fortified = updated.provinces.find((p) => p.id === capital.id)!;
  assert.equal(fortified.fortLevel, 1);
  assert.equal(fortified.siege!.required, siegeResistance(updated, fortified));
  assert.equal(fortified.siege!.required, 4);
  assert.equal(fortified.siege!.attackerOwnerId, enemy.id);
  assert.equal(fortified.siege!.progress, 1);
  assert.equal(validGame(updated), true);
  const folder = mkdtempSync(join(tmpdir(), 'concordia-dilemma-fort-'));
  try {
    const filename = join(folder, 'rooms.json');
    writeSnapshot(
      filename,
      [{ game: updated, sessions: [], touched: 1000, remainingMs: 60000 }],
      1000,
    );
    const loaded = readSnapshot(filename);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].game.players[0].activeDilemma, null);
    assert.deepEqual(
      loaded[0].game.provinces.find((p) => p.id === capital.id)!.siege,
      fortified.siege,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('v101 supreme: bombardeio adjacente com guarda inimiga produz cerco persistível', async () => {
  const { validGame } = await import('../server/storage');
  const { createBattalion } = await import('../server/state');
  const { compositionOf } = await import('../shared/rules');
  const { siegeResistance } = await import('../shared/siege');
  const g = campaign(),
    [actor, enemy] = g.players;
  const home = g.provinces.find((p) => p.capitalOf === actor.id)!;
  const target = g.provinces.find(
    (p) =>
      p.kind === 'LAND' && home.neighbors.includes(p.id) && !home.straitNeighbors.includes(p.id),
  )!;
  target.ownerId = enemy.id;
  target.occupierId = null;
  target.fortLevel = 2;
  g.battalions = g.battalions.filter((a) => a.provinceId !== target.id);
  createBattalion(g, enemy.id, target.id, compositionOf({ infantry: 4 }));
  declareWar(g, actor.id, enemy.id, 'CONQUEST');
  assert.equal(validGame(g), true);
  const result = executeCommand(g, actor.id, {
    type: 'EXECUTE_SUPREME_COMMAND',
    command: 'SIEGE_BREAKER',
    provinceId: target.id,
  });
  const besieged = result.provinces.find((p) => p.id === target.id)!;
  assert.equal(besieged.fortLevel, 1);
  assert.equal(besieged.siege!.progress, 4);
  assert.equal(besieged.siege!.turnsUnderSiege, 1);
  assert.equal(besieged.siege!.required, siegeResistance(result, besieged));
  assert.equal(besieged.occupierId, null);
  assert.equal(validGame(result), true);
});
