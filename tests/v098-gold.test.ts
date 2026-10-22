import test from 'node:test';
import assert from 'node:assert/strict';
import { army, setup } from './fixtures';
import { NATIONS, compositionOf, getRelation, orderCost, realmEconomy } from '../shared/rules';
import {
  createGame,
  addPlayer,
  startGame,
  resolveTurn,
  executeCommand,
  viewFor,
  planBot,
} from '../server/game';
import { createBattalion } from '../server/state';
import { provinceRecruitLimit, recruitmentBlock, maintenanceOf } from '../shared/economy';
import { supplyConsumption, invasionAttrition } from '../shared/logistics';
import { effectiveSupply } from '../shared/strategy';
import { seaTradeNodes } from '../shared/maritime';
import { combatPowers } from '../shared/combat';
import { siegeProgressPerTurn, siegeResistance } from '../shared/siege';
import { campaignEra, technologyCost } from '../shared/world';
import {
  declareWar,
  updateWarScores,
  offerPeace,
  answerOffer,
  applyPeace,
} from '../server/diplomacy';
import { treatyCost } from '../shared/treaties';
import { resolveBattle } from '../server/combat';
import { emptyTurnReport } from '../shared/types';
import { emergencyLevy } from '../server/emergency';
import { levyReason } from '../shared/emergency';
import { SCENARIOS } from '../shared/scenarios';
import { exportCampaign, importCampaign } from '../server/campaignSaves';
import { validGame } from '../server/storage';
import { eraTransition } from '../server/goldWorld';
import { MAP_LENSES, provinceLensColor, provinceLogistics } from '../shared/mapLenses';
import { unitStatus, availableConstruction } from '../shared/outliner';
import { ACHIEVEMENTS, emptyProfile, updateProfile } from '../shared/achievements';
function gold() {
  const f = setup();
  f.g.matchConfig.ruleset = 'GOLD_098';
  f.g.matchConfig.createdVersion = '0.98.0';
  f.g.matchConfig.scenarioId = 'CLASSIC';
  f.g.matchConfig.campaignId = 'gold-test';
  f.g.enableSecretObjectives = false;
  return f;
}
function scenario(id: (typeof SCENARIOS)[number]['id'], count = 3) {
  const s = SCENARIOS.find((s) => s.id === id)!;
  const g = createGame('GOLD98', s.mode ?? 'campaign', false, 42, s.theater ?? 'EUROPE');
  g.matchConfig.ruleset = 'GOLD_098';
  g.matchConfig.scenarioId = id;
  g.matchConfig.createdVersion = '0.98.0';
  for (let i = 0; i < count; i++) addPlayer(g, `P${i}`, false, NATIONS[i].id);
  startGame(g);
  return g;
}
test('v098: todas as oito facções apresentam passivas estruturadas', () => {
  assert.equal(NATIONS.length, 8);
  for (const n of NATIONS) {
    assert.ok(n.factionTrait.name);
    assert.ok(n.factionTrait.effects.length >= 2);
  }
});
test('v098: Véspera reduz frete, amplia recrutamento e disputa nós com portos', () => {
  const {
      g,
      players: [a, b],
    } = gold(),
    p = g.provinces.find((p) => p.id === 'portugal')!;
  p.marketLevel = 1;
  assert.equal(
    orderCost({ type: 'AUTO_TRANSPORT', battalionId: 'a', targetProvinceId: 'b' }, undefined, a, g)
      .gold,
    7.5,
  );
  assert.equal(provinceRecruitLimit(p, a, g, { infantry: 3 }), 3);
  assert.equal(
    recruitmentBlock(p, { type: 'RECRUIT_BATTALION', provinceId: p.id, infantry: 3 }, g.turn, a, g),
    null,
  );
  const sea = g.provinces.find((q) => q.kind === 'SEA_ZONE' && q.neighbors.includes(p.id))!;
  createBattalion(g, a.id, sea.id, compositionOf({ warships: 1, transports: 1 }), {
    isFleet: true,
    morale: 80,
  });
  createBattalion(g, b.id, sea.id, compositionOf({ warships: 1, transports: 2 }), {
    isFleet: true,
    morale: 80,
  });
  const node = seaTradeNodes(g).find((n) => n.seaId === sea.id)!;
  assert.equal(node.ownerId, a.id);
  assert.equal(node.contenders[0].power, 4.5);
});
test('v098: Aurélia pacifica 50% mais rápido e templos elevam moral máxima', () => {
  let {
    g,
    players: [a],
  } = gold();
  a.nationId = 'aurelia';
  a.faith = 'SOLAR';
  let p = g.provinces.find((p) => p.id === 'portugal')!;
  p.religion = 'SOLAR';
  p.pacification = 20;
  g = executeCommand(g, a.id, {
    type: 'SUBMIT_ORDER',
    order: { type: 'PACIFY', provinceId: p.id },
  });
  resolveTurn(g);
  p = g.provinces.find((p) => p.id === 'portugal')!;
  assert.equal(p.pacification, 72.5);
  const u = army(g, a.id, p.id);
  u.morale = 100;
  p.templeLevel = 1;
  a = g.players.find((q) => q.id === a.id)!;
  a.stability = 50;
  resolveTurn(g);
  assert.equal(u.moraleCap, 110);
  assert.equal(u.morale, 110);
  assert.ok(a.stability >= 54);
});
test('v098: Kaldor reduz custos de artilharia e fundições melhoram tiro/cerco', () => {
  const {
    g,
    players: [a],
  } = gold();
  a.nationId = 'kaldor';
  const p = g.provinces.find((p) => p.id === 'portugal')!,
    target = g.provinces.find((p) => p.id === 'castile')!,
    u = army(g, a.id, p.id, { infantry: 5, artillery: 2 });
  assert.equal(
    orderCost({ type: 'RECRUIT_BATTALION', provinceId: p.id, artillery: 1 }, p, a, g).gold,
    6,
  );
  assert.equal(maintenanceOf({ artillery: 1 }, a.nationId), 1.5);
  const old = combatPowers(g, [u], [], target).attackPower,
    progress = siegeProgressPerTurn(g, a.id, [u], target);
  p.foundryLevel = 1;
  assert.ok(combatPowers(g, [u], [], target).attackPower > old);
  assert.equal(siegeProgressPerTurn(g, a.id, [u], target), progress + 1);
});
test('v098: Turan recruta cavalaria sem Quartel e maioria montada reduz consumo', () => {
  const {
    g,
    players: [a],
  } = gold();
  a.nationId = 'turan';
  const p = g.provinces.find((p) => p.id === 'portugal')!,
    t = g.provinces.find((p) => p.id === 'castile')!;
  p.barracksLevel = p.foundryLevel = 0;
  t.terrain = 'plains';
  assert.equal(
    recruitmentBlock(p, { type: 'RECRUIT_BATTALION', provinceId: p.id, cavalry: 2 }, 1, a, g),
    null,
  );
  const u = army(g, a.id, p.id, { cavalry: 5, infantry: 1 });
  assert.equal(supplyConsumption(g, u, 'turan'), 4.5);
  assert.equal(maintenanceOf({ cavalry: 1 }, 'turan'), 1.08);
  const legacy = structuredClone(g);
  delete legacy.matchConfig.ruleset;
  assert.ok(
    Math.abs(
      combatPowers(g, [u], [], t).attackPower / combatPowers(legacy, [u], [], t).attackPower - 1.2,
    ) < 0.001,
  );
});
test('v098: Ferro-Norte é imune ao inverno e ganha choque no primeiro turno de guerra', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  a.nationId = 'ferro_norte';
  const p = g.provinces.find((p) => p.id === 'portugal')!,
    target = g.provinces.find((p) => p.id === 'castile')!,
    u = army(g, a.id, p.id, { infantry: 5 });
  const summer = effectiveSupply(g, a.id, p);
  g.season = 'WINTER';
  assert.equal(effectiveSupply(g, a.id, p), summer);
  const before = combatPowers(g, [u], [], target).attackPower;
  declareWar(g, a.id, b.id, 'CONQUEST');
  assert.ok(combatPowers(g, [u], [], target).attackPower > before);
  g.turn++;
  assert.equal(combatPowers(g, [u], [], target).attackPower, before);
});
test('v098: Sapiência recebe +35% XP de batalha e −15% construção', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  a.nationId = 'sapiencia';
  const p = g.provinces.find((p) => p.id === 'portugal')!,
    target = g.provinces.find((p) => p.id === 'castile')!;
  const u = army(g, a.id, p.id, { infantry: 12 });
  army(g, b.id, target.id, { infantry: 2 });
  declareWar(g, a.id, b.id, 'CONQUEST');
  resolveBattle(g, u, target, emptyTurnReport(g.turn, g.diet));
  assert.equal(a.militaryXP, 20.25);
  const cost = orderCost(
    { type: 'BUILD_BUILDING', provinceId: p.id, building: 'MARKET' },
    p,
    a,
    g,
  ).gold;
  const legacy = structuredClone(g);
  delete legacy.matchConfig.ruleset;
  assert.equal(
    cost,
    Math.round(
      orderCost({ type: 'BUILD_BUILDING', provinceId: p.id, building: 'MARKET' }, p, a, legacy)
        .gold *
        0.85 *
        100,
    ) / 100,
  );
});
test('v098: Sol Invicto tem fortes 25% mais resistentes e defesa veterana com recarga seis', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  b.nationId = 'sol_invicto';
  b.gold = 100;
  const p = g.provinces.find((p) => p.id === 'castile')!;
  p.fortLevel = 1;
  const u = army(g, a.id, 'portugal'),
    d = army(g, b.id, p.id);
  const legacy = structuredClone(g);
  delete legacy.matchConfig.ruleset;
  assert.equal(siegeResistance(g, p), 5);
  assert.ok(
    Math.abs(
      combatPowers(g, [u], [d], p).defensePower / combatPowers(legacy, [u], [d], p).defensePower -
        1.25,
    ) < 0.001,
  );
  declareWar(g, a.id, b.id, 'CONQUEST');
  b.lostProvinceIds = ['portugal'];
  emergencyLevy(g, b.id);
  const levy = g.battalions.find((a) => a.name === 'Defesa da Pátria')!;
  assert.equal(levy.morale, 100);
  assert.equal(levy.training, 1.25);
  g.turn = 6;
  assert.match(levyReason(g, b.id)!, /rodada 7/);
  g.turn = 7;
  b.militaryXP += 15;
  assert.equal(levyReason(g, b.id), null);
});
test('v098: Verídia recebe 20% em terreno e duplica atrito em terras pacificadas', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  a.nationId = 'veridia';
  const p = g.provinces.find((p) => p.id === 'portugal')!,
    target = g.provinces.find((p) => p.id === 'castile')!;
  p.terrain = target.terrain = 'forest';
  const u = army(g, a.id, p.id);
  const legacy = structuredClone(g);
  delete legacy.matchConfig.ruleset;
  assert.ok(
    Math.abs(
      combatPowers(g, [u], [], target).attackPower /
        combatPowers(legacy, [u], [], target).attackPower -
        1.2,
    ) < 0.001,
  );
  assert.equal(invasionAttrition(g, p.id, b.id), 2);
  assert.equal(invasionAttrition(g, p.id, a.id), 1);
});
test('v098: eras têm fronteiras exatas, comércio, tecnologia e cerco modificados', () => {
  assert.equal(campaignEra(8), 'ERA_CONSOLIDATION');
  assert.equal(campaignEra(9), 'ERA_EMPIRES');
  assert.equal(campaignEra(20), 'ERA_EMPIRES');
  assert.equal(campaignEra(21), 'ERA_HEGEMONY');
  const {
    g,
    players: [a],
  } = gold();
  const p = g.provinces.find((p) => p.id === 'castile')!,
    u = army(g, a.id, 'portugal');
  const base = siegeProgressPerTurn(g, a.id, [u], p);
  g.turn = 9;
  assert.equal(technologyCost(g, 2, 45), 40.5);
  const report = emptyTurnReport(9, g.diet);
  eraTransition(g, report);
  const eventCount = report.events.length;
  eraTransition(g, report);
  assert.equal(report.events.length, eventCount);
  assert.ok(eventCount > 0);
  g.turn = 21;
  assert.equal(siegeProgressPerTurn(g, a.id, [u], p), base + 1);
});
test('v098: War Score soma capital/comum, batalhas e bloqueios deterministicamente', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  const w = declareWar(g, a.id, b.id, 'CONQUEST'),
    capital = g.provinces.find((p) => p.id === 'castile')!,
    common = g.provinces.find((p) => p.id === 'maghreb')!;
  capital.occupierId = a.id;
  common.ownerId = b.id;
  common.occupierId = a.id;
  common.portLevel = 0;
  w.battleWins = 2;
  const sea = g.provinces.find((p) => p.kind === 'SEA_ZONE' && capital.neighbors.includes(p.id))!;
  createBattalion(g, a.id, sea.id, compositionOf({ warships: 2 }), { isFleet: true });
  updateWarScores(g);
  assert.equal(w.warScore, 50);
  assert.equal(w.battleScore, 8);
  assert.equal(w.blockadeScore, 5);
  w.battleWins = 100;
  updateWarScores(g);
  assert.equal(w.battleScore, 40);
});
test('v098: tratados custam 20/25/30/75 e não permitem paz branca com exigências', () => {
  assert.equal(treatyCost([{ type: 'WHITE_PEACE' }]), 0);
  assert.equal(
    treatyCost([
      { type: 'CEDE_PROVINCES', provinceIds: ['a', 'b'] },
      { type: 'WAR_REPARATIONS', immediateTribute: 0 },
      { type: 'HUMILIATE_DEMILITARIZE' },
    ]),
    95,
  );
  assert.equal(treatyCost([{ type: 'SUBJUGATE_VASSAL' }]), 75);
  const {
      g,
      players: [a, b],
    } = gold(),
    w = declareWar(g, a.id, b.id, 'CONQUEST');
  w.warScore = 100;
  assert.throws(
    () =>
      applyPeace(g, w, a.id, [
        { type: 'WHITE_PEACE' },
        { type: 'WAR_REPARATIONS', immediateTribute: 0 },
      ]),
    /Paz branca/,
  );
  const before = a.prestige;
  assert.throws(
    () =>
      applyPeace(g, w, a.id, [{ type: 'HUMILIATE_DEMILITARIZE' }, { type: 'SUBJUGATE_VASSAL' }]),
    /Pontuação/,
  );
  // 105 points cannot fit a score of 100: validation rejects before mutations.
  assert.equal(before, a.prestige);
});
test('v098: derrota pode propor reparações e ambas as partes veem o sentido correto', () => {
  const {
      g,
      players: [a, b],
    } = gold(),
    w = declareWar(g, a.id, b.id, 'CONQUEST');
  w.battleWins = -10;
  g.provinces.find((p) => p.id === 'portugal')!.occupierId = b.id;
  offerPeace(g, a.id, w.id, [{ type: 'WAR_REPARATIONS', immediateTribute: 0 }], true);
  const offer = g.offers.find((o) => o.kind === 'peace')!;
  assert.equal(offer.concession, true);
  answerOffer(g, b.id, offer.id, true);
  assert.equal(g.reparations[0].payerId, a.id);
  assert.equal(g.reparations[0].recipientId, b.id);
  assert.equal(w.treatyWinnerId, b.id);
  assert.equal(g.reparations[0].untilTurn, g.turn + 4);
});
test('v098: bot exausto envia concessões proativas sem spam no Conselho', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  a.bot = true;
  a.warExhaustion = 30;
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  w.battleWins = -10;
  g.provinces.find((p) => p.id === 'portugal')!.occupierId = b.id;
  planBot(g, a);
  assert.ok(g.offers.some((o) => o.kind === 'peace' && o.from === a.id && o.concession));
  assert.ok(g.chat.filter((m) => m.turn === g.turn).length <= 1);
});
test('v098: quatro cenários criam estados válidos para oito nações', () => {
  for (const id of SCENARIOS.filter((s) => s.id !== 'CLASSIC').map((s) => s.id)) {
    const g = scenario(id, 8);
    assert.equal(validGame(g), true, `${id} deve persistir`);
    if (id === 'SHATTERED_EMPIRES') {
      assert.equal(g.turn, 9);
      for (const p of g.players) {
        assert.equal(p.gold, 150);
        assert.equal(g.provinces.filter((q) => q.ownerId === p.id).length, 4);
      }
    }
    if (id === 'AGE_OF_SAIL')
      for (const p of g.players) {
        assert.ok(p.unlockedSkills.includes('NAV_T1'));
        if (g.provinces.some((q) => q.ownerId === p.id && q.isCoastal))
          assert.equal(g.battalions.filter((a) => a.ownerId === p.id && a.isFleet).length, 2);
      }
    if (id === 'IRON_CROWN_EUROPE') assert.equal(g.diet.memberRealmIds.length, 8);
  }
});
test('v098: save completo preserva campanha sem exportar sessões e importa em sala privada', () => {
  const g = scenario('SHATTERED_EMPIRES'),
    save = exportCampaign(g, g.hostId);
  assert.ok(!('sessions' in save));
  const imported = importCampaign(save, 'NEW098');
  assert.equal(imported.game.code, 'NEW098');
  assert.equal(imported.game.isPublic, false);
  assert.equal(imported.game.turn, g.turn);
  assert.deepEqual(imported.game.battalions, g.battalions);
  assert.equal(validGame(imported.game), true);
  assert.throws(() => exportCampaign(g, 'intruso'), /anfitrião/);
  assert.throws(
    () => importCampaign({ format: 'CONCORDIA_SAVE_098', game: {} }, 'ABC098'),
    /Estado inválido/,
  );
});
test('v098: cinco lentes e outliner refletem relações, fome, ordens e construções', () => {
  const {
      g,
      players: [a, b],
    } = gold(),
    p = g.provinces.find((p) => p.id === 'portugal')!,
    u = army(g, a.id, p.id, { infantry: 30 });
  const view = viewFor(g, a.id);
  assert.deepEqual(
    MAP_LENSES.map((l) => l.key),
    ['F1', 'F2', 'F3', 'F4', 'F5'],
  );
  assert.equal(provinceLensColor(view, p, 'DIPLOMATIC', a.id), '#2563eb');
  getRelation(view, a.id, b.id)!.allied = true;
  assert.equal(
    provinceLensColor(
      view,
      view.provinces.find((p) => p.id === 'castile')!,
      'DIPLOMATIC',
      a.id,
    ),
    '#06b6d4',
  );
  assert.ok(provinceLogistics(view, p, a.id).danger);
  assert.equal(unitStatus(view, u).id, 'IDLE');
  view.plannedOrders = [{ type: 'MOVE_BATTALION', battalionId: u.id, path: ['maghreb'] }];
  assert.equal(unitStatus(view, u).id, 'MARCH');
  u.encircled = true;
  assert.equal(unitStatus(view, u).id, 'ALERT');
  a.gold = 500;
  assert.ok(availableConstruction(viewFor(g, a.id), a.id).length > 0);
});
test('v098: perfil é idempotente em reconexão, replay e importação', () => {
  const g = scenario('CLASSIC');
  g.matchConfig.campaignId = 'stable-match';
  g.phase = 'finished';
  g.winnerId = g.hostId;
  g.winnerObjective = 'SECRET_OBJECTIVE';
  g.victoryRecord = { winnerId: g.hostId, objective: 'SECRET_OBJECTIVE', turn: 1 };
  let p = updateProfile(emptyProfile(), viewFor(g, g.hostId), g.hostId, 'now');
  assert.equal(ACHIEVEMENTS.length, 12);
  assert.equal(p.stats.wins, 1);
  assert.ok(p.unlocked.FIRST_CROWN);
  assert.ok(p.unlocked.HIDDEN_HAND);
  const old = structuredClone(p);
  p = updateProfile(p, viewFor(g, g.hostId), g.hostId, 'later');
  assert.deepEqual(p, old);
  g.code = 'NEW098';
  p = updateProfile(p, viewFor(g, g.hostId), g.hostId, 'later');
  assert.deepEqual(p, old);
});

test('v098: reparações são 25% do bruto durante exatamente cinco resoluções', () => {
  const {
    g,
    players: [a, b],
  } = gold();
  g.players.forEach((p) => (p.gold = 500));
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  w.warScore = 100;
  applyPeace(g, w, a.id, [{ type: 'WAR_REPARATIONS', immediateTribute: 0 }]);
  for (let i = 0; i < 6; i++) {
    for (const p of g.players) {
      p.activeDilemma = null;
      p.lastDilemmaTurn = g.turn;
    }
    const forecast = realmEconomy(g, b.id),
      before = b.gold;
    const report = resolveTurn(g);
    const payments = report.diplomaticChanges.filter(
      (c) => c.action === 'WAR_REPARATIONS_PAYMENT' && c.actorId === b.id,
    );
    assert.equal(payments.length, i < 5 ? 1 : 0);
    if (payments[0])
      assert.equal(
        payments[0].amount,
        Math.round(report.economy.find((e) => e.playerId === b.id)!.grossIncome * 0.25 * 100) / 100,
      );
    assert.ok(Math.abs(b.gold - (before + forecast.net)) < 0.03);
  }
  assert.equal(g.reparations.length, 0);
});

test('v098: todas as 12 conquistas têm progresso funcional', () => {
  let profile = emptyProfile();
  for (const [i, nation] of (['aurelia', 'turan', 'veridia', 'vespera'] as const).entries()) {
    const g = scenario('CLASSIC');
    g.graceUntilTurn = 0;
    g.matchConfig.campaignId = `achievement-${i}`;
    const me = g.players[0];
    me.nationId = nation;
    g.phase = 'finished';
    g.winnerId = me.id;
    g.victoryRecord = { winnerId: me.id, objective: 'SECRET_OBJECTIVE', turn: 2 };
    me.wonBattles = 25;
    me.emergencyLevyTurn = 1;
    const report = emptyTurnReport(2, g.diet);
    const base = gold();
    const attacker = army(base.g, base.players[0].id, 'portugal', { infantry: 12 });
    army(base.g, base.players[1].id, 'castile', { infantry: 2 });
    declareWar(base.g, base.players[0].id, base.players[1].id, 'CONQUEST');
    const battleReport = emptyTurnReport(1, base.g.diet);
    resolveBattle(
      base.g,
      attacker,
      base.g.provinces.find((p) => p.id === 'castile')!,
      battleReport,
    );
    report.battles = Array.from({ length: 25 }, (_, j) => ({
      ...battleReport.battles[0],
      id: `battle-${j}`,
      winnerId: me.id,
      naval: false,
    }));
    report.sieges = Array.from({ length: 15 }, (_, j) => ({
      provinceId: `p${j}`,
      attackerOwnerId: me.id,
      progress: 2,
      required: 2,
      completed: true,
      assault: false,
    }));
    const eco = realmEconomy(g, me.id);
    report.economy = [
      { ...eco, playerId: me.id, turn: 2, gold: 100, warExhaustion: 0, grossIncome: 90 },
    ];
    g.history = [
      {
        ...report,
        nations: structuredClone(g.players),
        wars: [],
        control: [],
        analytics: [{ playerId: me.id, fortLevels: 0, tradeNodes: 3 }],
      },
    ];
    const w = declareWar({ ...g, phase: 'planning' }, g.players[1].id, me.id, 'CONQUEST');
    w.active = false;
    w.startedTurn = 1;
    w.endedTurn = 2;
    w.treatyWinnerId = me.id;
    w.treatyScore = 55;
    g.wars = [w];
    profile = updateProfile(profile, viewFor(g, me.id), me.id, 'now');
  }
  assert.equal(Object.keys(profile.unlocked).length, 12);
  assert.equal(profile.stats.games, 4);
});

test('v098: relatórios parciais geram cenário jogável sem inventar ordens ou objetivos privados', () => {
  const g = scenario('AGE_OF_SAIL'),
    view = viewFor(g, g.hostId);
  const { history, ...finalState } = view;
  const imported = importCampaign(
    { schemaVersion: 7, finalState, turnByTurnHistory: history },
    'REPORT',
  );
  assert.equal(validGame(imported.game), true);
  assert.deepEqual(imported.game.orders, Object.fromEntries(g.players.map((p) => [p.id, []])));
  assert.equal(imported.game.enableSecretObjectives, false);
  assert.ok(imported.game.players.every((p) => p.secretObjectives.length === 0));
  assert.equal(imported.game.matchConfig.sourceReport?.code, g.code);
});
