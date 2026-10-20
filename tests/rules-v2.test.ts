import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  addPlayer,
  answerAlliance,
  breakAlliance,
  canAttack,
  createGame,
  executeCommand,
  refreshScores,
  resolveTurn,
  startGame,
  submitOrder,
  viewFor,
} from '../server/game';
import { combatPowers, resolveMarch, retreatArmy } from '../server/combat';
import {
  effectiveTax,
  supplyLimit,
  armyUpkeep,
  attritionLoss,
  realmEconomy,
} from '../shared/rules';
import { emptyTurnReport } from '../shared/types';

function setup() {
  const g = createGame('RULES', 'campaign', true, 42);
  const players = ['A', 'B', 'C'].map((name) => addPlayer(g, name));
  startGame(g);
  g.victoryTargets = { conquest: 999, prosperity: 999, concord: 999, faith: 999 };
  return { g, players };
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.000001, `${a} deve ser ${b}`);

test('impostos usam pacificação, diferença religiosa e revolta exatamente', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[16];
  Object.assign(p, { baseTax: 6, pacification: 40, unrest: 30, religion: a.faith });
  close(effectiveTax(p, a.faith), 6 * 0.4 * 1.15 * 0.85);
  p.religion = 'Ortodoxia';
  close(effectiveTax(p, a.faith), 6 * 0.4 * 0.85 * 0.85);
  p.pacification = 0;
  assert.equal(effectiveTax(p, a.faith), 0);
});
test('guarnição parada pacifica +15 e reduz revolta em 10; PACIFY acumula +35/-25', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[16];
  p.pacification = 20;
  p.unrest = 70;
  resolveTurn(g);
  assert.equal(p.pacification, 35);
  assert.equal(p.unrest, 60);
  submitOrder(g, a.id, { type: 'PACIFY', provinceId: p.id });
  resolveTurn(g);
  assert.equal(p.pacification, 85);
  assert.equal(p.unrest, 25);
});
test('superextensão com uma tropa provoca +15 de revolta e rebelião a 100', () => {
  const { g } = setup(),
    p = g.provinces[16];
  p.troops = 1;
  p.pacification = 20;
  p.unrest = 85;
  const report = resolveTurn(g);
  assert.equal(p.ownerId, null);
  assert.equal(p.unrest, 40);
  assert.equal(report.rebellions[0].provinceId, p.id);
});
test('suprimento, atrito e custo progressivo seguem fórmulas e mercenários custam 2,2x', () => {
  const { g } = setup(),
    p = g.provinces[16];
  Object.assign(p, { baseSupplyLimit: 10, fortLevel: 2, pacification: 80 });
  assert.equal(supplyLimit(p), 18);
  assert.equal(attritionLoss(25, 18), 2);
  assert.equal(attritionLoss(19, 18), 1);
  assert.equal(attritionLoss(18, 18), 0);
  close(armyUpkeep(25, 0, 18, 0.35), 0.35 * (18 + Math.pow(7, 1.25)));
  close(armyUpkeep(25, 25, 18, 0.35), armyUpkeep(25, 0, 18, 0.35) * 2.2);
  close(armyUpkeep(25, 10, 18, 0.35), armyUpkeep(25, 0, 18, 0.35) * (1 + (1.2 * 10) / 25));
});
test('mercenários são instantâneos, não consomem reservas e começam com treinamento 1', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[16];
  const gold = a.gold,
    manpower = a.manpower;
  submitOrder(g, a.id, { type: 'RECRUIT', provinceId: p.id, amount: 3, isMercenary: true });
  assert.equal(p.troops, 9);
  assert.equal(p.mercenaries, 3);
  assert.equal(a.gold, gold - 18);
  assert.equal(a.manpower, manpower);
  assert.equal(g.orders[a.id].length, 0);
  close(p.training, (6 * 1.2 + 3) / 9);
  p.capital = false;
  p.pacification = 20;
  assert.throws(
    () => submitOrder(g, a.id, { type: 'RECRUIT', provinceId: p.id, amount: 1, isMercenary: true }),
    /capital/,
  );
});
test('poder de combate aplica treinamento, moral, terreno e forte sem sorte adicional', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    p = g.provinces[8];
  Object.assign(p, {
    ownerId: b.id,
    troops: 10,
    training: 1.3,
    morale: 60,
    fortLevel: 2,
    terrainDefenseBonus: 1.35,
  });
  const powers = combatPowers(
    g,
    { ownerId: a.id, troops: 12, mercenaries: 0, training: 1.2, morale: 80 },
    p,
  );
  close(powers.attackPower, 12 * 1.2 * 0.9);
  close(powers.defensePower, 10 * 1.3 * 1.35 * 1.3 * 0.8);
  close(powers.ratio, powers.attackPower / powers.defensePower);
});
test('recuo preserva o dono das tropas em um aliado e registra moral 15 e fração sobrevivente', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const battle = g.provinces[8],
    safe = g.provinces[9];
  safe.ownerId = b.id;
  const r = g.relations.find((r) => r.a === a.id && r.b === b.id)!;
  r.allied = true;
  const report = emptyTurnReport(1);
  retreatArmy(
    g,
    {
      id: 'retreat-test',
      ownerId: a.id,
      provinceId: battle.id,
      troops: 20,
      mercenaries: 0,
      morale: 10,
      training: 1.2,
      stranded: false,
    },
    1.2,
    report,
    new Set(),
  );
  const event = report.retreats[0];
  assert.ok(event.regrouped >= 11 && event.regrouped <= 14);
  assert.equal(event.morale, 15);
  assert.equal(report.stackwipes.length, 0);
  if (event.toProvinceId === safe.id) {
    const camp = g.stationedArmies.find((x) => x.provinceId === safe.id)!;
    assert.equal(camp.ownerId, a.id);
    assert.equal(safe.ownerId, b.id);
  }
});
test('stackwipe só ocorre por força 2,5x ou moral zero sem rota de fuga', () => {
  const {
      g,
      players: [a],
    } = setup(),
    p = g.provinces[8];
  for (const id of p.neighbors) g.provinces.find((q) => q.id === id)!.ownerId = null;
  const report = emptyTurnReport(1),
    army = {
      id: 'isolated',
      ownerId: a.id,
      provinceId: p.id,
      troops: 20,
      mercenaries: 0,
      morale: 30,
      training: 1.2,
      stranded: false,
    };
  retreatArmy(g, army, 2.49, report, new Set());
  assert.equal(report.stackwipes.length, 0);
  assert.equal(g.displacedArmies.length, 1);
  retreatArmy(g, { ...army, id: 'zero', morale: 0 }, 1.1, report, new Set());
  assert.equal(report.stackwipes[0].reason, 'zero_morale_no_escape');
  retreatArmy(g, { ...army, id: 'outnumbered' }, 2.5, report, new Set());
  assert.equal(report.stackwipes[1].reason, 'overwhelming_force');
});
test('batalha registra baixas, ocupação, modificadores e recuo; fortificação exige cerco', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const p = g.provinces[8],
    safe = g.provinces[9];
  Object.assign(p, {
    ownerId: b.id,
    troops: 8,
    morale: 80,
    training: 1.1,
    fortLevel: 0,
    terrainDefenseBonus: 1,
  });
  safe.ownerId = b.id;
  const report = emptyTurnReport(1);
  resolveMarch(
    g,
    {
      id: 'battle-test',
      ownerId: a.id,
      provinceId: p.id,
      fromProvinceId: 'p16',
      troops: 12,
      mercenaries: 0,
      training: 1.2,
      morale: 80,
      stranded: false,
    },
    report,
    new Set(),
    new Set(),
  );
  const battle = report.battles[0];
  assert.equal(battle.outcome, 'attacker_victory');
  assert.equal(p.ownerId, a.id);
  assert.equal(p.pacification, 20);
  assert.equal(p.unrest, 40);
  assert.ok(battle.attackerCasualties > 0 && battle.defenderCasualties > 0);
  assert.equal(report.retreats.length, 1);
  assert.equal(battle.stackwipe, false);
  p.ownerId = b.id;
  p.fortLevel = 3;
  assert.throws(
    () =>
      submitOrder(g, a.id, {
        type: 'MOVE_ATTACK',
        fromProvinceId: 'p16',
        toProvinceId: p.id,
        troops: 5,
      }),
    /9 tropas/,
  );
});
test('conquista de religião diferente zera pacificação', () => {
  const {
    g,
    players: [a],
  } = setup();
  const p = g.provinces[8];
  p.religion = 'Ortodoxia';
  p.troops = 2;
  const report = emptyTurnReport(1);
  resolveMarch(
    g,
    {
      id: 'religious-conquest',
      ownerId: a.id,
      provinceId: p.id,
      fromProvinceId: 'p16',
      troops: 12,
      mercenaries: 0,
      training: 1.5,
      morale: 100,
      stranded: false,
    },
    report,
    new Set(),
    new Set(),
  );
  assert.equal(p.ownerId, a.id);
  assert.equal(p.pacification, 0);
});
test('conversão transfronteiriça gera +20 de revolta e bônus religioso de 15%', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    p = g.provinces[8];
  Object.assign(p, {
    ownerId: b.id,
    religion: 'Ortodoxia',
    troops: 1,
    unrest: 10,
    pacification: 100,
  });
  for (let i = 0; i < 2; i++) {
    submitOrder(g, a.id, { type: 'CONVERT', targetProvinceId: p.id });
    resolveTurn(g);
  }
  assert.equal(p.religion, a.faith);
  assert.equal(p.unrest, 30);
  assert.equal(g.lastReport!.conversions[0].crossBorder, true);
  close(
    combatPowers(g, { ownerId: a.id, troops: 5, mercenaries: 0, training: 1, morale: 100 }, p)
      .holyWarBonus,
    1.15,
  );
  assert.throws(
    () => submitOrder(g, a.id, { type: 'CONVERT', targetProvinceId: 'p31' }),
    /adjacente/,
  );
});
test('embargo, rebeldes e subsídios usam tesouro livre e alteram relações/renda', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  g.provinces[16].resource = 'trade';
  const beforeA = realmEconomy(g, a.id),
    beforeB = realmEconomy(g, b.id);
  submitOrder(g, a.id, { type: 'DIPLOMACY', action: 'EMBARGO', targetRealmId: b.id });
  close(realmEconomy(g, b.id).trade, beforeB.trade * 0.85);
  close(realmEconomy(g, a.id).trade, beforeA.trade * 0.95);
  assert.equal(g.relations[0].trust, -15);
  const old = b.gold;
  submitOrder(g, a.id, {
    type: 'DIPLOMACY',
    action: 'SEND_SUBSIDY',
    targetRealmId: b.id,
    amount: 5,
  });
  assert.equal(b.gold, old + 5);
  const unrest = g.provinces[17].unrest;
  submitOrder(g, a.id, {
    type: 'DIPLOMACY',
    action: 'FUND_REBELS',
    targetRealmId: b.id,
    targetProvinceId: 'p17',
    amount: 12,
  });
  assert.equal(g.provinces[17].unrest, unrest + 30);
  submitOrder(g, a.id, { type: 'DEVELOP', provinceId: 'p16' });
  assert.throws(
    () =>
      submitOrder(g, a.id, {
        type: 'DIPLOMACY',
        action: 'SEND_SUBSIDY',
        targetRealmId: b.id,
        amount: a.gold,
      }),
    /Ouro livre/,
  );
});
test('acesso militar exige aceitação, mantém propriedade e tributo transfere por rodada', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  submitOrder(g, a.id, { type: 'DIPLOMACY', action: 'MILITARY_ACCESS', targetRealmId: b.id });
  answerAlliance(g, b.id, g.offers[0].id, true);
  submitOrder(g, a.id, {
    type: 'MOVE_ATTACK',
    fromProvinceId: 'p16',
    toProvinceId: 'p17',
    troops: 3,
  });
  resolveTurn(g);
  assert.equal(g.provinces[17].ownerId, b.id);
  assert.equal(g.stationedArmies.find((x) => x.ownerId === a.id)?.troops, 3);
  assert.equal(g.lastReport!.battles.length, 0);
  submitOrder(g, a.id, {
    type: 'DIPLOMACY',
    action: 'DEMAND_TRIBUTE',
    targetRealmId: b.id,
    amount: 2,
  });
  answerAlliance(g, b.id, g.offers[0].id, true);
  resolveTurn(g);
  assert.equal(
    g.lastReport!.diplomaticChanges.find((x) => x.action === 'TRIBUTE_PAYMENT')!.amount,
    2,
  );
});
test('hegemonia detecta qualquer objetivo a 75%, concede 10% e permite romper sem trégua', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  g.victoryTargets.prosperity = 10;
  a.gold = 225;
  refreshScores(g);
  resolveTurn(g);
  assert.equal(g.hegemonyLeaderId, a.id);
  assert.ok(g.lastReport!.hegemonyAlerts.length > 0);
  submitOrder(g, b.id, { type: 'DIPLOMACY', action: 'PROPOSE_ALLIANCE', targetRealmId: a.id });
  answerAlliance(g, a.id, g.offers[0].id, true);
  const influence = b.influence,
    morale = g.provinces[17].morale;
  breakAlliance(g, b.id, a.id);
  assert.equal(b.influence, influence);
  assert.equal(g.provinces[17].morale, morale);
  assert.equal(canAttack(g, b.id, a.id), true);
  close(
    combatPowers(
      g,
      { ownerId: b.id, troops: 5, mercenaries: 0, morale: 100, training: 1 },
      g.provinces[16],
    ).coalitionAttackBonus,
    1.1,
  );
});
test('máquina de comandos é determinística e não muda a entrada, inclusive ao rejeitar ação', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    original = structuredClone(g),
    command = {
      type: 'SUBMIT_ORDER' as const,
      order: { type: 'TRAIN' as const, provinceId: 'p16' },
    };
  const first = executeCommand(g, a.id, command, 123),
    second = executeCommand(g, a.id, command, 123);
  assert.deepEqual(first, second);
  assert.deepEqual(g, original);
  assert.throws(() => executeCommand(g, b.id, command, 123));
  assert.deepEqual(g, original);
  assert.equal(viewFor(first, b.id).plannedOrders.length, 0);
});
test('shared e servidor não dependem do cliente, React ou DOM; motor não usa relógio nem RNG global', () => {
  for (const directory of ['shared', 'server'])
    for (const file of readdirSync(directory).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(`${directory}/${file}`, 'utf8');
      assert.doesNotMatch(source, /from\s+['"][^'"]*(?:src\/|react)/);
      assert.doesNotMatch(source, /\b(?:window|document)\s*[.(]/);
    }
  for (const file of ['game', 'state', 'combat', 'diplomacy'])
    assert.doesNotMatch(
      readFileSync(`server/${file}.ts`, 'utf8'),
      /Date\.now|Math\.random|from ['"]node:/,
    );
});
test('dividir um doomstack entre aliados não reduz o custo progressivo local', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    p = g.provinces[16];
  for (const q of g.provinces) q.troops = 0;
  p.troops = 20;
  p.baseSupplyLimit = 8;
  p.fortLevel = 0;
  p.pacification = 100;
  g.stationedArmies.push({
    id: 'allied-stack',
    ownerId: b.id,
    provinceId: p.id,
    troops: 20,
    mercenaries: 0,
    morale: 70,
    training: 1.2,
    stranded: false,
  });
  const combined = realmEconomy(g, a.id).upkeep + realmEconomy(g, b.id).upkeep;
  assert.ok(Math.abs(combined - armyUpkeep(40, 0, 10, g.baseUpkeep)) < 0.02);
});
test('identificadores públicos de ofertas e batalhas não expõem a semente privada', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  g.seed = 987654321;
  submitOrder(g, a.id, { type: 'DIPLOMACY', action: 'PROPOSE_ALLIANCE', targetRealmId: b.id });
  submitOrder(g, a.id, {
    type: 'MOVE_ATTACK',
    fromProvinceId: 'p16',
    toProvinceId: 'p8',
    troops: 5,
  });
  resolveTurn(g);
  const publicView = viewFor(g, b.id);
  assert.equal(JSON.stringify(publicView).includes(String(g.seed)), false);
  assert.ok(publicView.lastReport!.battles.length > 0);
});
test('exército estrangeiro é repatriado quando perde o acesso, preservando sua propriedade', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  submitOrder(g, a.id, { type: 'DIPLOMACY', action: 'PROPOSE_ALLIANCE', targetRealmId: b.id });
  answerAlliance(g, b.id, g.offers[0].id, true);
  submitOrder(g, a.id, { type: 'DIPLOMACY', action: 'MILITARY_ACCESS', targetRealmId: b.id });
  answerAlliance(g, b.id, g.offers[0].id, true);
  submitOrder(g, a.id, {
    type: 'MOVE_ATTACK',
    fromProvinceId: 'p16',
    toProvinceId: 'p17',
    troops: 3,
  });
  resolveTurn(g);
  assert.equal(g.stationedArmies.length, 1);
  const bTroops = g.provinces[17].troops;
  const nativeTroops = g.provinces
    .filter((p) => p.ownerId === a.id)
    .reduce((n, p) => n + p.troops, 0);
  breakAlliance(g, a.id, b.id);
  const report = resolveTurn(g);
  assert.equal(g.stationedArmies.filter((x) => x.ownerId === a.id).length, 0);
  assert.equal(
    g.provinces.filter((p) => p.ownerId === a.id).reduce((n, p) => n + p.troops, 0),
    nativeTroops + 3,
  );
  assert.equal(g.provinces[17].troops, bTroops);
  assert.equal(report.retreats[0].reason, 'repatriation');
  assert.equal(report.retreats[0].regrouped, 3);
  assert.equal(g.provinces.find((p) => p.id === report.retreats[0].toProvinceId)!.ownerId, a.id);
});
test('aliado de ambos os lados não causa fogo amigo ao apoiar uma guarnição', () => {
  const {
      g,
      players: [a, b, c],
    } = setup(),
    p = g.provinces[8];
  for (const r of g.relations) if (r.a === c.id || r.b === c.id) r.allied = true;
  Object.assign(p, { ownerId: b.id, troops: 2, morale: 70, training: 1 });
  g.stationedArmies.push({
    id: 'mutual-ally',
    ownerId: c.id,
    provinceId: p.id,
    troops: 4,
    mercenaries: 0,
    morale: 70,
    training: 1.2,
    stranded: false,
  });
  const report = emptyTurnReport(1);
  resolveMarch(
    g,
    {
      id: 'friendly-fire-test',
      ownerId: a.id,
      provinceId: p.id,
      fromProvinceId: 'p16',
      troops: 8,
      mercenaries: 0,
      training: 1.5,
      morale: 100,
      stranded: false,
    },
    report,
    new Set(),
    new Set(),
  );
  assert.equal(report.battles[0].defenderTroops, 2);
  assert.equal(g.stationedArmies.find((x) => x.ownerId === c.id)!.troops, 4);
});
test('destacamento pode sair por inteiro de território estrangeiro', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  submitOrder(g, a.id, { type: 'DIPLOMACY', action: 'MILITARY_ACCESS', targetRealmId: b.id });
  answerAlliance(g, b.id, g.offers[0].id, true);
  submitOrder(g, a.id, {
    type: 'MOVE_ATTACK',
    fromProvinceId: 'p16',
    toProvinceId: 'p17',
    troops: 3,
  });
  resolveTurn(g);
  submitOrder(g, a.id, {
    type: 'MOVE_ATTACK',
    fromProvinceId: 'p17',
    toProvinceId: 'p16',
    troops: 3,
  });
  resolveTurn(g);
  assert.equal(g.stationedArmies.filter((a) => a.ownerId === g.players[0].id).length, 0);
  assert.equal(g.provinces[16].troops, 6);
});
