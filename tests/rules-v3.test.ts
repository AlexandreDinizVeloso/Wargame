import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { combatPowers, compositionPower, resolveBattle, retreatArmy } from '../server/combat';
import {
  answerOffer,
  applyPeace,
  declareWar,
  diplomacy,
  offerPeace,
  updateWarScores,
} from '../server/diplomacy';
import { resolveTurn, submitOrder, viewFor } from '../server/game';
import { createBattalion, removeUnits } from '../server/state';
import {
  armyUpkeep,
  atWar,
  attritionLoss,
  chronicle,
  compositionOf,
  effectiveTax,
  holyCityId,
  isBlockaded,
  realmEconomy,
  supplyLimit,
  telemetry,
  unitCount,
  victoryStatus,
} from '../shared/rules';
import { emptyTurnReport } from '../shared/types';
import { setup, army } from './fixtures';
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);

test('imposto mantém pacificação/revolta e aplica tolerância e bloqueio', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0];
  Object.assign(p, { baseTax: 6, pacification: 40, unrest: 30, marketLevel: 2, religion: 'SOLAR' });
  close(
    effectiveTax(p, a.faith, true, 'TOLERANCE'),
    0.65 * 0.55 * 6 * 0.4 * 0.85 * 0.85 * 0.5 * 0.9,
  );
  p.pacification = 0;
  assert.equal(effectiveTax(p, a.faith), 0);
});
test('guarnição parada e PACIFY acumulam +15/+35 e −10/−25', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0];
  p.pacification = 20;
  p.unrest = 70;
  army(g, a.id, p.id);
  submitOrder(g, a.id, { type: 'PACIFY', provinceId: p.id });
  resolveTurn(g);
  close(p.pacification, 70);
  close(p.unrest, 35);
});
test('religião ancestral acelera pacificação e tolerância não cria revolta religiosa', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0];
  a.faith = 'ANCESTRAL';
  p.pacification = 20;
  p.unrest = 20;
  army(g, a.id, p.id);
  resolveTurn(g);
  close(p.pacification, 37.25);
  close(p.unrest, 10);
});
test('província sem guarnição e mal pacificada se rebela e registra evento', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0];
  p.pacification = 20;
  p.unrest = 90;
  const r = resolveTurn(g);
  assert.equal(p.ownerId, null);
  assert.equal(p.unrest, 40);
  assert.equal(r.rebellions[0].previousOwnerId, a.id);
  assert.ok(g.battalions.some((a) => a.ownerId === 'NEUTRAL' && a.provinceId === p.id));
});
test('limite, atrito, custo progressivo e manutenção mercenária seguem as fórmulas', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0];
  Object.assign(p, { baseSupplyLimit: 10, fortLevel: 2, pacification: 80, portLevel: 0 });
  assert.equal(supplyLimit(p), 18);
  assert.equal(attritionLoss(31, 18), 4);
  close(armyUpkeep(31, 0, 18), 0.75 * (18 + 13 * 3));
  close(armyUpkeep(31, 31, 18), armyUpkeep(31, 0, 18) * 2.2);
  army(g, a.id, p.id, { infantry: 31 });
  const r = resolveTurn(g);
  assert.ok(r.attritionLosses.some((e) => e.losses === 4));
});
test('separar formações não cria suprimento nem reduz manutenção progressiva', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0];
  p.baseSupplyLimit = 8;
  p.portLevel = 0;
  army(g, a.id, p.id, { infantry: 20 });
  army(g, a.id, p.id, { infantry: 20 });
  close(realmEconomy(g, a.id).upkeep, 0.5 * 0.75 * (13 + (40 - 13) * 3));
});
test('infantaria tem ataque 1 e defesa 1,2; moral e treinamento entram no poder', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0],
    unit = army(g, a.id, p.id, { infantry: 10 });
  a.faith = 'MERCHANT';
  unit.training = 1.3;
  unit.morale = 60;
  p.terrain = 'plains';
  p.terrainDefenseBonus = 1;
  close(compositionPower(g, unit, p), 10 * 1.3 * 0.8);
  close(compositionPower(g, unit, p, true), 10 * 1.2 * 1.3 * 0.8);
  unit.entrenched = true;
  close(compositionPower(g, unit, p, true), 10 * 1.2 * 1.3 * 0.8 * 1.15);
});
test('cavalaria ganha choque em planícies/litoral e penalidade em floresta/montanhas', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[0],
    unit = army(g, a.id, p.id, { cavalry: 10 });
  unit.morale = 100;
  unit.training = 1;
  p.terrain = 'plains';
  close(compositionPower(g, unit, p), 14);
  p.terrain = 'forest';
  close(compositionPower(g, unit, p), 8);
});
test('artilharia neutraliza fortes e doutrina reformada aumenta fogo em 20%', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    p = g.provinces.find((p) => p.id === 'france')!,
    unit = army(g, a.id, p.id, { infantry: 5, artillery: 2 }),
    defender = army(g, b.id, p.id, { infantry: 4 });
  a.faith = 'REFORMED';
  p.fortLevel = 3;
  const powers = combatPowers(g, [unit], [defender], p);
  assert.equal(powers.neutralizedFortLevels, 2);
  close(powers.defensePower, compositionPower(g, defender, p, true) * p.terrainDefenseBonus * 1.15);
});
test('artilharia exposta sofre 75% de baixas adicionais', () => {
  const {
      g,
      players: [a],
    } = setup(),
    exposed = army(g, a.id, 'castile', { infantry: 1, artillery: 8 }),
    protectedArmy = army(g, a.id, 'castile', { infantry: 8, artillery: 8 });
  const exposedLoss = removeUnits(exposed, 4, true);
  assert.ok(exposedLoss.artillery >= 6);
  const protectedLoss = removeUnits(protectedArmy, 4, true);
  assert.equal(protectedLoss.artillery, 2);
});
test('cavalaria vencedora aumenta perdas na retirada sem trocar propriedade', () => {
  const first = setup(12),
    second = setup(12);
  const p1 = first.players[0],
    p2 = second.players[0];
  first.g.provinces.find((p) => p.id === 'germany')!.ownerId = p1.id;
  second.g.provinces.find((p) => p.id === 'germany')!.ownerId = p2.id;
  const a = army(first.g, p1.id, 'france', { infantry: 20 }),
    b = army(second.g, p2.id, 'france', { infantry: 20 });
  a.id = b.id = 'same';
  a.morale = b.morale = 20;
  const r1 = emptyTurnReport(1, first.g.diet),
    r2 = emptyTurnReport(1, second.g.diet);
  retreatArmy(first.g, a, 1.1, r1, false);
  retreatArmy(second.g, b, 1.1, r2, true);
  assert.ok(unitCount(b) < unitCount(a));
  assert.equal(b.ownerId, p2.id);
  assert.equal(b.morale, 15);
});
test('aniquilação só ocorre por 2,5x ou moral zero sem rota segura', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'france', { infantry: 10 });
  unit.morale = 30;
  const report = emptyTurnReport(1, g.diet);
  assert.equal(retreatArmy(g, unit, 2, report).wiped, false);
  const doomed = army(g, a.id, 'japan', { infantry: 8 });
  doomed.morale = 0;
  assert.equal(retreatArmy(g, doomed, 1, report).wiped, true);
  const overwhelming = army(g, a.id, 'france');
  assert.equal(retreatArmy(g, overwhelming, 2.5, report).wiped, true);
});
test('invasão precisa de guerra formal e ocupa sem transferir propriedade definitiva', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    unit = army(g, a.id, 'castile', { infantry: 10 });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'MOVE_BATTALION',
      battalionId: unit.id,
      targetProvinceId: 'france',
    }),
  );
  declareWar(g, a.id, b.id, 'CONQUEST');
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: unit.id,
    targetProvinceId: 'france',
  });
  resolveTurn(g);
  const p = g.provinces.find((p) => p.id === 'france')!;
  assert.equal(p.ownerId, b.id);
  assert.equal(p.occupierId, null);
  assert.equal(p.siege?.progress, 1);
  resolveTurn(g);
  assert.equal(p.occupierId, a.id);
  assert.equal(p.pacification, 0);
});
test('recusar chamado defensivo rompe aliança e reduz prestígio e autoridade', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  g.relations.find((r) => r.a === b.id && r.b === c.id)!.allied = true;
  const war = declareWar(g, a.id, b.id, 'CONQUEST');
  assert.ok(war.defenderIds.includes(c.id));
  const offer = g.offers.find((o) => o.to === c.id && o.kind === 'call_to_arms')!;
  const prestige = c.prestige;
  answerOffer(g, c.id, offer.id, false);
  assert.equal(c.prestige, prestige - 15);
  assert.equal(atWar(g, a.id, c.id), false);
  assert.equal(g.relations.find((r) => r.a === b.id && r.b === c.id)!.allied, false);
});
test('aliado ofensivo entra somente após consentimento e declaração exige casus belli válido', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  g.relations.find((r) => r.a === a.id && r.b === c.id)!.allied = true;
  const war = declareWar(g, a.id, b.id, 'CONQUEST', [c.id]);
  assert.equal(war.attackerIds.includes(c.id), false);
  answerOffer(g, c.id, g.offers.find((o) => o.to === c.id)!.id, true);
  assert.equal(war.attackerIds.includes(c.id), true);
  assert.throws(() => declareWar(g, b.id, c.id, 'IMPERIAL_BAN'));
});
test('guerra santa solar não cobra estabilidade e exige outra fé', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.faith = 'SOLAR';
  b.faith = 'REFORMED';
  const before = a.stability;
  declareWar(g, a.id, b.id, 'HOLY_WAR');
  assert.equal(a.stability, before);
});
test('desgaste cresce 4 em guerra, penaliza renda e revolta; paz recupera 12', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    p = g.provinces[0];
  declareWar(g, a.id, b.id, 'CONQUEST');
  resolveTurn(g);
  close(a.warExhaustion, 4);
  close(p.unrest, 6);
  const eco = realmEconomy(g, a.id);
  close(eco.income, Math.round(eco.grossIncome * (1 - 0.016) * 100) / 100);
  g.wars[0].active = false;
  a.warExhaustion = 30;
  resolveTurn(g);
  close(a.warExhaustion, 18);
});
test('mercado e porto exigem terra/costa; frotas exigem porto e composição naval', () => {
  const {
    g,
    players: [a],
  } = setup();
  submitOrder(g, a.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: 'castile',
    isFleet: true,
    warships: 1,
    transports: 1,
  });
  resolveTurn(g);
  assert.ok(g.battalions.some((a) => a.isFleet));
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'RECRUIT_BATTALION',
      provinceId: 'castile',
      isFleet: true,
      infantry: 1,
      warships: 1,
    }),
  );
  const p = g.provinces.find((p) => p.id === 'central-asia')!;
  p.ownerId = a.id;
  assert.throws(() => submitOrder(g, a.id, { type: 'BUILD_PORT', provinceId: p.id }));
});
test('embarque respeita capacidade, frota transporta e desembarque preserva tropas', () => {
  const {
      g,
      players: [a],
    } = setup(),
    unit = army(g, a.id, 'castile', { infantry: 6 }),
    fleet = createBattalion(g, a.id, 'castile', compositionOf({ warships: 1, transports: 2 }), {
      isFleet: true,
    });
  submitOrder(g, a.id, { type: 'EMBARK_BATTALION', battalionId: unit.id, fleetId: fleet.id });
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: fleet.id,
    targetProvinceId: 'north-atlantic',
  });
  resolveTurn(g);
  assert.equal(unit.embarkedOnId, fleet.id);
  assert.equal(unit.provinceId, 'north-atlantic');
  assert.equal(fleet.embarkedArmyId, unit.id);
  const coast = g.provinces.find((p) => p.id === 'usa-east')!;
  submitOrder(g, a.id, {
    type: 'EMBARK_BATTALION',
    battalionId: unit.id,
    disembarkProvinceId: coast.id,
  });
  resolveTurn(g);
  assert.equal(unit.embarkedOnId, undefined);
  assert.equal(coast.ownerId, null);
  assert.equal(coast.siege?.progress, 1);
  resolveTurn(g);
  assert.equal(coast.ownerId, a.id);
  assert.equal(unitCount(unit), 6);
});
test('bloqueio reduz imposto pela metade e defesa de cerco em 20%', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    p = g.provinces[0];
  declareWar(g, b.id, a.id, 'CONQUEST');
  createBattalion(g, b.id, 'north-atlantic', compositionOf({ warships: 2 }), { isFleet: true });
  assert.equal(isBlockaded(g, p), true);
  close(effectiveTax(p, a.faith, true), effectiveTax(p, a.faith, false) * 0.5);
  const invader = army(g, b.id, p.id),
    guard = army(g, a.id, p.id);
  close(combatPowers(g, [invader], [guard], p).blockadeModifier, 0.8);
});
test('tratado cede apenas terras ocupadas e restitui as demais ocupações', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  w.battleScore = 100;
  const p = g.provinces.find((p) => p.id === 'france')!;
  assert.throws(() => applyPeace(g, w, a.id, [{ type: 'CEDE_PROVINCES', provinceIds: [p.id] }]));
  p.occupierId = a.id;
  updateWarScores(g);
  applyPeace(g, w, a.id, [{ type: 'CEDE_PROVINCES', provinceIds: [p.id] }]);
  assert.equal(p.ownerId, a.id);
  assert.equal(p.occupierId, null);
  assert.equal(w.active, false);
  assert.equal(atWar(g, a.id, b.id), false);
  assert.throws(() => declareWar(g, a.id, b.id, 'CONQUEST'));
});
test('reparações, humilhação, religião forçada e submissão têm efeitos reais', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  w.battleScore = 100;
  updateWarScores(g);
  const gold = a.gold;
  applyPeace(g, w, a.id, [
    { type: 'WAR_REPARATIONS', immediateTribute: 10 },
    { type: 'HUMILIATE_DISARM' },
    { type: 'FORCE_EMPIRE_OR_RELIGION', choice: 'RELIGION' },
  ]);
  assert.equal(a.gold, gold + 10);
  assert.equal(b.faith, a.faith);
  assert.equal(b.armyCap, 13);
  assert.equal(b.disarmUntil, g.turn + 3);
  assert.equal(a.moraleBonusUntil, g.turn + 3);
  assert.equal(g.reparations[0].rate, 0.25);
  const second = setup(),
    war = declareWar(second.g, second.players[0].id, second.players[1].id, 'CONQUEST');
  war.battleScore = 100;
  updateWarScores(second.g);
  applyPeace(second.g, war, second.players[0].id, [{ type: 'SUBJUGATE' }]);
  assert.equal(second.players[1].subjectOfId, second.players[0].id);
});
test('doutrinas, cidades sagradas e inquisição alteram a economia e conversão', () => {
  const {
    g,
    players: [a],
  } = setup();
  const city = g.provinces.find((p) => p.id === holyCityId('SOLAR', g.provinces))!;
  city.ownerId = a.id;
  a.faith = 'SOLAR';
  for (const p of g.provinces.filter((p) => p.kind === 'LAND')) p.religion = 'SOLAR';
  close(realmEconomy(g, a.id).tithes, 0.75);
  const p = g.provinces[0];
  a.faith = 'MERCHANT';
  a.religiousPolicy = 'INQUISITION';
  submitOrder(g, a.id, { type: 'CONVERT', targetProvinceId: p.id });
  const r = resolveTurn(g);
  assert.equal(p.religion, 'MERCHANT');
  assert.equal(r.conversions.length, 1);
});
test('embargo, rebeldes, subsídio e autoria encoberta continuam funcionais', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const before = b.gold;
  diplomacy(g, a.id, { type: 'DIPLOMACY', action: 'SEND_SUBSIDY', targetRealmId: b.id, amount: 5 });
  assert.equal(b.gold, before + 5);
  diplomacy(g, a.id, { type: 'DIPLOMACY', action: 'EMBARGO', targetRealmId: b.id });
  diplomacy(g, a.id, {
    type: 'DIPLOMACY',
    action: 'FUND_REBELS',
    targetRealmId: b.id,
    amount: 12,
    targetProvinceId: 'france',
  });
  const r = resolveTurn(g);
  assert.ok(r.diplomaticChanges.some((c) => c.covert && c.actorId === a.id));
  assert.equal(viewFor(g, b.id).lastReport!.diplomaticChanges.find((c) => c.covert)!.actorId, null);
});
test('telemetria JSON e crônica contêm todas as rodadas, guerras, batalhas, Dieta e economia', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  army(g, a.id, 'castile', { infantry: 8 });
  resolveTurn(g);
  resolveTurn(g);
  const view = viewFor(g, a.id),
    data = telemetry(view),
    txt = chronicle(view);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  for (const key of [
    'matchConfig',
    'nations',
    'turnByTurnHistory',
    'wars',
    'battles',
    'dietHistory',
    'economyMetrics',
    'finalState',
  ])
    assert.ok(key in data);
  assert.equal(data.turnByTurnHistory.length, 2);
  assert.equal(data.economyMetrics.length, 6);
  assert.equal('seed' in data.finalState, false);
  assert.ok(
    txt.includes('RODADA 1') && txt.includes('RODADA 2') && txt.includes('ESTATÍSTICAS FINAIS'),
  );
});
test('shared/server não importam cliente, React ou DOM e motor não usa relógio/RNG global', () => {
  for (const directory of ['shared', 'server'])
    for (const file of readdirSync(directory).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(`${directory}/${file}`, 'utf8');
      assert.doesNotMatch(text, /from\s+['"](?:[^'"]*src\/|react)/);
      assert.doesNotMatch(text, /\b(?:window|document)\s*\./);
      if (['game.ts', 'combat.ts', 'diplomacy.ts', 'state.ts', 'commands.ts'].includes(file))
        assert.doesNotMatch(text, /Math\.random|Date\.now|new Date\(/);
    }
});

test('forte vazio ainda exige tropas de cerco e frotas não ocupam cidades', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = g.provinces.find((p) => p.id === 'france')!;
  p.fortLevel = 3;
  const small = army(g, a.id, p.id, { infantry: 2 });
  const report = emptyTurnReport(1, g.diet);
  resolveBattle(g, small, p, report);
  assert.equal(report.battles.length, 0);
  assert.equal(p.siege?.progress, 1);
  assert.equal(p.siege?.required, 8);
  assert.equal(p.occupierId, null);
  const fleet = createBattalion(g, a.id, p.id, compositionOf({ warships: 10 }), { isFleet: true });
  resolveBattle(g, fleet, p, report);
  assert.equal(p.occupierId, null);
});
test('perdas dos aliados defensores são atribuídas ao reino correto', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  g.relations.find((r) => r.a === b.id && r.b === c.id)!.allied = true;
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = g.provinces.find((p) => p.id === 'france')!;
  const invader = army(g, a.id, p.id, { infantry: 12 });
  army(g, b.id, p.id, { infantry: 2 });
  army(g, c.id, p.id, { infantry: 2 });
  const report = emptyTurnReport(1, g.diet);
  resolveBattle(g, invader, p, report);
  assert.ok(report.battles[0].casualtiesByRealm[b.id] > 0);
  assert.ok(report.battles[0].casualtiesByRealm[c.id] > 0);
});

test('dissolução encerra guerras sem lado vivo e permite a paz mundial', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  const p = g.provinces.find((p) => p.id === 'france')!;
  p.pacification = 0;
  p.unrest = 100;
  army(g, b.id, p.id, { infantry: 1 });
  resolveTurn(g);
  assert.equal(w.active, false);
  assert.equal(
    g.battalions.some((a) => a.ownerId === b.id),
    false,
  );
  assert.equal(g.season, 'SPRING');
});
test('ocupação completa do líder causa capitulação real e permite impor submissão', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  g.provinces.find((p) => p.id === 'france')!.occupierId = a.id;
  updateWarScores(g);
  assert.equal(w.warScore, 100);
  offerPeace(g, a.id, w.id, [{ type: 'SUBJUGATE' }]);
  assert.equal(w.active, false);
  assert.equal(b.subjectOfId, a.id);
});
test('dominação atinge exatamente 75% sem restrição sobre tamanho rival', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  const land = g.provinces.filter((p) => p.kind === 'LAND');
  land.forEach(
    (p, i) =>
      (p.ownerId =
        i < Math.ceil(land.length * 0.75) - 1 ? a.id : i < land.length - 1 ? b.id : c.id),
  );
  assert.equal(victoryStatus(g), null);
  land[Math.ceil(land.length * 0.75) - 1].ownerId = a.id;
  assert.equal(victoryStatus(g)?.objective, 'DOMINATION');
});
test('subjugar todos os demais não basta abaixo de 75% ponderados', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  b.subjectOfId = a.id;
  c.subjectOfId = a.id;
  assert.equal(victoryStatus(g), null);
});

test('submissão incorpora os súditos anteriores e concede acesso militar recíproco', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  c.subjectOfId = b.id;
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  g.provinces.find((p) => p.id === 'france')!.occupierId = a.id;
  updateWarScores(g);
  applyPeace(g, w, a.id, [{ type: 'SUBJUGATE' }]);
  assert.equal(b.subjectOfId, a.id);
  assert.equal(c.subjectOfId, a.id);
  assert.equal(victoryStatus(g), null);
  const r = g.relations.find((r) => r.a === a.id && r.b === b.id)!;
  assert.ok(r.militaryAccess.includes(a.id) && r.militaryAccess.includes(b.id));
});
test('atingir 75% encerra a rodada com vitória de dominação em estado exportável', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  const land = g.provinces.filter((p) => p.kind === 'LAND');
  land.forEach((p, i) => {
    p.ownerId = i < Math.ceil(land.length * 0.75) ? a.id : i < land.length - 1 ? b.id : c.id;
    p.occupierId = null;
    p.pacification = 100;
    p.unrest = 0;
  });
  resolveTurn(g);
  assert.equal(g.phase, 'finished');
  assert.equal(g.winnerId, a.id);
  assert.equal(telemetry(viewFor(g, a.id)).finalState.winnerObjective, 'DOMINATION');
});

test('desarmamento remove formações vazias e deixa o snapshot pronto para persistir', async () => {
  const { validGame } = await import('../server/storage');
  const {
    g,
    players: [a, b],
  } = setup();
  army(g, b.id, 'france', { infantry: 10 });
  army(g, b.id, 'france', { infantry: 10 });
  army(g, b.id, 'france', { infantry: 10 });
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  g.provinces.find((p) => p.id === 'france')!.occupierId = a.id;
  updateWarScores(g);
  applyPeace(g, w, a.id, [{ type: 'HUMILIATE_DISARM' }]);
  assert.equal(
    g.battalions.filter((a) => a.ownerId === b.id).reduce((n, a) => n + unitCount(a), 0),
    8,
  );
  assert.equal(
    g.battalions.some((a) => unitCount(a) === 0),
    false,
  );
  assert.equal(validGame(g), true);
});
test('frotas inimigas já estacionadas no mesmo mar combatem sem exigir sair e voltar', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 5 }), { isFleet: true });
  createBattalion(g, b.id, 'north-atlantic', compositionOf({ warships: 2 }), { isFleet: true });
  const r = resolveTurn(g);
  assert.ok(r.battles.some((b) => b.naval));
});
test('tropa com acesso estacionada em cidade estrangeira precisa lutar após declaração', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  g.relations.find((r) => r.a === a.id && r.b === b.id)!.militaryAccess.push(a.id);
  army(g, a.id, 'france', { infantry: 10 });
  army(g, b.id, 'france', { infantry: 2 });
  declareWar(g, a.id, b.id, 'CONQUEST');
  const r = resolveTurn(g);
  assert.ok(r.battles.some((b) => b.provinceId === 'france'));
  assert.equal(g.provinces.find((p) => p.id === 'france')!.occupierId, null);
  assert.equal(g.provinces.find((p) => p.id === 'france')!.siege?.progress, 1);
  resolveTurn(g);
  assert.equal(g.provinces.find((p) => p.id === 'france')!.occupierId, a.id);
});
test('formação que recuou na rodada não recebe recuperação de moral nem pacificação estacionária', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const p = g.provinces.find((p) => p.id === 'france')!;
  const attacker = army(g, a.id, 'castile', { infantry: 7 });
  attacker.morale = 85;
  army(g, b.id, p.id, { infantry: 7 });
  submitOrder(g, a.id, {
    type: 'MOVE_BATTALION',
    battalionId: attacker.id,
    targetProvinceId: p.id,
  });
  const r = resolveTurn(g);
  const retreat = r.retreats.find((r) => r.armyId === attacker.id);
  assert.ok(retreat);
  const survivor = g.battalions.find((a) => a.id === attacker.id)!;
  assert.equal(survivor.morale, 15);
});

test('recuo para aliado neutro preserva a formação sem doar tropas ou exigir acesso prévio', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  declareWar(g, c.id, b.id, 'CONQUEST');
  g.relations.find((r) => r.a === a.id && r.b === b.id)!.allied = true;
  const defender = army(g, b.id, 'france', { infantry: 7 });
  const invader = army(g, c.id, 'italy', { infantry: 6, artillery: 3 });
  submitOrder(g, c.id, {
    type: 'MOVE_BATTALION',
    battalionId: invader.id,
    targetProvinceId: 'france',
  });
  const report = resolveTurn(g);
  assert.ok(report.retreats.some((r) => r.armyId === defender.id && r.toProvinceId === 'castile'));
  assert.equal(defender.provinceId, 'castile');
  assert.equal(defender.ownerId, b.id);
  assert.equal(defender.morale, 15);
  assert.equal(g.provinces[0].ownerId, a.id);
});

test('reagrupamento de frota isolada também move seu batalhão embarcado', () => {
  const {
    g,
    players: [a],
  } = setup();
  g.provinces.find((p) => p.id === 'italy')!.portLevel = 1;
  const fleet = createBattalion(g, a.id, 'italy', compositionOf({ warships: 2, transports: 2 }), {
      isFleet: true,
    }),
    cargo = army(g, a.id, 'italy', { infantry: 3 });
  fleet.embarkedArmyId = cargo.id;
  cargo.embarkedOnId = fleet.id;
  fleet.stranded = true;
  fleet.morale = 0;
  const r = resolveTurn(g);
  assert.ok(r.retreats.some((r) => r.armyId === fleet.id && r.reason === 'regrouping'));
  assert.equal(fleet.stranded, false);
  assert.equal(cargo.provinceId, fleet.provinceId);
  assert.equal(cargo.embarkedOnId, fleet.id);
});
