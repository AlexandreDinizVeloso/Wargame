import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, army } from './fixtures';
import {
  NATIONS,
  orderCost,
  realmEconomy,
  reservedResources,
  unitCount,
  effectiveTax,
  tradeIncomeOf,
} from '../shared/rules';
import { seasonAt, seasonProgress, SEASON_ORDER, SEASON_RULES } from '../shared/world';
import { realmLimits } from '../shared/economy';
import { compositionPower, combatPowers } from '../shared/combat';
import { movementAllowance } from '../shared/military';
import { siegeProgressPerTurn } from '../shared/siege';
import { executeCommand, resolveTurn, submitOrder, viewFor } from '../server/game';
import { provinceIncome } from '../shared/mapLenses';
import { declareWar } from '../server/diplomacy';
import { beginSiege } from '../server/siege';
import { applyWinterAttrition } from '../server/logistics';
import { emptyTurnReport, type GameState } from '../shared/types';
import { createBattalion } from '../server/state';
import { compositionOf } from '../shared/rules';
import { validGame } from '../server/storage';

const city = (g: GameState, id: string) => g.provinces.find((p) => p.id === id)!;
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 0.02, `${actual} != ${expected}`);
const at = (g: GameState, turn: number) => {
  g.turn = turn;
  g.season = seasonAt(turn);
  g.globalEvent = null;
};

test('v110: estações duram três rodadas completas e widget usa o mesmo ciclo', () => {
  for (let turn = 1; turn <= 36; turn++) {
    assert.equal(seasonAt(turn), SEASON_ORDER[Math.floor((turn - 1) / 3) % 4]);
    const snapshot = seasonProgress(turn);
    assert.equal(snapshot.index, ((turn - 1) % 3) + 1);
    assert.equal(snapshot.remaining, 3 - snapshot.index);
    assert.equal(snapshot.nextSeason, seasonAt(turn + snapshot.remaining + 1));
  }
});

test('v110: primeira construção custa só 20 Ouro para todas as nações mesmo em impérios inflacionados', () => {
  const {
    g,
    players: [me],
  } = setup();
  for (const p of g.provinces.filter((p) => p.kind === 'LAND')) p.ownerId = me.id;
  const home = city(g, 'castile');
  home.marketLevel = home.barracksLevel = home.fortLevel = home.portLevel = 0;
  for (const nation of NATIONS) {
    me.nationId = nation.id;
    me.faith = nation.religion;
    for (const building of ['MARKET', 'BARRACKS', 'FORT', 'PORT'] as const) {
      assert.deepEqual(
        orderCost({ type: 'BUILD_BUILDING', provinceId: home.id, building }, home, me, g),
        { gold: 20, manpower: 0, influence: 0 },
      );
    }
    for (const building of ['FOUNDRY', 'TEMPLE'] as const) {
      const cost = orderCost(
        { type: 'BUILD_BUILDING', provinceId: home.id, building },
        home,
        me,
        g,
      );
      assert.ok(cost.gold > 0);
      assert.equal(cost.influence, 0);
      assert.equal(cost.manpower, 0);
    }
  }
});

test('v110: 40 Ouro enfileiram e constroem dois mercados sem Autoridade nem Recrutas', () => {
  const {
    g,
    players: [me],
  } = setup();
  me.gold = 40;
  me.influence = me.prestige = me.militaryXP = me.manpower = 0;
  city(g, 'italy').ownerId = me.id;
  for (const id of ['castile', 'italy']) city(g, id).marketLevel = 0;
  submitOrder(g, me.id, { type: 'BUILD_MARKET', provinceId: 'castile' });
  assert.equal(me.gold - reservedResources(g, me.id).gold, 20);
  submitOrder(g, me.id, { type: 'BUILD_MARKET', provinceId: 'italy' });
  assert.deepEqual(reservedResources(g, me.id), { gold: 40, manpower: 0, influence: 0 });
  assert.equal(g.orders[me.id].length, 2);
  resolveTurn(g);
  assert.equal(city(g, 'castile').marketLevel, 1);
  assert.equal(city(g, 'italy').marketLevel, 1);
  assert.equal(validGame(g), true);
});

test('v110: guarda da Sibéria e exército da Mongólia se movem juntos, inclusive entrada em floresta', () => {
  let {
    g,
    players: [me],
  } = setup();
  for (const id of ['siberia', 'mongolia', 'ural', 'china-west']) {
    Object.assign(city(g, id), { ownerId: me.id, pacification: 100, unrest: 0 });
  }
  me.nationId = 'aurelia';
  const guard = army(g, me.id, 'siberia', { infantry: 3 }),
    expedition = army(g, me.id, 'mongolia', { infantry: 3 });
  guard.name = 'Guarda da Sibéria';
  expedition.name = 'Exército da Mongólia';
  g = executeCommand(g, me.id, {
    type: 'SUBMIT_ORDER',
    order: { type: 'MOVE_BATTALION', battalionId: guard.id, targetProvinceId: 'ural' },
  });
  g = executeCommand(g, me.id, {
    type: 'SUBMIT_ORDER',
    order: { type: 'MOVE_BATTALION', battalionId: expedition.id, targetProvinceId: 'china-west' },
  });
  assert.equal(g.orders[me.id].length, 2);
  const report = resolveTurn(g);
  assert.equal(g.battalions.find((a) => a.id === guard.id)!.provinceId, 'ural');
  assert.equal(g.battalions.find((a) => a.id === expedition.id)!.provinceId, 'china-west');
  assert.equal(new Set(report.movements.map((move) => move.battalionId)).size, 2);
});

test('v110: primavera dobra toda a regeneração e cheias reduzem ataque de travessia a75%', () => {
  const {
    g,
    players: [me],
  } = setup();
  me.councilEffects = [
    {
      id: 'muster',
      sourceId: 'frontier-settlers',
      label: 'Conscrição',
      startsTurn: 1,
      expiresTurn: 12,
      modifiers: { manpowerGain: 1 },
    },
  ];
  at(g, 1);
  const spring = realmLimits(g, me.id).manpowerGain;
  at(g, 4);
  near(spring, realmLimits(g, me.id).manpowerGain * 2);
  const attacking = army(g, me.id, 'france');
  at(g, 1);
  near(combatPowers(g, [attacking], [], city(g, 'germany')).riverCrossingModifier, 0.75);
  at(g, 4);
  near(combatPowers(g, [attacking], [], city(g, 'germany')).riverCrossingModifier, 0.85);
});

test('v110: verão concede alcance, ataque terrestre e progresso de cerco adicionais', () => {
  const {
    g,
    players: [me, enemy],
  } = setup();
  const formation = army(g, me.id, 'castile');
  at(g, 1);
  const normal = compositionPower(g, formation, city(g, 'castile'));
  assert.equal(movementAllowance(g, formation), 1);
  at(g, 4);
  assert.equal(movementAllowance(g, formation), 2);
  near(compositionPower(g, formation, city(g, 'castile')), normal * 1.15);
  assert.equal(siegeProgressPerTurn(g, me.id, [formation], city(g, 'france')), 2);
  declareWar(g, me.id, enemy.id, 'CONQUEST');
  formation.provinceId = 'france';
  beginSiege(g, formation, city(g, 'france'));
  assert.equal(city(g, 'france').siege!.progress, 2);
});

test('v110: verão resolve duas etapas terrestres também em colinas', () => {
  const {
    g,
    players: [me],
  } = setup();
  at(g, 4);
  for (const id of ['castile', 'france', 'germany'])
    Object.assign(city(g, id), {
      ownerId: me.id,
      occupierId: null,
      terrain: 'hills',
      pacification: 100,
    });
  const formation = army(g, me.id, 'castile');
  submitOrder(g, me.id, {
    type: 'MOVE_BATTALION',
    battalionId: formation.id,
    path: ['france', 'germany'],
  });
  resolveTurn(g);
  assert.equal(formation.provinceId, 'germany');
});

test('v110: outono duplica comércio terrestre e marítimo e reduz Mercado/Porto a15Ouro', () => {
  const {
    g,
    players: [me],
  } = setup();
  city(g, 'castile').marketLevel = 1;
  createBattalion(g, me.id, 'north-atlantic', compositionOf({ warships: 2, transports: 1 }), {
    isFleet: true,
  });
  at(g, 4);
  const ordinary = realmEconomy(g, me.id);
  at(g, 7);
  const harvest = realmEconomy(g, me.id);
  near(harvest.maritimeTrade, ordinary.maritimeTrade * 2);
  near(harvest.trade, ordinary.trade * 2);
  near(harvest.taxes, ordinary.taxes);
  city(g, 'castile').marketLevel = city(g, 'castile').portLevel = 0;
  for (const building of ['MARKET', 'PORT'] as const)
    assert.deepEqual(
      orderCost(
        { type: 'BUILD_BUILDING', provinceId: 'castile', building },
        city(g, 'castile'),
        me,
        g,
      ),
      { gold: 15, manpower: 0, influence: 0 },
    );
});

test('v110: lente econômica mantém impostos do trigo e duplica apenas comércio no outono', () => {
  const {
    g,
    players: [me],
  } = setup();
  me.nationId = 'aurelia';
  me.faith = 'SOLAR';
  const home = city(g, 'castile');
  Object.assign(home, {
    baseTax: 10,
    resource: 'trade',
    strategicResource: 'GRAIN',
    religion: me.faith,
    marketLevel: 1,
    portLevel: 0,
    foundryLevel: 0,
    pacification: 100,
    unrest: 0,
  });
  const tax = effectiveTax(home, me.faith, false, me.religiousPolicy),
    trade = tradeIncomeOf(home);
  at(g, 4);
  const summerIncome = provinceIncome(viewFor(g, me.id), home),
    summerEconomy = realmEconomy(g, me.id);
  at(g, 7);
  const autumnIncome = provinceIncome(viewFor(g, me.id), home),
    autumnEconomy = realmEconomy(g, me.id);
  near(summerIncome - trade, tax);
  near(autumnIncome - trade * 2, tax);
  near(autumnIncome - summerIncome, trade);
  near(autumnEconomy.taxes, summerEconomy.taxes);
  near(autumnEconomy.trade, summerEconomy.trade * 2);
});

test('v110: inverno cobra +50% manutenção só da campanha e preserva guarnições pacificadas', () => {
  const {
    g,
    players: [me],
  } = setup();
  const stationed = army(g, me.id, 'castile', { infantry: 10 });
  stationed.morale = 100;
  at(g, 4);
  const homeCost = realmEconomy(g, me.id).upkeep;
  at(g, 10);
  near(realmEconomy(g, me.id).upkeep, homeCost);
  resolveTurn(g);
  assert.equal(stationed.infantry, 10);
  assert.equal(stationed.morale, 100);
  city(g, 'castile').pacification = 0;
  at(g, 4);
  const campaignCost = realmEconomy(g, me.id).upkeep;
  at(g, 10);
  near(realmEconomy(g, me.id).upkeep, campaignCost * 1.5);
  resolveTurn(g);
  assert.equal(stationed.infantry, 8);
  assert.equal(stationed.morale, 85);
});

test('v110: frio universal completa mínimo20% sem duplicar perdas logísticas já cobradas', () => {
  const {
    g,
    players: [me],
  } = setup();
  at(g, 10);
  me.nationId = 'ferro_norte';
  city(g, 'castile').pacification = 0;
  const formation = army(g, me.id, 'castile', { infantry: 9 });
  formation.morale = 100;
  const report = emptyTurnReport(g.turn, g.diet);
  report.attritionLosses.push({
    armyId: formation.id,
    ownerId: me.id,
    provinceId: 'castile',
    troopsBefore: 10,
    supplyLimit: 0,
    losses: 1,
  });
  applyWinterAttrition(g, report, new Map([[formation.id, 10]]));
  assert.equal(unitCount(formation), 8);
  assert.equal(formation.morale, 85);
  assert.equal(
    report.attritionLosses.reduce((sum, loss) => sum + loss.losses, 0),
    2,
  );
  assert.equal(SEASON_RULES.WINTER.winterAttritionRate, 0.2);
});

test('v110: perdas navais de inverno deixam carga e transporte persistíveis', () => {
  const {
    g,
    players: [me],
  } = setup();
  at(g, 10);
  const fleet = createBattalion(g, me.id, 'north-atlantic', compositionOf({ transports: 2 }), {
    isFleet: true,
  });
  const cargo = army(g, me.id, 'castile', { infantry: 8 });
  cargo.provinceId = 'north-atlantic';
  cargo.embarkedOnId = fleet.id;
  fleet.embarkedArmyId = cargo.id;
  resolveTurn(g);
  assert.equal(validGame(g), true);
  const survivors = g.battalions.find((a) => a.id === cargo.id);
  const survivingFleet = g.battalions.find((a) => a.id === fleet.id);
  if (survivors && survivingFleet) assert.ok(unitCount(survivors) <= survivingFleet.transports * 4);
});
