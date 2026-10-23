import test from 'node:test';
import { advanceSieges } from '../server/siege';
import assert from 'node:assert/strict';
import { setup, army } from './fixtures';
import {
  addPlayer,
  createGame,
  startGame,
  executeCommand,
  resolveTurn,
  submitOrder,
  viewFor,
} from '../server/game';
import { compositionPower, resolveBattle } from '../server/combat';
import { answerOffer, declareWar, diplomacy } from '../server/diplomacy';
import { coalitionWar, joinCoalition, advanceWorld } from '../server/world';
import { createBattalion } from '../server/state';
import {
  NATIONS,
  splitHalf,
  compositionOf,
  controller,
  getRelation,
  orderCost,
  realmEconomy,
  supplyLimit,
  unitCount,
  victoryStatus,
} from '../shared/rules';
import { globalSupplyBonus, objectiveProgress } from '../shared/strategy';
import { emptyTurnReport } from '../shared/types';
import { validGame } from '../server/storage';
import { migrateV3 } from '../server/migration';
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.02, `${a} != ${b}`);

test('v4 tem oito mecânicas e os cinco recursos em todos os teatros', () => {
  assert.deepEqual(
    new Set(NATIONS.map((n) => n.id)),
    new Set([
      'aurelia',
      'ferro_norte',
      'vespera',
      'sol_invicto',
      'kaldor',
      'turan',
      'sapiencia',
      'veridia',
    ]),
  );
  for (const theater of ['EUROPE', 'AMERICAS', 'ASIA'] as const) {
    const g = createGame('MAP', 'quick', false, 42, theater);
    for (const r of ['GRAIN', 'IRON', 'HORSES', 'GOLD_MINE', 'RELIC'] as const)
      assert.ok(g.provinces.some((p) => p.strategicResource === r));
    assert.ok(
      g.provinces.filter((p) => p.kind === 'SEA_ZONE').every((p) => p.strategicResource === null),
    );
  }
});
test('trigo aumenta suprimento local em 6 e nacional em 2 por província', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = g.provinces.find((p) => controller(p) === a.id)!;
  const base = supplyLimit(p);
  p.strategicResource = 'GRAIN';
  assert.equal(supplyLimit(p), base + 6);
  assert.equal(globalSupplyBonus(g, a.id), 2);
});
test('ferro e cavalos acumulam ataque até os tetos e aplicam descontos', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.nationId = 'aurelia';
  a.faith = 'ANCESTRAL';
  const p = g.provinces[0];
  p.terrain = 'plains';
  const inf = army(g, a.id, p.id, { infantry: 10 }),
    cav = army(g, a.id, p.id, { cavalry: 10 });
  const baseI = compositionPower(g, inf, p),
    baseC = compositionPower(g, cav, p);
  const lands = g.provinces.filter((q) => q.kind === 'LAND');
  for (const q of lands.slice(4, 8)) {
    q.ownerId = a.id;
    q.strategicResource = 'IRON';
  }
  close(compositionPower(g, inf, p) / baseI, 1.24);
  for (const q of lands.slice(8, 12)) {
    q.ownerId = a.id;
    q.strategicResource = 'HORSES';
  }
  close(compositionPower(g, cav, p) / baseC, 1.3);
  p.strategicResource = 'IRON';
  close(
    orderCost({ type: 'RECRUIT_BATTALION', provinceId: p.id, infantry: 10, artillery: 10 }, p, a, g)
      .gold,
    238,
  );
  close(orderCost({ type: 'RECRUIT_BATTALION', provinceId: p.id, cavalry: 10 }, p, a, g).gold, 112);
});
test('relíquias geram 1 ouro e ouro recebe a crise de renda', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = g.provinces.find((p) => controller(p) === a.id)!;
  const before = realmEconomy(g, a.id).grossIncome;
  p.strategicResource = 'RELIC';
  close(realmEconomy(g, a.id).grossIncome - before, 1);
  p.strategicResource = 'GOLD_MINE';
  const standard = realmEconomy(g, a.id).grossIncome;
  g.globalEvent = { id: 'GOLD_RUSH', startedTurn: 1, endsTurn: 2 };
  assert.ok(realmEconomy(g, a.id).grossIncome > standard);
});
test('Véspera contrata instantaneamente sem reservas locais e combina descontos', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.gold = 100;
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.pacification = 10;
  p.marketLevel = 1;
  p.portLevel = 0;
  a.manpower = 0;
  const o = {
    type: 'RECRUIT_BATTALION' as const,
    provinceId: p.id,
    infantry: 2,
    isMercenary: true,
  };
  const price = orderCost(o, p, a, g).gold;
  close(price, 23.4);
  submitOrder(g, a.id, o);
  close(a.gold, 100 - price);
  assert.equal(a.manpower, 0);
  assert.equal(g.battalions.at(-1)?.infantry, 2);
  g.globalEvent = { id: 'MERCENARY_CRISIS', startedTurn: 1, endsTurn: 2 };
  close(orderCost(o, p, a, g).gold, 14.04);
});
test('Véspera aumenta receita de portos e mercados em 30% e dobra subornos', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.marketLevel = 1;
  const boosted = realmEconomy(g, a.id);
  a.nationId = 'aurelia';
  const normal = realmEconomy(g, a.id);
  close(boosted.taxes / normal.taxes, 1.3);
  a.nationId = 'vespera';
  const q = g.provinces.find((p) => p.ownerId === b.id)!;
  q.unrest = 5;
  diplomacy(g, a.id, {
    type: 'DIPLOMACY',
    action: 'BUY_VISION_OR_BRIHC',
    targetRealmId: b.id,
    targetProvinceId: q.id,
    amount: 12,
  });
  assert.equal(q.unrest, 65);
});
test('Aurélia recebe vassalagem consentida, renda e províncias de dominação', () => {
  let {
    g,
    players: [a, b],
  } = setup();
  a.nationId = 'aurelia';
  diplomacy(g, a.id, { type: 'DIPLOMACY', action: 'OFFER_VASSALAGE', targetRealmId: b.id });
  answerOffer(g, b.id, g.offers[0].id, true);
  assert.equal(b.subjectOfId, a.id);
  const before = b.gold;
  const r = resolveTurn(g);
  const eco = r.economy.find((e) => e.playerId === b.id)!;
  close(b.gold, before + eco.net - eco.grossIncome * 0.25);
  assert.ok(r.events.some((e) => e.includes('vassalagem')));
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  lands.slice(0, Math.ceil(lands.length * 0.75) + 2).forEach((p, i) => {
    p.ownerId = i < Math.ceil(lands.length * 0.75) ? a.id : b.id;
    p.occupierId = null;
  });
  assert.equal(victoryStatus(g)?.winnerId, a.id);
});
test('Ferro-Norte recebe dois ouro por baixa inimiga e recupera moral no saque', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.nationId = 'ferro_norte';
  b.nationId = 'aurelia';
  declareWar(g, a.id, b.id, 'CONQUEST');
  const unit = army(g, a.id, 'castile', { infantry: 40 }),
    target = g.provinces.find((p) => p.id === 'france')!;
  target.isCoastal = true;
  army(g, b.id, target.id, { infantry: 3 });
  const before = a.gold;
  const report = emptyTurnReport(1, g.diet);
  resolveBattle(g, unit, target, report);
  assert.equal(a.gold - before, (report.battles[0].casualtiesByRealm[b.id] ?? 0) * 2);
  assert.equal(target.occupierId, null);
  const afterBattle = unit.morale;
  unit.provinceId = target.id;
  g.turn++;
  advanceSieges(g, report);
  assert.equal(target.occupierId, a.id);
  assert.ok(unit.morale > afterBattle);
});
test('Ferro-Norte atravessa floresta em uma rodada durante o inverno', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.nationId = 'ferro_norte';
  const target = g.provinces.find((p) => p.id === 'france')!;
  target.ownerId = a.id;
  target.terrain = 'forest';
  g.turn = 10;
  g.season = 'WINTER';
  const unit = army(g, a.id, 'castile', { infantry: 5 });
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    targetProvinceId: target.id,
  });
  resolveTurn(g);
  assert.equal(unit.provinceId, target.id);
});
test('Sol Invicto ganha ouro, Autoridade e poder em guerra religiosa', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.nationId = 'sol_invicto';
  a.faith = 'SOLAR';
  a.religiousPolicy = 'INQUISITION';
  b.faith = 'ANCESTRAL';
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.religion = 'ANCESTRAL';
  const unit = army(g, a.id, p.id),
    before = compositionPower(g, unit, p);
  declareWar(g, a.id, b.id, 'HOLY_WAR');
  assert.ok(compositionPower(g, unit, p) > before * 1.19);
  const goldBefore = a.gold;
  submitOrder(g, a.id, { type: 'CONVERT', targetProvinceId: p.id });
  const r = resolveTurn(g);
  assert.equal(a.militaryXP, 3);
  assert.ok(r.conversions.length === 1);
  close(a.gold, goldBefore - 8 + 8 + r.economy.find((e) => e.playerId === a.id)!.net);
});
test('Kaldor possui fortes de nível 3, desconto e atrito de cerco de 15% uma vez', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.nationId = 'aurelia';
  b.nationId = 'kaldor';
  b.gold = 1000;
  const target = g.provinces.find((p) => p.id === 'france')!;
  target.fortLevel = 2;
  submitOrder(g, b.id, { type: 'BUILD_FORT', provinceId: target.id });
  resolveTurn(g);
  assert.equal(target.fortLevel, 3);
  assert.ok(validGame(g));
  const normal = orderCost({ type: 'BUILD_FORT', provinceId: target.id }, target, a, g).gold;
  close(orderCost({ type: 'BUILD_FORT', provinceId: target.id }, target, b, g).gold, normal * 0.7);
  declareWar(g, a.id, b.id, 'CONQUEST');
  const unit = army(g, a.id, 'castile', { infantry: 20 }),
    r = emptyTurnReport(g.turn, g.diet);
  resolveBattle(g, unit, target, r);
  assert.equal(r.attritionLosses[0].losses, 3);
  assert.equal(unitCount(unit), 17);
});
test('Kaldor artilharia custa 25% menos e atira 25% mais', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = g.provinces[0];
  a.faith = 'ANCESTRAL';
  a.nationId = 'aurelia';
  const u = army(g, a.id, p.id, { artillery: 10 });
  const base = compositionPower(g, u, p);
  a.nationId = 'kaldor';
  close(compositionPower(g, u, p) / base, 1.25);
  close(
    orderCost({ type: 'RECRUIT_BATTALION', provinceId: p.id, artillery: 10 }, p, a, g).gold,
    150,
  );
});
test('Turan cavalaria pura percorre duas terras planas e arrasa uma conquista uma vez', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.nationId = 'turan';
  g.provinces.find((p) => p.id === 'japan')!.ownerId = g.players[1].id;
  g.provinces.find((p) => p.id === 'korea')!.ownerId = g.players[2].id;
  for (const id of ['france', 'italy']) {
    const p = g.provinces.find((p) => p.id === id)!;
    p.ownerId = a.id;
    p.terrain = 'plains';
  }
  g.provinces.find((p) => p.id === 'castile')!.terrain = 'plains';
  const unit = army(g, a.id, 'castile', { cavalry: 6 });
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    path: ['france', 'italy'],
  });
  resolveTurn(g);
  assert.equal(unit.provinceId, 'italy');
  const neutral = g.provinces.find((p) => p.id === 'germany')!;
  neutral.ownerId = null;
  neutral.fortLevel = 0;
  neutral.terrain = 'plains';
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    targetProvinceId: neutral.id,
  });
  resolveTurn(g);
  assert.equal(neutral.ownerId, null);
  resolveTurn(g);
  assert.equal(neutral.ownerId, a.id);
  a.activeDilemma = null;
  a.lastDilemmaTurn = g.turn;
  const before = a.gold;
  submitOrder(g, a.id, { type: 'RAZE_PROVINCE', battalionId: unit.id });
  const r = resolveTurn(g);
  close(a.gold, before + 20 + r.economy.find((e) => e.playerId === a.id)!.net);
  assert.throws(() => submitOrder(g, a.id, { type: 'RAZE_PROVINCE', battalionId: unit.id }));
});
test('Sapiência recruta treinado e só recebe intenções inimigas adjacentes', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  a.nationId = 'sapiencia';
  const trained = createBattalion(g, a.id, 'castile', compositionOf({ infantry: 2 }), {
    training: 1,
  });
  assert.equal(trained.training, 1.2);
  const enemy = army(g, b.id, 'france');
  declareWar(g, b.id, c.id, 'CONQUEST');
  submitOrder(g, b.id, {
    type: 'MOVE_BATTALION',
    battalionId: enemy.id,
    targetProvinceId: 'germany',
  });
  assert.deepEqual(viewFor(g, a.id).battalions.find((a) => a.id === enemy.id)?.pathQueue, [
    'germany',
  ]);
  a.nationId = 'aurelia';
  assert.deepEqual(viewFor(g, a.id).battalions.find((a) => a.id === enemy.id)?.pathQueue, []);
});
test('Verídia esconde composição em mata própria e causa emboscada de 50%', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  b.nationId = 'veridia';
  const p = g.provinces.find((p) => p.ownerId === b.id)!;
  p.terrain = 'forest';
  const unit = army(g, b.id, p.id, { infantry: 10 });
  assert.ok(!viewFor(g, a.id).battalions.some((a) => a.id === unit.id));
  const ambush = compositionPower(g, unit, p, true);
  b.nationId = 'aurelia';
  close(ambush / compositionPower(g, unit, p, true), 1.5);
  b.nationId = 'veridia';
  diplomacy(g, a.id, {
    type: 'DIPLOMACY',
    action: 'BUY_VISION_OR_BRIHC',
    targetRealmId: b.id,
    amount: 20,
  });
  assert.ok(viewFor(g, a.id).battalions.some((a) => a.id === unit.id));
});
test('coalizão entra junta, aumenta moral, reduz manutenção e respeita tréguas', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  a.aggressiveExpansion = 60;
  joinCoalition(g, b.id, a.id);
  joinCoalition(g, c.id, a.id);
  const unit = army(g, b.id, 'france', { infantry: 4 });
  const normal = realmEconomy(g, b.id).upkeep;
  coalitionWar(g, b.id, a.id);
  assert.deepEqual(new Set(g.wars[0].attackerIds), new Set([b.id, c.id]));
  close(realmEconomy(g, b.id).upkeep, normal * 0.75);
  assert.ok(getRelation(g, a.id, c.id)?.atWar);
  const power = compositionPower(g, unit, g.provinces[0]);
  unit.morale = unit.morale / 1.2;
  assert.ok(compositionPower(g, unit, g.provinces[0]) < power);
});
test('ameaça cresce em guerra sem causa justa e cai oito em paz', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  assert.equal(a.aggressiveExpansion, 20);
  g.wars[0].active = false;
  resolveTurn(g);
  assert.equal(a.aggressiveExpansion, 12);
});
test('estações duram três rodadas e crises têm efeitos por exatamente duas rodadas', () => {
  const { g } = setup();
  assert.equal(g.season, 'SPRING');
  resolveTurn(g);
  assert.equal(g.season, 'SPRING');
  g.turn = 4;
  const r = emptyTurnReport(4, g.diet);
  advanceWorld(g, r);
  assert.equal(g.season, 'SUMMER');
  assert.equal(g.globalEvent?.endsTurn, 5);
  assert.ok(r.events.length > 0);
  g.turn = 5;
  advanceWorld(g, emptyTurnReport(5, g.diet));
  assert.ok(g.globalEvent);
  g.turn = 6;
  advanceWorld(g, emptyTurnReport(6, g.diet));
  assert.equal(g.globalEvent, null);
});
test('timer inicia apenas no primeiro humano, não reinicia ao cancelar, e zera a cada rodada', () => {
  let {
    g,
    players: [a, b, c],
  } = setup();
  assert.equal(g.turnDeadlineAt, null);
  g = executeCommand(g, a.id, { type: 'READY', ready: true }, 1000);
  assert.equal(g.turnDeadlineAt, 61000);
  assert.equal(g.firstReadyPlayerName, a.name);
  g = executeCommand(g, a.id, { type: 'READY', ready: false }, 2000);
  assert.equal(g.turnDeadlineAt, 61000);
  g = executeCommand(g, a.id, { type: 'READY', ready: true }, 3000);
  g = executeCommand(g, b.id, { type: 'READY', ready: true }, 4000);
  g = executeCommand(g, c.id, { type: 'READY', ready: true }, 5000);
  assert.equal(g.turn, 2);
  assert.equal(g.turnDeadlineAt, null);
  assert.equal(g.firstReadyPlayerName, null);
});
test('cartas são exclusivas por jogador, privadas e o toggle desativa a distribuição', () => {
  const g = createGame('SECRET');
  for (let i = 0; i < 3; i++) addPlayer(g, String(i));
  startGame(g);
  assert.ok(g.players.every((p) => p.secretObjectives.length === 2));
  const other = viewFor(g, g.players[1].id);
  assert.equal(other.players[0].secretObjectives.length, 0);
  assert.equal(other.players[1].secretObjectives.length, 2);
  const off = createGame('OFF');
  off.enableSecretObjectives = false;
  for (let i = 0; i < 3; i++) addPlayer(off, String(i));
  startGame(off);
  assert.ok(off.players.every((p) => !p.secretObjectives.length));
});
test('objetivo secreto vence e é revelado no estado final, sem encerrar antes de resolver', () => {
  const g = createGame('WIN', 'campaign', true, 44);
  for (let i = 0; i < 3; i++)
    addPlayer(g, String(i), false, i === 0 ? 'kaldor' : i === 1 ? 'aurelia' : 'vespera');
  startGame(g);
  g.battalions = [];
  const a = g.players[0],
    card = a.secretObjectives.find((c) => c.kind === 'WEALTH')!;
  a.selectedObjectiveId = card.id;
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  lands.slice(0, Math.ceil(lands.length * 0.4)).forEach((p, i) => {
    p.ownerId = a.id;
    p.occupierId = null;
    p.pacification = 100;
    p.unrest = 0;
    p.religion = a.faith;
    if (i < 3) p.strategicResource = 'GOLD_MINE';
  });
  lands.at(-1)!.ownerId = g.players[1].id;
  lands.at(-2)!.ownerId = g.players[2].id;
  a.gold = 1000;
  assert.ok(objectiveProgress(g, a, card).every((r) => r.progress === 1));
  assert.equal(g.phase, 'planning');
  resolveTurn(g);
  assert.equal(g.winnerId, null);
  assert.equal(a.objectiveStreak, 1);
  resolveTurn(g);
  assert.equal(g.winnerId, null);
  resolveTurn(g);
  assert.equal(g.winnerObjective, 'SECRET_OBJECTIVE');
  assert.equal(g.winnerId, a.id);
  assert.ok(viewFor(g, g.players[1].id).players[0].secretObjectives.length > 0);
});
test('declarar guerra e marchar é atômico, inclusive em destino inválido', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const u = army(g, a.id, 'castile'),
    before = structuredClone(g);
  assert.throws(() =>
    executeCommand(g, a.id, {
      type: 'DECLARE_WAR_AND_MOVE',
      targetRealmId: b.id,
      casusBelli: 'CONQUEST',
      battalionId: u.id,
      targetProvinceId: 'japan',
    }),
  );
  assert.deepEqual(g, before);
  const next = executeCommand(g, a.id, {
    type: 'DECLARE_WAR_AND_MOVE',
    targetRealmId: b.id,
    casusBelli: 'CONQUEST',
    battalionId: u.id,
    targetProvinceId: 'france',
  });
  assert.ok(next.wars[0].active);
  assert.equal(next.orders[a.id][0].type, 'MOVE_BATTALION');
});
test('migração v3 preserva sala e tesouro, desativa objetivos retroativos e arquiva a Dieta', () => {
  const { g } = setup();
  const legacy = structuredClone(g) as unknown as {
    version: number;
    players: { nationId: string }[];
  };
  legacy.version = 3;
  legacy.players[0].nationId = 'PORTUGAL';
  const next = migrateV3(legacy);
  assert.equal(next.version, 7);
  assert.equal(next.players[0].gold, g.players[0].gold);
  assert.equal(next.players[0].nationId, 'vespera');
  assert.equal(next.enableSecretObjectives, false);
  assert.equal(next.isPublic, false);
  assert.equal(next.maxTurns, 0);
  assert.ok(validGame(next));
});

test('forte próprio ou aliado vazio não cria um cerco contra o próprio reino', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.fortLevel = 3;
  const u = army(g, a.id, p.id, { infantry: 1 }),
    r = emptyTurnReport(1, g.diet);
  resolveBattle(g, u, p, r);
  assert.equal(r.battles.length, 0);
  p.ownerId = b.id;
  getRelation(g, a.id, b.id)!.militaryAccess.push(a.id);
  resolveBattle(g, u, p, r);
  assert.equal(r.battles.length, 0);
});

test('suprimento nacional de trigo reduz atrito e dividir pilhas não aumenta perdas', () => {
  const make = (grain: boolean, split: boolean) => {
    const {
      g,
      players: [a],
    } = setup();
    const p = g.provinces.find((p) => p.id === 'castile')!;
    p.baseSupplyLimit = 18;
    p.portLevel = 0;
    g.turn = 2;
    g.season = 'SUMMER';
    if (grain) {
      const q = g.provinces.find((p) => p.id === 'balkans')!;
      q.ownerId = a.id;
      q.strategicResource = 'GRAIN';
    }
    army(g, a.id, p.id, { infantry: split ? 15 : 30 });
    if (split) army(g, a.id, p.id, { infantry: 15 });
    const r = resolveTurn(g);
    return r.attritionLosses.filter((r) => r.ownerId === a.id).reduce((n, r) => n + r.losses, 0);
  };
  assert.equal(make(false, false), 3);
  assert.equal(make(true, false), 2);
  assert.equal(make(false, true), make(false, false));
});
test('inverno impõe perda mínima de vinte por cento fora do território próprio a todas as facções', () => {
  const run = (winter: boolean, immune: boolean) => {
    const {
      g,
      players: [a, b],
    } = setup();
    a.nationId = immune ? 'ferro_norte' : 'aurelia';
    declareWar(g, a.id, b.id, 'CONQUEST');
    const p = g.provinces.find((p) => p.id === 'france')!;
    p.baseSupplyLimit = 18;
    p.portLevel = 0;
    p.occupierId = a.id;
    p.pacification = 100;
    p.unrest = 0;
    p.religion = a.faith;
    const u = army(g, a.id, p.id, { infantry: 24 });
    g.turn = winter ? 10 : 4;
    for (const nation of g.players) {
      nation.activeDilemma = null;
      nation.lastDilemmaTurn = g.turn;
    }
    g.season = winter ? 'WINTER' : 'SUMMER';
    g.globalEvent = { id: 'GOLD_RUSH', startedTurn: g.turn, endsTurn: g.turn + 1 };
    const before = unitCount(u);
    resolveTurn(g);
    return before - unitCount(u);
  };
  assert.equal(run(false, false), 1);
  assert.equal(run(true, false), 5);
  assert.equal(run(true, true), 5);
});
test('moral própria recupera rapidamente; outono dobra comércio e conserva impostos', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.strategicResource = 'RELIC';
  const u = army(g, a.id, p.id, { infantry: 3 });
  u.morale = 50;
  resolveTurn(g);
  close(u.morale, 85);
  p.strategicResource = 'GRAIN';
  g.turn = 4;
  g.season = 'SUMMER';
  const summer = realmEconomy(g, a.id);
  g.turn = 7;
  g.season = 'AUTUMN';
  const autumn = realmEconomy(g, a.id);
  close(autumn.taxes / summer.taxes, 1);
  close(autumn.trade / summer.trade, 2);
});

test('divisão rápida mantém 50/50 com composições ímpares e a telemetria inclui tributo de vassalagem', () => {
  assert.equal(unitCount(splitHalf({ infantry: 1, cavalry: 1 })), 1);
  assert.equal(unitCount(splitHalf({ infantry: 6, cavalry: 1, artillery: 1 })), 4);
  const {
    g,
    players: [a, b],
  } = setup();
  a.nationId = 'aurelia';
  b.subjectOfId = a.id;
  const r = resolveTurn(g);
  for (const p of [a, b]) assert.equal(r.economy.find((m) => m.playerId === p.id)?.gold, p.gold);
});
