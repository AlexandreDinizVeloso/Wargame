import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, army } from './fixtures';
import {
  executeCommand,
  resolveTurn,
  submitOrder,
  viewFor,
  createGame,
  addPlayer,
  startGame,
} from '../server/game';
import { instantArmyAction, recruitCommander, unlockSkill } from '../server/armies';
import { assaultSiege, advanceSieges, beginSiege } from '../server/siege';
import {
  compositionPower,
  combatPowers,
  resolveBattle,
  safestRetreat,
  retreatArmy,
} from '../server/combat';
import { declareWar, offerPeace } from '../server/diplomacy';
import { createBattalion } from '../server/state';
import {
  compositionOf,
  unitCount,
  unitPath,
  orderCost,
  realmEconomy,
  victoryStatus,
  peaceTermCost,
} from '../shared/rules';
import { BRANCHES, commanderFor, SKILLS } from '../shared/military';
import { buildingSlots, usedSlots, canBuild, subjugationEligible } from '../shared/development';
import { bridgeOptions } from '../shared/naval';
import { objectiveCards, objectiveProgress } from '../shared/strategy';
import { emptyTurnReport, type SkillId } from '../shared/types';
import { validGame } from '../server/storage';
import { migrateV4 } from '../server/migration';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.02, `${a} ≠ ${b}`);
const province = (g: ReturnType<typeof setup>['g'], id: string) =>
  g.provinces.find((p) => p.id === id)!;

test('dividir e fundir são instantâneos, conservam tropas/treinamento e permitem marchar no mesmo planejamento', () => {
  let {
    g,
    players: [a],
  } = setup();
  province(g, 'castile').ownerId = a.id;
  const u = army(g, a.id, 'portugal', { infantry: 10, cavalry: 2 });
  u.movementCredit = 0.5;
  const input = g;
  const original = structuredClone(g);
  g = executeCommand(g, a.id, {
    type: 'INSTANT_ARMY_ACTION',
    action: {
      type: 'SPLIT_BATTALION',
      battalionId: u.id,
      composition: compositionOf({ infantry: 5, cavalry: 1 }),
    },
  });
  assert.deepEqual(input, original);
  assert.equal(g.turn, 1);
  assert.equal(g.orders[a.id].length, 0);
  assert.equal(g.battalions.length, 2);
  assert.ok(g.battalions.every((a) => a.movementCredit === 0.5));
  const second = g.battalions.find((b) => b.id !== u.id)!;
  g = executeCommand(g, a.id, {
    type: 'INSTANT_ARMY_ACTION',
    action: { type: 'MERGE_BATTALIONS', battalionId: second.id, targetBattalionId: u.id },
  });
  assert.equal(g.battalions.length, 1);
  assert.equal(unitCount(g.battalions[0]), 12);
  assert.equal(g.battalions[0].training, 1.2);
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, targetProvinceId: 'castile' });
  resolveTurn(g);
  assert.equal(g.battalions[0].provinceId, 'castile');
});
test('turno travado bloqueia ações instantâneas até reabrir e não reinicia o prazo', () => {
  let {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 8 });
  g = executeCommand(g, a.id, { type: 'READY', ready: true }, 1000);
  assert.throws(() =>
    executeCommand(g, a.id, {
      type: 'INSTANT_ARMY_ACTION',
      action: {
        type: 'SPLIT_BATTALION',
        battalionId: u.id,
        composition: compositionOf({ infantry: 4 }),
      },
    }),
  );
  g = executeCommand(g, a.id, { type: 'READY', ready: false }, 2000);
  const deadline = g.turnDeadlineAt;
  g = executeCommand(g, a.id, {
    type: 'INSTANT_ARMY_ACTION',
    action: {
      type: 'SPLIT_BATTALION',
      battalionId: u.id,
      composition: compositionOf({ infantry: 4 }),
    },
  });
  assert.equal(g.turnDeadlineAt, deadline);
  assert.equal(g.battalions.length, 2);
});
test('autoMerge reúne somente formações compatíveis que terminaram juntas', () => {
  const {
    g,
    players: [a],
  } = setup();
  province(g, 'castile').ownerId = a.id;
  const x = army(g, a.id, 'portugal', { infantry: 4 }),
    y = army(g, a.id, 'castile', { infantry: 4 });
  x.autoMerge = y.autoMerge = true;
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: x.id,
    targetProvinceId: y.provinceId,
  });
  resolveTurn(g);
  assert.equal(g.battalions.filter((b) => b.ownerId === a.id).length, 1);
  assert.equal(unitCount(g.battalions[0]), 8);
});
test('guarnição local impede captura imediata de terra sem forte e cerco completa apenas na rodada seguinte', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'portugal', { infantry: 5 });
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, targetProvinceId: 'castile' });
  let r = resolveTurn(g);
  const p = province(g, 'castile');
  assert.equal(p.ownerId, b.id);
  assert.equal(p.occupierId, null);
  assert.equal(p.siege?.progress, 1);
  assert.equal(p.siege?.required, 2);
  assert.ok(r.sieges.some((s) => !s.completed));
  r = resolveTurn(g);
  assert.equal(p.siege, null);
  assert.equal(p.occupierId, a.id);
  assert.ok(r.sieges.some((s) => s.completed));
});
test('defensor pode reagir recrutando na janela de um cerco e expulsar o sitiante', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  b.gold = 200;
  b.manpower = 50;
  province(g, 'castile').barracksLevel = 2;
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'portugal', { infantry: 3 });
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, targetProvinceId: 'castile' });
  resolveTurn(g);
  submitOrder(g, b.id, { type: 'RECRUIT_BATTALION', provinceId: 'castile', infantry: 7 });
  resolveTurn(g);
  assert.equal(province(g, 'castile').occupierId, null);
  assert.equal(province(g, 'castile').siege, null);
});
test('artilharia, mestre de cerco, bombarda e bloqueio acumulam progresso em cerco fortificado', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.unlockedSkills = ['ART_T1', 'ART_T2A'];
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile');
  p.fortLevel = 3;
  const u = army(g, a.id, p.id, { infantry: 12, artillery: 3 }),
    c = recruitCommander(g, a.id, false, 'SIEGE_MASTER', undefined, true);
  c.assignedBattalionId = u.id;
  createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 3 }), { isFleet: true });
  beginSiege(g, u, p);
  g.turn = 2;
  const r = emptyTurnReport(2, g.diet);
  advanceSieges(g, r);
  assert.equal(p.siege?.progress, 7);
  assert.equal(p.siege?.required, 8);
  assert.equal(c.xp, 5);
  g.turn = 3;
  advanceSieges(g, emptyTurnReport(3, g.diet));
  assert.equal(p.occupierId, a.id);
  assert.equal(p.fortLevel, 2);
});
test('assaltar muralha adiciona três pontos, remove infantaria e reduz moral', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile');
  p.fortLevel = 2;
  const u = army(g, a.id, p.id, { infantry: 20 });
  beginSiege(g, u, p);
  const before = u.morale;
  assaultSiege(g, u, p, emptyTurnReport(1, g.diet));
  assert.equal(p.siege?.progress, 4);
  assert.equal(u.infantry, 13);
  assert.equal(u.morale, before - 25);
  assert.equal(p.occupierId, null);
});
test('ZoC impede avanço a outra terra inimiga e permite recuo ou avanço após concluir', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  declareWar(g, a.id, c.id, 'CONQUEST');
  const p = province(g, 'castile');
  p.fortLevel = 1;
  const u = army(g, a.id, p.id);
  assert.equal(unitPath(g, u, 'france')?.[0], 'portugal');
  assert.deepEqual(unitPath(g, u, 'portugal'), ['portugal']);
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['france'] }),
  );
  p.occupierId = a.id;
  assert.deepEqual(unitPath(g, u, 'france'), ['france']);
});
test('cerco perde progresso se os sitiantes saem ou fazem paz', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile'),
    u = army(g, a.id, p.id);
  beginSiege(g, u, p);
  u.provinceId = 'portugal';
  g.turn = 2;
  advanceSieges(g, emptyTurnReport(2, g.diet));
  assert.equal(p.siege, null);
  u.provinceId = p.id;
  beginSiege(g, u, p);
  g.wars[0].active = false;
  advanceSieges(g, emptyTurnReport(2, g.diet));
  assert.equal(p.siege, null);
});
test('líder gratuito inicia anexado; recrutamento custa 60 ouro e 15 influência e limita três', () => {
  const g = createGame('LEAD');
  for (let i = 0; i < 3; i++) addPlayer(g, String(i));
  startGame(g);
  assert.ok(g.players.every((p) => g.commanders.filter((c) => c.ownerId === p.id).length === 1));
  assert.ok(g.commanders.every((c) => c.assignedBattalionId));
  const a = g.players[0];
  a.gold = 200;
  a.influence = 40;
  recruitCommander(g, a.id, false, 'FOREST_RANGER');
  assert.equal(a.gold, 140);
  assert.equal(a.influence, 25);
  recruitCommander(g, a.id, true, 'SEA_WOLF');
  assert.throws(() => recruitCommander(g, a.id, false, 'IRON_WALL'));
  assert.equal(g.commanders.filter((c) => c.ownerId === a.id).length, 3);
});
test('atribuir líder é instantâneo, exclusivo e respeita general versus almirante', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const x = army(g, a.id, 'portugal'),
    y = army(g, a.id, 'portugal'),
    c = recruitCommander(g, a.id, false, 'SIEGE_MASTER', undefined, true);
  instantArmyAction(g, a.id, { type: 'ASSIGN_LEADER', battalionId: x.id, commanderId: c.id });
  instantArmyAction(g, a.id, { type: 'ASSIGN_LEADER', battalionId: y.id, commanderId: c.id });
  assert.equal(commanderFor(g, x), undefined);
  assert.equal(commanderFor(g, y)?.id, c.id);
  assert.throws(() =>
    instantArmyAction(g, b.id, { type: 'ASSIGN_LEADER', battalionId: x.id, commanderId: c.id }),
  );
  const f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 2 }), {
    isFleet: true,
  });
  assert.throws(() =>
    instantArmyAction(g, a.id, { type: 'ASSIGN_LEADER', battalionId: f.id, commanderId: c.id }),
  );
});
test('XP de batalha evolui líderes e concede experiência militar uma vez por nação', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const x = army(g, a.id, 'castile', { infantry: 20 }),
    c = recruitCommander(g, a.id, false, 'SIEGE_MASTER', undefined, true);
  c.assignedBattalionId = x.id;
  c.xp = 30;
  army(g, b.id, 'castile', { infantry: 3 });
  resolveBattle(g, x, province(g, 'castile'), emptyTurnReport(1, g.diet));
  assert.equal(c.xp, 50);
  assert.equal(c.stars, 2);
  assert.equal(a.militaryXP, 15);
  assert.equal(b.militaryXP, 15);
});
test('Bastião de Ferro protege a primeira derrota e dá defesa real', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'castile', { infantry: 5 }),
    p = province(g, 'castile'),
    before = compositionPower(g, u, p, true),
    c = recruitCommander(g, a.id, false, 'IRON_WALL', undefined, true);
  c.assignedBattalionId = u.id;
  near(compositionPower(g, u, p, true) / before, 1.2);
  retreatArmy(g, u, 3, emptyTurnReport(1, g.diet));
  assert.ok(g.battalions.includes(u));
  assert.equal(c.lastStandUsed, true);
  retreatArmy(g, u, 3, emptyTurnReport(1, g.diet));
  assert.ok(!g.battalions.includes(u));
});
test('Mestre da Emboscada e Vanguarda Relâmpago aplicam modificadores de terreno/invasão', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile'),
    u = army(g, a.id, p.id),
    base = compositionPower(g, u, p);
  const c = recruitCommander(g, a.id, false, 'FOREST_RANGER', undefined, true);
  c.assignedBattalionId = u.id;
  p.terrain = 'forest';
  const forest = compositionPower(g, u, p);
  c.assignedBattalionId = null;
  near(forest / compositionPower(g, u, p), 1.3);
  c.assignedBattalionId = u.id;
  c.trait = 'BLITZ_VANGUARD';
  near(compositionPower(g, u, p) / compositionPower(g, { ...u, id: 'unled' }, p), 1.15);
  assert.ok(base > 0);
});
test('Intendente reduz manutenção e protege de atrito mesmo com pilha além do limite', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = province(g, 'portugal');
  p.baseSupplyLimit = 1;
  p.portLevel = 0;
  const u = army(g, a.id, p.id, { infantry: 40 }),
    normal = realmEconomy(g, a.id).upkeep,
    c = recruitCommander(g, a.id, false, 'QUARTERMASTER', undefined, true);
  c.assignedBattalionId = u.id;
  near(realmEconomy(g, a.id).upkeep, normal * 0.7);
  const r = resolveTurn(g);
  assert.ok(!r.attritionLosses.some((r) => r.armyId === u.id));
});
test('quatro árvores respeitam custos, pré-requisitos e exclusividade A/B', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.militaryXP = 1000;
  assert.equal(SKILLS.length, 16);
  for (const branch of Object.keys(BRANCHES)) {
    assert.throws(() => unlockSkill(g, a.id, `${branch}_T3` as SkillId));
    const before = a.militaryXP;
    unlockSkill(g, a.id, `${branch}_T1` as SkillId);
    assert.equal(a.militaryXP, before - 25);
    unlockSkill(g, a.id, `${branch}_T2A` as SkillId);
    assert.throws(() => unlockSkill(g, a.id, `${branch}_T2B` as SkillId));
    unlockSkill(g, a.id, `${branch}_T3` as SkillId);
  }
  assert.equal(a.unlockedSkills.length, 12);
});
test('treinar concede oito XP e a rodada dez XP', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'portugal');
  submitOrder(g, a.id, { type: 'TRAIN_BATTALION', battalionId: u.id });
  resolveTurn(g);
  assert.equal(a.militaryXP, 18);
});
test('Falange anula choque e Mosqueteiros melhoram ataque; cavalaria e artilharia possuem bônus independentes', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.faith = b.faith = 'ANCESTRAL';
  a.nationId = b.nationId = 'aurelia';
  const p = province(g, 'castile');
  p.terrain = 'plains';
  const cav = army(g, a.id, p.id, { cavalry: 10 }),
    inf = army(g, b.id, p.id, { infantry: 10 }),
    base = compositionPower(g, cav, p, false, [inf]);
  b.unlockedSkills = ['INF_T1', 'INF_T2A'];
  near(compositionPower(g, cav, p, false, [inf]) / base, 1 / 1.4);
  a.unlockedSkills = ['CAV_T1', 'CAV_T2A'];
  assert.ok(compositionPower(g, cav, p) > base * 1.4);
  const gun = army(g, a.id, p.id, { artillery: 10 }),
    before = compositionPower(g, gun, p);
  a.unlockedSkills.push('ART_T1', 'ART_T2B');
  near(compositionPower(g, gun, p) / before, 1.15 * 1.25);
  a.unlockedSkills = ['INF_T1', 'INF_T2B'];
  const ownInf = army(g, a.id, p.id, { infantry: 10 });
  a.unlockedSkills = [];
  const attack = compositionPower(g, ownInf, p);
  a.unlockedSkills = ['INF_T1', 'INF_T2B'];
  near(compositionPower(g, ownInf, p) / attack, 1.2);
});
test('cidades têm dois slots, capitais/recursos três e upgrades usam o mesmo slot', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = province(g, 'portugal');
  p.capitalOf = null;
  p.portLevel = 0;
  assert.equal(buildingSlots(p), 2);
  a.gold = 1000;
  submitOrder(g, a.id, { type: 'BUILD_BUILDING', provinceId: p.id, building: 'MARKET' });
  resolveTurn(g);
  submitOrder(g, a.id, { type: 'BUILD_BUILDING', provinceId: p.id, building: 'MARKET' });
  resolveTurn(g);
  assert.equal(p.marketLevel, 2);
  assert.equal(usedSlots(p), 1);
  submitOrder(g, a.id, { type: 'BUILD_BUILDING', provinceId: p.id, building: 'BARRACKS' });
  resolveTurn(g);
  assert.equal(usedSlots(p), 2);
  assert.equal(canBuild(p, 'TEMPLE', a), false);
  p.strategicResource = 'RELIC';
  assert.equal(buildingSlots(p), 3);
  assert.equal(canBuild(p, 'TEMPLE', a), true);
});
test('demolição permite reespecializar e Kaldor tem fortaleza máxima três', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.gold = 1000;
  a.nationId = 'kaldor';
  const p = province(g, 'portugal');
  p.fortLevel = 2;
  submitOrder(g, a.id, { type: 'BUILD_BUILDING', provinceId: p.id, building: 'FORT' });
  resolveTurn(g);
  assert.equal(p.fortLevel, 3);
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'BUILD_BUILDING', provinceId: p.id, building: 'FORT' }),
  );
  submitOrder(g, a.id, { type: 'DEMOLISH_BUILDING', provinceId: p.id, building: 'FORT' });
  resolveTurn(g);
  assert.equal(p.fortLevel, 0);
  assert.ok(canBuild(p, 'TEMPLE', a));
});
test('quartéis treinam/reduzem recrutamento, fundição melhora equipamento e custa manutenção', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = province(g, 'portugal');
  p.barracksLevel = 1;
  p.foundryLevel = 1;
  const cost = orderCost({ type: 'RECRUIT_BATTALION', provinceId: p.id, infantry: 10 }, p, a, g);
  near(cost.gold, 25.5);
  const eco = realmEconomy(g, a.id);
  assert.equal(eco.industry, 2);
  assert.equal(eco.buildingUpkeep, 1.5);
  submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: p.id, infantry: 3 });
  resolveTurn(g);
  const u = g.battalions.find((b) => b.ownerId === a.id)!;
  near(u.training, 1.2);
  near(u.infantryPower, 1.1);
  p.strategicResource = 'IRON';
  assert.equal(realmEconomy(g, a.id).buildingUpkeep, 0);
});
test('mercado gera comércio e templo pacifica, reduz revolta e gera fervor', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = province(g, 'portugal'),
    before = realmEconomy(g, a.id);
  p.marketLevel = 1;
  const market = realmEconomy(g, a.id);
  assert.ok(market.trade > before.trade);
  assert.equal(market.manpower, before.manpower);
  p.templeLevel = 1;
  p.unrest = 40;
  p.pacification = 50;
  const fervor = a.fervor;
  army(g, a.id, p.id, { infantry: 3 });
  resolveTurn(g);
  assert.equal(p.pacification, 68.75);
  assert.equal(p.unrest, 15);
  assert.equal(a.fervor, fervor + 2);
});
test('inflação e corrupção limitam rendimento marginal sem reduzir a taxa básica inicial', () => {
  const {
    g,
    players: [a],
  } = setup();
  const lands = g.provinces.filter((p) => p.kind === 'LAND'),
    p = province(g, 'portugal'),
    o = { type: 'BUILD_BUILDING' as const, provinceId: p.id, building: 'MARKET' as const };
  const base = orderCost(o, p, a, g).gold;
  lands.slice(0, 8).forEach((q) => {
    q.ownerId = a.id;
    q.pacification = 100;
    q.baseTax = 20;
    q.religion = a.faith;
    q.unrest = 0;
  });
  near(orderCost(o, p, a, g).gold / base, 1.24);
  assert.ok(realmEconomy(g, a.id).administration > 0);
  assert.ok(realmEconomy(g, a.id).taxes < 8 * 20 * 1.15);
});
test('terra nunca nasce no mar e recuo terrestre filtra todas as zonas marítimas', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  assert.throws(() => army(g, a.id, 'north-atlantic'));
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'castile');
  const p = province(g, 'castile');
  p.neighbors = ['north-atlantic'];
  assert.equal(safestRetreat(g, u), undefined);
  u.morale = 50;
  retreatArmy(g, u, 1.2, emptyTurnReport(1, g.diet));
  assert.equal(u.provinceId, 'castile');
  assert.equal(u.stranded, true);
});
test('fórmula naval pura ignora religiões, canhões, cavalaria, fortalezas e terreno terrestre', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const f = createBattalion(g, a.id, 'baltic', compositionOf({ warships: 3, transports: 1 }), {
      isFleet: true,
      training: 1,
      morale: 80,
    }),
    enemy = createBattalion(g, b.id, 'baltic', compositionOf({ warships: 2 }), { isFleet: true });
  const p = province(g, 'baltic');
  p.fortLevel = 3;
  p.terrainDefenseBonus = 7;
  p.terrain = 'mountains';
  near(compositionPower(g, f, p), 9.5 * 0.9);
  const powers = combatPowers(g, [f], [enemy], p);
  near(powers.defensePower, compositionPower(g, enemy, p, true));
  const r = emptyTurnReport(1, g.diet);
  resolveBattle(g, f, p, r);
  assert.equal(r.battles[0].cavalryModifier, 1);
  assert.equal(r.battles[0].infantryModifier, 1);
  assert.equal(r.battles[0].artilleryModifier, 1);
  assert.equal(r.battles[0].terrainDefenseBonus, 1);
  assert.equal(r.battles[0].fortLevel, 0);
});
test('Lobo do Mar concede 25% ataque naval e captura navios em sorteio determinístico', () => {
  let captures = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const {
      g,
      players: [a, b],
    } = setup(seed);
    declareWar(g, a.id, b.id, 'CONQUEST');
    const f = createBattalion(g, a.id, 'baltic', compositionOf({ warships: 8 }), {
        isFleet: true,
        morale: 80,
      }),
      p = province(g, 'baltic'),
      before = compositionPower(g, f, p),
      c = recruitCommander(g, a.id, true, 'SEA_WOLF', undefined, true);
    c.assignedBattalionId = f.id;
    near(compositionPower(g, f, p) / before, 1.25);
    createBattalion(g, b.id, p.id, compositionOf({ warships: 2 }), { isFleet: true });
    const r = emptyTurnReport(1, g.diet);
    resolveBattle(g, f, p, r);
    captures += r.battles[0].capturedShips ?? 0;
  }
  assert.ok(captures > 0 && captures < 20);
});
test('ponte naval cruza duas costas em uma rodada sem colocar o exército no mar', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 6 }),
    f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 2, transports: 2 }), {
      isFleet: true,
    }),
    target = province(g, 'britain');
  target.ownerId = null;
  assert.ok(bridgeOptions(g, u, target).some((x) => x.id === f.id));
  submitOrder(g, a.id, {
    type: 'NAVAL_BRIDGE',
    battalionId: u.id,
    fleetId: f.id,
    targetProvinceId: target.id,
  });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'MOVE_BATTALION',
      battalionId: f.id,
      targetProvinceId: 'western-med',
    }),
  );
  const r = resolveTurn(g);
  assert.equal(u.provinceId, target.id);
  assert.equal(u.embarkedOnId, undefined);
  assert.equal(target.ownerId, null);
  assert.equal(target.siege?.progress, 1);
  assert.equal(r.movements.find((m) => m.battalionId === u.id)?.viaSeaId, 'north-atlantic');
  assert.ok(validGame(g));
});
test('ponte naval reserva capacidade e cancela travessia se frota for perdida', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 3 }),
    v = army(g, a.id, 'portugal', { infantry: 3 }),
    f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ transports: 1 }), {
      isFleet: true,
    });
  submitOrder(g, a.id, {
    type: 'NAVAL_BRIDGE',
    battalionId: u.id,
    fleetId: f.id,
    targetProvinceId: 'britain',
  });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'NAVAL_BRIDGE',
      battalionId: v.id,
      fleetId: f.id,
      targetProvinceId: 'britain',
    }),
  );
  g.battalions = g.battalions.filter((b) => b.id !== f.id);
  resolveTurn(g);
  assert.equal(u.provinceId, 'portugal');
});
test('Domínio Oceânico cruza duas zonas e protege frota/carga de atrito', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.unlockedSkills = ['NAV_T1', 'NAV_T2B', 'NAV_T3'];
  const u = army(g, a.id, 'portugal', { infantry: 6 }),
    f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 2, transports: 2 }), {
      isFleet: true,
    });
  for (const id of ['north-atlantic', 'western-med', 'eastern-med'])
    province(g, id).baseSupplyLimit = 1;
  submitOrder(g, a.id, { type: 'EMBARK_BATTALION', battalionId: u.id, fleetId: f.id });
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: f.id,
    path: ['western-med', 'eastern-med'],
  });
  const r = resolveTurn(g);
  assert.equal(f.provinceId, 'eastern-med');
  assert.equal(u.provinceId, f.provinceId);
  assert.equal(u.embarkedOnId, f.id);
  assert.ok(!r.attritionLosses.some((l) => l.armyId === f.id || l.armyId === u.id));
});
test('corsários transferem renda bloqueada e Galeões aumentam navios e apoio costeiro', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile'),
    f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 3 }), {
      isFleet: true,
    });
  const base = realmEconomy(g, b.id).income;
  a.unlockedSkills = ['NAV_T1', 'NAV_T2A'];
  assert.ok(realmEconomy(g, a.id).plunder > 0);
  assert.ok(realmEconomy(g, b.id).income < base);
  a.unlockedSkills = ['NAV_T1', 'NAV_T2B'];
  f.morale = 100;
  const attack = compositionPower(g, f, province(g, 'north-atlantic'));
  a.unlockedSkills = [];
  near(attack / compositionPower(g, f, province(g, 'north-atlantic')), 1.25);
  const u = army(g, a.id, p.id);
  const before = compositionPower(g, u, p);
  a.unlockedSkills = ['NAV_T1', 'NAV_T2B'];
  near(compositionPower(g, u, p) / before, 1.15);
});
test('subjugação custa 85 e exige pequena nação ou capital e 75% ocupados pelo proponente', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  lands.slice(0, 8).forEach((p) => {
    p.ownerId = b.id;
    p.capitalOf = null;
    p.occupierId = null;
  });
  lands[0].capitalOf = b.id;
  assert.equal(subjugationEligible(g, a.id, b.id), false);
  assert.equal(peaceTermCost(g.provinces, [{ type: 'SUBJUGATE' }]), 85);
  declareWar(g, a.id, b.id, 'CONQUEST');
  const w = g.wars[0];
  w.warScore = 100;
  assert.throws(() => offerPeace(g, a.id, w.id, [{ type: 'SUBJUGATE' }]));
  lands.slice(0, 6).forEach((p) => (p.occupierId = a.id));
  assert.equal(subjugationEligible(g, a.id, b.id), true);
  lands[0].occupierId = c.id;
  assert.equal(subjugationEligible(g, a.id, b.id), false);
});
test('dominação exige 75% com metade do peso de vassalos e não tem atalho de submissão geral', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  b.subjectOfId = a.id;
  c.subjectOfId = a.id;
  lands.forEach((p, i) => (p.ownerId = i < 27 ? a.id : b.id));
  assert.equal(victoryStatus(g), null);
  lands[27].ownerId = a.id;
  assert.equal(victoryStatus(g)?.winnerId, a.id);
});
test('cartas escalam para continente e mundo; rivalidade exige a capital original', () => {
  for (const mode of ['quick', 'campaign'] as const) {
    const g = createGame('CARDS', mode);
    for (let i = 0; i < 3; i++) addPlayer(g, String(i));
    startGame(g);
    const a = g.players[0],
      land = g.provinces.filter((p) => p.kind === 'LAND'),
      coast = land.filter((p) => p.isCoastal);
    for (const p of g.players) {
      const cards = objectiveCards(g, p);
      for (const c of cards) {
        if (c.kind === 'WEALTH') {
          assert.equal(
            c.requirements.find((r) => r.key === 'land')?.target,
            Math.max(5, Math.ceil(land.length * 0.4)),
          );
          assert.equal(
            c.requirements.find((r) => r.key === 'gold')?.target,
            mode === 'quick' ? 450 : 900,
          );
        }
        if (c.kind === 'SEAS') {
          assert.equal(
            c.requirements.find((r) => r.key === 'coast')?.target,
            Math.max(4, Math.ceil(coast.length * 0.45)),
          );
          assert.equal(c.requirements.find((r) => r.key === 'warships')?.target, 6);
        }
      }
    }
    assert.equal(a.objectiveStreak, 0);
  }
  const {
    g,
    players: [a, b],
  } = setup();
  const card = {
    id: 'rival',
    kind: 'RIVALRY' as const,
    name: 'Rival',
    rivalId: b.id,
    capitalId: 'castile',
    requirements: [{ key: 'rival', label: 'Capital', target: 1 }],
  };
  assert.equal(objectiveProgress(g, a, card)[0].value, 0);
  province(g, 'castile').occupierId = a.id;
  assert.equal(objectiveProgress(g, a, card)[0].value, 1);
});
test('objetivo secreto precisa de três rodadas, dispara aviso global e revela carta só no fim', () => {
  const g = createGame('SECRET5', 'campaign', true, 12);
  addPlayer(g, 'A', false, 'kaldor');
  addPlayer(g, 'B', false, 'aurelia');
  addPlayer(g, 'C', false, 'vespera');
  startGame(g);
  g.battalions = [];
  g.commanders = [];
  const a = g.players[0],
    card = a.secretObjectives.find((c) => c.kind === 'WEALTH')!;
  a.selectedObjectiveId = card.id;
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  lands.slice(0, 23).forEach((p, i) => {
    p.ownerId = a.id;
    p.occupierId = null;
    p.pacification = 100;
    p.unrest = 0;
    p.religion = a.faith;
    if (i < 2) p.strategicResource = 'RELIC';
  });
  lands.at(-1)!.ownerId = g.players[1].id;
  lands.at(-2)!.ownerId = g.players[2].id;
  a.gold = 950;
  let r = resolveTurn(g);
  assert.equal(g.phase, 'planning');
  assert.equal(a.objectiveStreak, 1);
  assert.ok(r.events.some((e) => e.includes('está a 2 rodada')));
  assert.equal(viewFor(g, g.players[1].id).players[0].secretObjectives.length, 0);
  resolveTurn(g);
  assert.equal(g.winnerId, null);
  resolveTurn(g);
  assert.equal(g.winnerObjective, 'SECRET_OBJECTIVE');
  assert.equal(g.winnerId, a.id);
  assert.ok(viewFor(g, g.players[1].id).players[0].secretObjectives.length > 0);
});
test('migração v4 corrige terrestre solto no mar, introduz líderes e ajusta cidades sem perder tropas', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 9 });
  u.provinceId = 'north-atlantic';
  const raw = structuredClone(g) as unknown as { version: number; commanders?: unknown[] };
  raw.version = 4;
  delete raw.commanders;
  const migrated = migrateV4(raw);
  assert.equal(migrated.version, 6);
  assert.equal(migrated.battalions[0].infantry, 9);
  assert.equal(province(migrated, migrated.battalions[0].provinceId).kind, 'LAND');
  assert.equal(migrated.commanders.length, 1);
  assert.ok(validGame(migrated));
});

test('Guarda Veterana reduz baixas campais de infantaria em 25% e recupera dez de moral', () => {
  const fight = (guard: boolean) => {
    const {
      g,
      players: [a, b],
    } = setup();
    declareWar(g, a.id, b.id, 'CONQUEST');
    a.unlockedSkills = guard ? ['INF_T1', 'INF_T2B', 'INF_T3'] : ['INF_T1', 'INF_T2B'];
    const p = province(g, 'castile');
    p.terrainDefenseBonus = 1;
    const u = army(g, a.id, p.id, { infantry: 50 });
    army(g, b.id, p.id, { infantry: 25 });
    const r = emptyTurnReport(1, g.diet);
    resolveBattle(g, u, p, r);
    return { u, battle: r.battles[0] };
  };
  const normal = fight(false),
    guard = fight(true);
  const lost = normal.battle.attackerCompositionLosses.infantry;
  assert.equal(guard.battle.attackerCompositionLosses.infantry, lost - Math.floor(lost * 0.25));
  assert.ok(guard.u.morale >= normal.u.morale + 10);
  assert.equal(guard.battle.attackerMoraleAfter, guard.u.morale);
});
test('Barragem Real reduz moral inicial em doze; Bateria protege canhões expostos', () => {
  const fight = (skills: SkillId[]) => {
    const {
      g,
      players: [a, b],
    } = setup();
    declareWar(g, a.id, b.id, 'CONQUEST');
    a.unlockedSkills = skills;
    const p = province(g, 'castile');
    const u = army(g, a.id, p.id, { infantry: 2, artillery: 10 });
    army(g, b.id, p.id, { infantry: 40 });
    const r = emptyTurnReport(1, g.diet);
    resolveBattle(g, u, p, r);
    return r.battles[0];
  };
  const untrained = fight([]),
    battery = fight(['ART_T1', 'ART_T2B']),
    barrage = fight(['ART_T1', 'ART_T2B', 'ART_T3']);
  assert.equal(barrage.defenderMoraleBefore, battery.defenderMoraleBefore - 12);
  assert.ok(
    battery.attackerCompositionLosses.artillery < untrained.attackerCompositionLosses.artillery,
  );
});
test('Manobra Envolvente exige metade de cavalaria para ampliar alcance', () => {
  const run = (cavalry: number) => {
    const {
      g,
      players: [a],
    } = setup();
    a.unlockedSkills = ['CAV_T1', 'CAV_T2B', 'CAV_T3'];
    for (const id of ['castile', 'france']) {
      province(g, id).ownerId = a.id;
      province(g, id).terrain = 'plains';
    }
    province(g, 'japan').ownerId = g.players[1].id;
    province(g, 'korea').ownerId = g.players[2].id;
    const u = army(g, a.id, 'portugal', { infantry: 5, cavalry });
    submitOrder(g, a.id, {
      type: 'MOVE_BATTALION',
      battalionId: u.id,
      path: ['castile', 'france'],
    });
    resolveTurn(g);
    return u;
  };
  assert.equal(run(5).provinceId, 'france');
  assert.equal(run(4).provinceId, 'castile');
});
test('ponte naval respeita zona de controle do forte de origem', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile');
  p.fortLevel = 1;
  const u = army(g, a.id, p.id),
    f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ transports: 3, warships: 1 }), {
      isFleet: true,
    });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'NAVAL_BRIDGE',
      battalionId: u.id,
      fleetId: f.id,
      targetProvinceId: 'usa-east',
    }),
  );
  submitOrder(g, a.id, {
    type: 'NAVAL_BRIDGE',
    battalionId: u.id,
    fleetId: f.id,
    targetProvinceId: 'portugal',
  });
  resolveTurn(g);
  assert.equal(u.provinceId, 'portugal');
});
test('Bombarda melhora o ponto de artilharia mesmo com apenas um canhão', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = province(g, 'castile');
  p.fortLevel = 3;
  a.unlockedSkills = ['ART_T1', 'ART_T2A'];
  const u = army(g, a.id, p.id, { infantry: 5, artillery: 1 });
  beginSiege(g, u, p);
  g.turn++;
  advanceSieges(g, emptyTurnReport(g.turn, g.diet));
  assert.equal(p.siege?.progress, 5);
});

test('Pax mantém três rodadas militares e depois três rodadas de condição completa, com aviso', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  a.nationId = 'aurelia';
  a.gold = 10000;
  a.stability = 90;
  const lands = g.provinces.filter((p) => p.kind === 'LAND');
  lands.slice(0, 31).forEach((p) => {
    p.ownerId = a.id;
    p.occupierId = null;
    p.pacification = 100;
    p.unrest = 0;
    p.religion = a.faith;
  });
  lands.at(-1)!.ownerId = b.id;
  lands.at(-2)!.ownerId = c.id;
  for (const other of [b, c]) {
    const r = g.relations.find(
      (r) => (r.a === a.id && r.b === other.id) || (r.b === a.id && r.a === other.id),
    )!;
    r.allied = true;
    r.trust = 50;
  }
  army(g, a.id, 'portugal', { infantry: 20 });
  a.secretObjectives = objectiveCards(g, a);
  a.selectedObjectiveId = a.secretObjectives.find((c) => c.kind === 'PAX')!.id;
  resolveTurn(g);
  assert.equal(a.paxStreak, 1);
  assert.equal(a.objectiveStreak, 0);
  resolveTurn(g);
  assert.equal(a.paxStreak, 2);
  assert.equal(a.objectiveStreak, 0);
  const third = resolveTurn(g);
  assert.equal(a.paxStreak, 3);
  assert.equal(a.objectiveStreak, 1);
  assert.equal(g.winnerId, null);
  assert.ok(third.events.some((e) => e.includes('2 rodada(s) de concluir')));
  resolveTurn(g);
  assert.equal(g.winnerId, null);
  resolveTurn(g);
  assert.equal(g.winnerId, a.id);
  assert.equal(a.objectiveStreak, 3);
});
test('bot negocia terras após capitulação em vez de depender do antigo atalho de submissão', async () => {
  const { planBot } = await import('../server/game');
  const {
    g,
    players: [a, b],
  } = setup();
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  province(g, 'castile').occupierId = a.id;
  const { updateWarScores } = await import('../server/diplomacy');
  updateWarScores(g);
  assert.equal(w.warScore, 100);
  planBot(g, a);
  assert.equal(w.active, false);
  assert.equal(province(g, 'castile').ownerId, a.id);
  assert.equal(b.subjectOfId, null);
});

test('ponte cancela se a frota recuar mesmo para outro mar que banha as mesmas costas', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  province(g, 'castile').ownerId = a.id;
  province(g, 'western-med').baseSupplyLimit = 100;
  for (const p of g.provinces) p.portLevel = 0;
  province(g, 'japan').ownerId = b.id;
  declareWar(g, a.id, b.id, 'CONQUEST');
  declareWar(g, a.id, c.id, 'CONQUEST');
  const u = army(g, a.id, 'castile', { infantry: 1 });
  const f = createBattalion(
    g,
    a.id,
    'north-atlantic',
    compositionOf({ warships: 6, transports: 8 }),
    { isFleet: true },
  );
  const enemy = createBattalion(g, b.id, 'north-atlantic', compositionOf({ warships: 10 }), {
    isFleet: true,
  });
  submitOrder(g, a.id, {
    type: 'NAVAL_BRIDGE',
    battalionId: u.id,
    fleetId: f.id,
    targetProvinceId: 'france',
  });
  // Combat forces the fleet out of its original sea while both coasts remain in reach.
  assert.equal(enemy.provinceId, 'north-atlantic');
  const r = resolveTurn(g);
  assert.ok(g.battalions.includes(f));
  assert.equal(f.provinceId, 'western-med');
  assert.equal(u.provinceId, 'castile');
  assert.ok(r.events.some((e) => e.includes('ponte naval indisponível')));
});
test('frota com marcha persistente precisa cancelar sua rota antes de oferecer ponte', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'portugal', { infantry: 1 });
  const f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ transports: 2 }), {
    isFleet: true,
  });
  f.pathQueue = ['western-med'];
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'NAVAL_BRIDGE',
      battalionId: u.id,
      fleetId: f.id,
      targetProvinceId: 'usa-east',
    }),
  );
});
