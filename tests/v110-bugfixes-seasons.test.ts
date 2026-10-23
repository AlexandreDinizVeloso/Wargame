import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createGame, executeCommand, resolveTurn, startGame } from '../server/game';
import { createBattalion } from '../server/state';
import { compositionOf, orderCost, reservedResources, orderKey } from '../shared/rules';
import { getNationAuthority } from '../shared/economy';
import { seasonAt, seasonProgress, seasonRulesFor, SEASON_LENGTH } from '../shared/world';
import type { BuildingType, GameState } from '../shared/types';

function fresh() {
  const game = createGame('ACC110', 'campaign', false, 110);
  for (const nation of ['turan', 'vespera', 'sol_invicto'] as const)
    addPlayer(game, nation, false, nation);
  startGame(game);
  game.graceUntilTurn = 0;
  game.battalions = [];
  game.commanders = [];
  for (const province of game.provinces) {
    Object.assign(province, {
      ownerId: null,
      occupierId: null,
      capitalOf: null,
      siege: null,
      fortLevel: 0,
      marketLevel: 0,
      barracksLevel: 0,
      foundryLevel: 0,
      portLevel: 0,
      templeLevel: 0,
      pacification: 100,
      unrest: 0,
      maxBuildingSlots: 6,
      strategicResource: null,
    });
  }
  for (const [index, home] of ['castile', 'germany', 'japan'].entries()) {
    const player = game.players[index],
      province = game.provinces.find((p) => p.id === home)!;
    province.ownerId = player.id;
    province.capitalOf = player.id;
    province.religion = player.faith;
    player.originalCapitalId = province.id;
    player.ready = false;
    player.gold = 40;
    player.manpower = player.influence = player.prestige = player.militaryXP = 0;
  }
  return game;
}
const city = (game: GameState, id: string) => game.provinces.find((p) => p.id === id)!;

test('v110 acceptance: 40 Ouro constroem dois Mercados de 20 sem Autoridade ou Recrutas', () => {
  let game = fresh();
  const id = game.players[0].id;
  city(game, 'france').ownerId = id;
  for (const provinceId of ['castile', 'france']) {
    const order = { type: 'BUILD_BUILDING' as const, provinceId, building: 'MARKET' as const };
    assert.deepEqual(orderCost(order, city(game, provinceId), game.players[0], game), {
      gold: 20,
      manpower: 0,
      influence: 0,
    });
    game = executeCommand(game, id, { type: 'SUBMIT_ORDER', order });
    assert.equal(40 - reservedResources(game, id).gold, provinceId === 'castile' ? 20 : 0);
    assert.equal(getNationAuthority(game.players[0]), 0);
    assert.equal(game.players[0].manpower, 0);
  }
  assert.equal(game.orders[id].length, 2);
  resolveTurn(game);
  assert.equal(city(game, 'castile').marketLevel, 1);
  assert.equal(city(game, 'france').marketLevel, 1);
  assert.ok(game.players[0].gold >= 0);
});

test('v110 acceptance: todas as construções gastam apenas Ouro; quatro níveis iniciais custam20', () => {
  const game = fresh(),
    player = game.players[0],
    province = city(game, 'castile');
  const buildings: BuildingType[] = ['MARKET', 'BARRACKS', 'FORT', 'PORT', 'FOUNDRY', 'TEMPLE'];
  for (const building of buildings) {
    const cost = orderCost(
      { type: 'BUILD_BUILDING', building, provinceId: province.id },
      province,
      player,
      game,
    );
    assert.equal(cost.manpower, 0, building);
    assert.equal(cost.influence, 0, building);
    if (['MARKET', 'BARRACKS', 'FORT', 'PORT'].includes(building))
      assert.equal(cost.gold, 20, building);
  }
});

test('v110 acceptance: Guarda da Sibéria e Exército da Mongólia movem juntos sem colisão de ordens', () => {
  let game = fresh();
  const id = game.players[0].id;
  for (const provinceId of ['siberia', 'mongolia', 'ural', 'china-west'])
    city(game, provinceId).ownerId = id;
  const guard = createBattalion(game, id, 'siberia', compositionOf({ infantry: 4 }), {
    name: 'Guarda da Sibéria',
    morale: 100,
  });
  const army = createBattalion(game, id, 'mongolia', compositionOf({ infantry: 4 }), {
    name: 'Exército da Mongólia',
    morale: 100,
  });
  game = executeCommand(game, id, {
    type: 'SUBMIT_ORDER',
    order: {
      type: 'BUILD_BUILDING',
      building: 'MARKET',
      provinceId: 'castile',
    },
  });
  for (const [battalionId, targetProvinceId] of [
    [guard.id, 'ural'],
    [army.id, 'china-west'],
  ])
    game = executeCommand(game, id, {
      type: 'SUBMIT_ORDER',
      order: { type: 'MOVE_BATTALION', battalionId, targetProvinceId },
    });
  assert.equal(game.orders[id].filter((order) => order.type === 'MOVE_BATTALION').length, 2);
  assert.equal(game.orders[id].length, 3);
  game = executeCommand(game, id, { type: 'CANCEL_ORDER', key: `army:${guard.id}` });
  assert.deepEqual(
    game.orders[id].map(orderKey).sort(),
    [`army:${army.id}`, 'city:castile'].sort(),
  );
  game = executeCommand(game, id, {
    type: 'SUBMIT_ORDER',
    order: { type: 'MOVE_BATTALION', battalionId: guard.id, targetProvinceId: 'ural' },
  });
  resolveTurn(game);
  assert.equal(game.battalions.find((a) => a.id === guard.id)!.provinceId, 'ural');
  assert.equal(game.battalions.find((a) => a.id === army.id)!.provinceId, 'china-west');
  assert.equal(city(game, 'castile').marketLevel, 1);
});

test('v110 acceptance: cada estação dura exatamente três rodadas e publica regras de alto impacto', () => {
  assert.equal(SEASON_LENGTH, 3);
  const expected = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
  for (let turn = 1; turn <= 36; turn++) {
    assert.equal(seasonAt(turn), expected[Math.floor((turn - 1) / 3) % 4]);
    const progress = seasonProgress(turn);
    assert.equal(progress.index, ((turn - 1) % 3) + 1);
    assert.equal(progress.remaining, 3 - progress.index);
  }
  assert.equal(seasonRulesFor('SPRING').manpowerMultiplier, 2);
  assert.equal(seasonRulesFor('SPRING').riverAttackMultiplier, 0.75);
  assert.equal(seasonRulesFor('SUMMER').landMovementBonus, 1);
  assert.equal(seasonRulesFor('SUMMER').landAttackMultiplier, 1.15);
  assert.equal(seasonRulesFor('SUMMER').siegeProgressBonus, 1);
  assert.equal(seasonRulesFor('AUTUMN').tradeMultiplier, 2);
  assert.equal(seasonRulesFor('AUTUMN').marketPortCostMultiplier, 0.75);
  assert.equal(seasonRulesFor('WINTER').winterAttritionRate, 0.2);
  assert.equal(seasonRulesFor('WINTER').winterMoraleLoss, 15);
  assert.equal(seasonRulesFor('WINTER').campaignUpkeepMultiplier, 1.5);
});
