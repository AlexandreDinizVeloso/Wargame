import test from 'node:test';
import assert from 'node:assert/strict';
import { declareWar } from '../server/diplomacy';
import { resolutionPhase, primaryBattle } from '../shared/cinematics';
import { setup, army } from './fixtures';
import { computeVisibleProvinces, verticalRules } from '../shared/fogOfWar';
import {
  getNationAuthority,
  spendNationAuthority,
  integerValue,
  integerEventText,
} from '../shared/economy';
import { getRelation, orderCost } from '../shared/rules';
import {
  viewFor,
  executeCommand,
  resolveTurn,
  addPlayer,
  createGame,
  startGame,
} from '../server/game';
import { validGame } from '../server/storage';
import { exportCampaign, importCampaign } from '../server/campaignSaves';
import { emptyTurnReport } from '../shared/types';
import { resolveBattle } from '../server/combat';
import { unlockSkill } from '../server/armies';
import { log } from '../server/state';
function vertical() {
  const f = setup();
  f.g.matchConfig.ruleset = 'GOLD_098';
  f.g.matchConfig.verticalSlice = true;
  f.g.matchConfig.createdVersion = '0.99.0';
  return f;
}
test('v099: visibilidade alcança somente um salto a partir de território e unidades', () => {
  const {
    g,
    players: [me],
  } = vertical();
  const source = g.provinces.find((p) => p.id === 'portugal')!;
  const seen = computeVisibleProvinces(g, me.id);
  assert.ok(seen.has(source.id));
  for (const n of source.neighbors) assert.ok(seen.has(n));
  const distant = g.provinces.find((p) => p.kind === 'LAND' && !seen.has(p.id))!;
  assert.ok(distant);
  assert.ok(!seen.has(distant.id));
  army(g, me.id, distant.id);
  const next = computeVisibleProvinces(g, me.id);
  assert.ok(next.has(distant.id));
  for (const n of distant.neighbors) assert.ok(next.has(n));
});
test('v099: aliado, ocupação e vassalo compartilham visão', () => {
  const {
    g,
    players: [me, ally, subject],
  } = vertical();
  getRelation(g, me.id, ally.id)!.allied = true;
  subject.subjectOfId = me.id;
  const remote = g.provinces.find((p) => p.id === 'japan')!;
  remote.occupierId = ally.id;
  const seen = computeVisibleProvinces(g, me.id);
  assert.ok(seen.has(remote.id));
  assert.ok(seen.has(subject.originalCapitalId!));
});
test('v099: espionagem ativa revela alvo e expiração remove a visão', () => {
  const {
    g,
    players: [me, enemy],
  } = vertical();
  const p = g.provinces.find((p) => p.id === 'japan')!;
  p.ownerId = enemy.id;
  g.visionContracts.push({ buyerId: me.id, targetId: enemy.id, untilTurn: g.turn });
  assert.ok(computeVisibleProvinces(g, me.id).has(p.id));
  g.turn++;
  assert.ok(!computeVisibleProvinces(g, me.id).has(p.id));
});
test('v099: espectador e partida terminada exibem o mundo inteiro', () => {
  const {
    g,
    players: [me],
  } = vertical();
  assert.equal(computeVisibleProvinces(g, null).size, g.provinces.length);
  g.winnerId = me.id;
  assert.equal(computeVisibleProvinces(g, me.id).size, g.provinces.length);
});
test('v099: servidor oculta composições e comandantes distantes, preservando estado autoritativo', () => {
  const {
    g,
    players: [me, enemy],
  } = vertical();
  const unit = army(g, enemy.id, 'japan', { infantry: 20, artillery: 4 });
  g.commanders.push({
    id: 'spy-leak',
    ownerId: enemy.id,
    name: 'Segredo',
    lastStandUsed: false,
    isAdmiral: false,
    stars: 1,
    xp: 0,
    trait: 'IRON_WALL',
    assignedBattalionId: unit.id,
  });
  const view = viewFor(g, me.id);
  assert.ok(!view.battalions.some((a) => a.id === unit.id));
  assert.ok(!view.commanders.some((c) => c.id === 'spy-leak'));
  assert.ok(g.battalions.some((a) => a.id === unit.id));
  g.phase = 'finished';
  assert.ok(viewFor(g, me.id).battalions.some((a) => a.id === unit.id));
});
test('v099: tropas aliadas remotas são autorizadas', () => {
  const {
    g,
    players: [me, ally],
  } = vertical();
  getRelation(g, me.id, ally.id)!.allied = true;
  const unit = army(g, ally.id, 'japan');
  assert.ok(viewFor(g, me.id).battalions.some((a) => a.id === unit.id));
});
test('v099: autoridade soma componentes e gasto não duplica nem deixa saldo negativo', () => {
  const p = { influence: 5, prestige: 10, militaryXP: 20 };
  assert.equal(getNationAuthority(p), 35);
  assert.equal(spendNationAuthority(p, 26), true);
  assert.equal(getNationAuthority(p), 9);
  assert.ok(Object.values(p).every((n) => n >= 0));
  const before = structuredClone(p);
  assert.equal(spendNationAuthority(p, 10), false);
  assert.deepEqual(p, before);
  assert.equal(spendNationAuthority(p, -1), false);
  assert.equal(getNationAuthority({ influence: 1.2, prestige: 2.4, militaryXP: 0 }), 4);
});
test('v099: doutrina usa autoridade mesmo sem XP também em partidas anteriores', () => {
  const {
    g,
    players: [me],
  } = vertical();
  me.influence = 50;
  me.prestige = 100;
  me.militaryXP = 0;
  const before = getNationAuthority(me);
  unlockSkill(g, me.id, 'INF_T1');
  assert.ok(me.unlockedSkills.includes('INF_T1'));
  assert.ok(getNationAuthority(me) < before);
  const legacy = setup();
  legacy.players[0].militaryXP = 0;
  legacy.players[0].influence = 50;
  unlockSkill(legacy.g, legacy.players[0].id, 'INF_T1');
  assert.ok(legacy.players[0].unlockedSkills.includes('INF_T1'));
  assert.equal(verticalRules(legacy.g), false);
});
test('v099: ações diplomáticas cobram Autoridade e preservam ouro', () => {
  const {
    g,
    players: [me, other],
  } = vertical();
  me.influence = 0;
  me.militaryXP = 20;
  const before = getNationAuthority(me),
    gold = me.gold;
  const order = { type: 'DIPLOMACY', action: 'PROPOSE_ALLIANCE', targetRealmId: other.id } as const;
  assert.equal(orderCost(order, undefined, me, g).influence, 3);
  const result = executeCommand(g, me.id, { type: 'SUBMIT_ORDER', order });
  assert.equal(getNationAuthority(result.players[0]), before - 3);
  assert.equal(me.gold, gold);
});
test('v099: inteiros limpos em números e textos sem alterar cálculos econômicos', () => {
  assert.equal(integerValue(14.02), 14);
  assert.equal(integerValue(2.75), 3);
  assert.equal(integerValue(-2.75), -3);
  assert.equal(integerValue(NaN), 0);
  assert.equal(
    integerEventText('Ataque 14.02 × Defesa 2.34 · ouro 7,5'),
    'Ataque 14 × Defesa 2 · ouro 8',
  );
  const { g } = vertical();
  log(g, 'Ataque 14.02 × Defesa 2.34', 'battle');
  assert.equal(g.log.at(-1)!.text, 'Ataque 14 × Defesa 2');
});
test('v099: batalha registra composição original sem inferir tropas a partir das baixas', () => {
  const {
    g,
    players: [a, b],
  } = vertical();
  army(g, b.id, 'castile', { infantry: 5, cavalry: 1 });
  const attacker = army(g, a.id, 'castile', { infantry: 8, cavalry: 2, artillery: 1 });
  g.turn = 3;
  g.relations.find((r) => r.a === a.id && r.b === b.id)!.atWar = true;
  // Guerra formal para participação defensiva.
  declareWar(g, a.id, b.id, 'CONQUEST');
  const report = emptyTurnReport(g.turn, g.diet);
  resolveBattle(
    g,
    attacker,
    g.provinces.find((p) => p.id === 'castile')!,
    report,
  );
  assert.equal(report.battles[0].attackerCompositionBefore?.infantry, 8);
  assert.equal(report.battles[0].defenderCompositionBefore?.cavalry, 1);
});
test('v099: save completo conserva regras de visibilidade e autoridade', () => {
  const {
    g,
    players: [me],
  } = vertical();
  const saved = exportCampaign(g, me.id);
  const result = importCampaign(saved, 'NEW099').game;
  assert.ok(verticalRules(result));
  assert.equal(getNationAuthority(result.players[0]), getNationAuthority(me));
  assert.equal(validGame(result), true);
});
test('v099: oito bots resolvem campanha com Autoridade compartilhada sem corromper snapshots', () => {
  const g = createGame('V099', 'campaign', true, 995);
  g.matchConfig.ruleset = 'GOLD_098';
  g.matchConfig.verticalSlice = true;
  g.matchConfig.createdVersion = '0.99.0';
  for (const n of [
    'vespera',
    'aurelia',
    'kaldor',
    'turan',
    'ferro_norte',
    'sapiencia',
    'sol_invicto',
    'veridia',
  ] as const)
    addPlayer(g, n, true, n);
  startGame(g);
  for (let i = 0; i < 24 && g.phase === 'planning'; i++) {
    resolveTurn(g);
    assert.equal(validGame(g), true);
    for (const p of g.players) assert.ok(p.militaryXP >= 0);
  }
});

test('v099: fases cinematográficas respeitam 1,5s, 3,5s e 6,5s', () => {
  assert.equal(resolutionPhase(0), 'decrees');
  assert.equal(resolutionPhase(1499), 'decrees');
  assert.equal(resolutionPhase(1500), 'march');
  assert.equal(resolutionPhase(3500), 'battle');
  assert.equal(resolutionPhase(6500), 'complete');
  assert.equal(primaryBattle([], 'viewer'), undefined);
});

test('v099: prestígio negativo reduz Autoridade sem produzir moeda negativa', () => {
  assert.equal(getNationAuthority({ influence: 20, prestige: -10, militaryXP: 0 }), 10);
  assert.equal(getNationAuthority({ influence: 0, prestige: -10, militaryXP: 0 }), 0);
  assert.equal(Object.is(integerValue(-0.1), -0), false);
});

test('v099: relatórios ocultam aniquilações e cercos distantes sem apagar dados autoritativos', () => {
  const {
    g,
    players: [me, enemy],
  } = vertical();
  const report = emptyTurnReport(g.turn, g.diet);
  report.stackwipes.push({
    armyId: 'hidden',
    ownerId: enemy.id,
    provinceId: 'japan',
    troops: 25,
    reason: 'overwhelming_force',
  });
  report.sieges.push({
    provinceId: 'japan',
    attackerOwnerId: enemy.id,
    progress: 1,
    required: 4,
    completed: false,
    assault: false,
  });
  g.lastReport = report;
  const view = viewFor(g, me.id);
  assert.equal(view.lastReport!.stackwipes.length, 0);
  assert.equal(view.lastReport!.sieges.length, 0);
  assert.equal(g.lastReport.stackwipes.length, 1);
});

test('v099: camuflagem de Verídia não esconde formações do aliado', () => {
  const {
    g,
    players: [me, ally],
  } = vertical();
  ally.nationId = 'veridia';
  getRelation(g, me.id, ally.id)!.allied = true;
  const p = g.provinces.find((p) => p.id === 'japan')!;
  p.terrain = 'forest';
  p.ownerId = ally.id;
  const unit = army(g, ally.id, p.id);
  assert.ok(viewFor(g, me.id).battalions.some((a) => a.id === unit.id));
});
