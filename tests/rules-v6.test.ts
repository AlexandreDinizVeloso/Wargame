import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, army } from './fixtures';
import {
  createGame,
  addPlayer,
  startGame,
  resolveTurn,
  submitOrder,
  executeCommand,
  viewFor,
  cancelOrder,
} from '../server/game';
import { createBattalion } from '../server/state';
import { declareWar, offerPeace } from '../server/diplomacy';
import { emergencyLevy } from '../server/emergency';
import { beginSiege } from '../server/siege';
import { resolveBattle, compositionPower } from '../server/combat';
import { migrateV5 } from '../server/migration';
import { validGame } from '../server/storage';
import { makeMap, STRAITS, WORLD_STARTS, THEATERS } from '../shared/map';
import {
  NATIONS,
  realmEconomy,
  unitCount,
  compositionOf,
  effectiveTax,
  tradeIncomeOf,
  victoryStatus,
  getRelation,
} from '../shared/rules';
import {
  realmLimits,
  maintenanceOf,
  provinceRecruitLimit,
  recruitedCount,
} from '../shared/economy';
import { crossingOptions } from '../shared/naval';
import { supplyConnected } from '../shared/logistics';
import { levyReason } from '../shared/emergency';
import { objectiveCards } from '../shared/strategy';
import { emptyTurnReport, type GameState } from '../shared/types';
const p = (g: GameState, id: string) => g.provinces.find((p) => p.id === id)!;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.025, `${a} != ${b}`);
function fresh(
  mode: 'quick' | 'campaign' = 'campaign',
  theater: (typeof THEATERS)[number] = 'EUROPE',
  seats = 8,
) {
  const g = createGame('FRESH', mode, false, 123, theater);
  for (const n of NATIONS.slice(0, seats)) addPlayer(g, n.id, false, n.id);
  startGame(g);
  return g;
}

test('oito spawns mundiais seguem os pares explícitos, sem sobreposição', () => {
  const g = fresh();
  for (const a of g.players) {
    assert.equal(p(g, WORLD_STARTS[a.nationId][0]).capitalOf, a.id);
    assert.deepEqual(
      g.provinces
        .filter((p) => p.ownerId === a.id)
        .map((p) => p.id)
        .sort(),
      [...WORLD_STARTS[a.nationId]].sort(),
    );
  }
  assert.equal(g.provinces.filter((p) => p.ownerId).length, 16);
  assert.ok(validGame(g));
});
test('capitais rápidas ficam no continente e maximizam distância com três participantes', () => {
  for (const theater of THEATERS) {
    const g = fresh('quick', theater, 3),
      homes = g.provinces.filter((p) => p.capitalOf);
    assert.equal(homes.length, 3);
    assert.ok(
      homes.every((p) =>
        theater === 'AMERICAS'
          ? ['NORTH_AMERICA', 'SOUTH_AMERICA'].includes(p.continent)
          : p.continent === theater,
      ),
    );
    for (const a of homes)
      for (const b of homes) if (a !== b) assert.ok(!a.neighbors.includes(b.id));
  }
});
test('abertura de 3–8 participantes tem saldo entre zero e quatro, reservas e limites reais', () => {
  for (const mode of ['campaign', 'quick'] as const)
    for (const theater of THEATERS)
      for (const seats of [3, 6, 8]) {
        const g = fresh(mode, theater, seats);
        for (const a of g.players) {
          const e = realmEconomy(g, a.id);
          assert.ok(e.net >= 0 && e.net <= 4, `${mode}/${theater}/${a.nationId}: ${e.net}`);
          assert.equal(a.armyCap, e.armyCap);
          assert.ok(a.armyCap < 100);
          assert.ok(a.manpower <= e.manpowerCap);
        }
      }
});
test('pacto impede guerra nas rodadas um e dois e libera na terceira, com rollback', () => {
  const g = fresh('campaign', 'EUROPE', 3),
    [a, b] = g.players;
  const before = structuredClone(g);
  assert.throws(
    () =>
      executeCommand(g, a.id, { type: 'DECLARE_WAR', targetRealmId: b.id, casusBelli: 'CONQUEST' }),
    /Pacto/,
  );
  assert.deepEqual(g, before);
  resolveTurn(g);
  assert.throws(() => declareWar(g, a.id, b.id, 'CONQUEST'), /Pacto/);
  resolveTurn(g);
  declareWar(g, a.id, b.id, 'CONQUEST');
  assert.ok(g.wars[0].active);
});
test('todos os estreitos são recíprocos e possuem mar de referência', () => {
  const map = makeMap();
  for (const [a, b, sea] of STRAITS) {
    assert.ok(map.find((p) => p.id === a)?.straitNeighbors.includes(b));
    assert.ok(map.find((p) => p.id === b)?.neighbors.includes(a));
    assert.equal(map.find((p) => p.id === a)?.straitSeaIds[b], sea);
    assert.equal(map.find((p) => p.id === sea)?.kind, 'SEA_ZONE');
  }
});
test('Gibraltar permite marcha terrestre desde a primeira rodada sem embarque', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'castile', { infantry: 5 });
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['maghreb'] });
  resolveTurn(g);
  assert.equal(u.provinceId, 'maghreb');
  assert.equal(u.embarkedOnId, undefined);
  assert.equal(p(g, 'maghreb').siege?.progress, 1);
});
test('navio de guerra hostil bloqueia estreito; transportes hostis não bloqueiam', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'castile');
  const f = createBattalion(
    g,
    b.id,
    'mediterranean',
    compositionOf({ warships: 1, transports: 1 }),
    {
      isFleet: true,
    },
  );
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['maghreb'] }),
  );
  f.warships = 0;
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['maghreb'] });
});
test('fretamento cruza dois mares por quinze ouro sem estado terrestre no mar', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'castile', { infantry: 5 }),
    before = a.gold;
  submitOrder(g, a.id, { type: 'AUTO_TRANSPORT', battalionId: u.id, targetProvinceId: 'brazil' });
  const o = g.orders[a.id][0];
  assert.equal(o.type, 'AUTO_TRANSPORT');
  if (o.type === 'AUTO_TRANSPORT') {
    assert.equal(o.fleetId, undefined);
    assert.equal(o.seaPath?.length, 2);
  }
  const r = resolveTurn(g);
  assert.equal(u.provinceId, 'brazil');
  assert.equal(u.embarkedOnId, undefined);
  near(a.gold, before - 15 + r.economy.find((e) => e.playerId === a.id)!.net);
  assert.ok(r.movements.some((m) => m.battalionId === u.id && m.viaSeaId));
});
test('frota disponível torna a travessia automática gratuita e não pode marchar junto', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'castile'),
    f = createBattalion(g, a.id, 'north-atlantic', compositionOf({ warships: 1, transports: 2 }), {
      isFleet: true,
    }),
    before = a.gold;
  submitOrder(g, a.id, { type: 'AUTO_TRANSPORT', battalionId: u.id, targetProvinceId: 'brazil' });
  assert.equal((g.orders[a.id][0] as { fleetId?: string }).fleetId, f.id);
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: f.id, path: ['mediterranean'] }),
  );
  const r = resolveTurn(g);
  near(a.gold, before + r.economy.find((e) => e.playerId === a.id)!.net);
  assert.equal(u.provinceId, 'brazil');
  assert.equal(f.provinceId, 'north-atlantic');
});
test('fretamento precisa de porto ou capital costeira e respeita ouro reservado', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'castile');
  for (const q of g.provinces) {
    q.portLevel = 0;
    q.capitalOf = null;
  }
  assert.equal(crossingOptions(g, u, p(g, 'brazil')).length, 0);
  p(g, 'castile').capitalOf = a.id;
  a.gold = 24;
  submitOrder(g, a.id, { type: 'BUILD_MARKET', provinceId: 'castile' });
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'AUTO_TRANSPORT', battalionId: u.id, targetProvinceId: 'brazil' }),
  );
  cancelOrder(g, a.id, 'city:castile');
  submitOrder(g, a.id, { type: 'AUTO_TRANSPORT', battalionId: u.id, targetProvinceId: 'brazil' });
});
test('capacidade compartilhada é reservada antes de executar travessias', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.gold = 0;
  const one = army(g, a.id, 'castile', { infantry: 3 }),
    two = army(g, a.id, 'castile', { infantry: 3 });
  createBattalion(g, a.id, 'north-atlantic', compositionOf({ transports: 1 }), { isFleet: true });
  submitOrder(g, a.id, { type: 'AUTO_TRANSPORT', battalionId: one.id, targetProvinceId: 'brazil' });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'AUTO_TRANSPORT',
      battalionId: two.id,
      targetProvinceId: 'brazil',
    }),
  );
});
test('bloqueio que surge no planejamento cancela fretamento sem cobrar taxa', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    u = army(g, a.id, 'castile'),
    before = a.gold;
  declareWar(g, a.id, b.id, 'CONQUEST');
  submitOrder(g, a.id, { type: 'AUTO_TRANSPORT', battalionId: u.id, targetProvinceId: 'brazil' });
  createBattalion(g, b.id, 'south-atlantic', compositionOf({ warships: 10 }), { isFleet: true });
  const r = resolveTurn(g);
  assert.equal(u.provinceId, 'castile');
  near(a.gold, before + r.economy.find((e) => e.playerId === a.id)!.net);
  assert.ok(r.events.some((e) => e.includes('fretamento bloqueado')));
});

test('base fiscal/comercial aplica escassez e edifícios têm renda adicional explícita', () => {
  const {
      g,
      players: [a],
    } = setup(),
    q = p(g, 'castile');
  Object.assign(q, {
    baseTax: 10,
    pacification: 100,
    unrest: 0,
    religion: a.faith,
    resource: 'trade',
    portLevel: 0,
    marketLevel: 0,
  });
  near(effectiveTax(q, a.faith), 10 * 0.65 * 0.55 * 1.15);
  near(tradeIncomeOf(q), 0.55);
  q.marketLevel = 1;
  q.portLevel = 1;
  near(tradeIncomeOf(q), 4.05);
});
test('dízimo exclui neutros, depende da fé de nações ativas e respeita tetos três/seis', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.faith = b.faith = 'SOLAR';
  for (const q of g.provinces) q.religion = 'SOLAR';
  p(g, 'italy').ownerId = a.id;
  near(realmEconomy(g, a.id).tithes, 0.75);
  for (const q of g.provinces.filter((q) => q.kind === 'LAND').slice(0, 30)) q.ownerId = a.id;
  near(realmEconomy(g, a.id).tithes, 3);
  p(g, 'italy').templeLevel = 1;
  near(realmEconomy(g, a.id).tithes, 6);
});
test('nação eliminada perde renda de ocupações órfãs e não acumula tesouro fantasma', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  p(g, 'castile').ownerId = b.id;
  p(g, 'germany').occupierId = a.id;
  a.gold = 4015.06;
  assert.equal(realmEconomy(g, a.id).grossIncome, 0);
  resolveTurn(g);
  assert.equal(p(g, 'germany').occupierId, null);
  assert.equal(a.gold, 4015.06);
  assert.ok(g.provinces.some((p) => p.ownerId === c.id));
});
test('armyCap e manpower seguem fórmulas e regeneração cai com desgaste', () => {
  const {
      g,
      players: [a],
    } = setup(),
    q = p(g, 'castile');
  q.barracksLevel = 2;
  let l = realmLimits(g, a.id);
  assert.equal(l.armyCap, 23);
  assert.equal(l.manpowerCap, 20.5);
  assert.equal(l.manpowerGain, 1.5);
  a.warExhaustion = 25;
  l = realmLimits(g, a.id);
  near(l.manpowerGain, 1.05);
  q.pacification = 79;
  assert.equal(realmLimits(g, a.id).manpowerCap, 20);
  a.manpower = 100;
  resolveTurn(g);
  assert.equal(
    a.manpower,
    100,
    'Reservas legadas acima do limite são preservadas e não regeneram.',
  );
});
test('manutenção usa pesos por tipo e excesso custa três vezes proporcionalmente', () => {
  const {
    g,
    players: [a],
  } = setup();
  const u = army(g, a.id, 'castile', { infantry: 5, cavalry: 2, artillery: 1 });
  const f = createBattalion(
    g,
    a.id,
    'north-atlantic',
    compositionOf({ warships: 3, transports: 2 }),
    { isFleet: true },
  );
  near(realmEconomy(g, a.id).upkeep, maintenanceOf(u) * 0.5 + maintenanceOf(f));
  u.infantry += 15;
  const total = unitCount(u) + unitCount(f);
  near(
    realmEconomy(g, a.id).upkeep,
    (maintenanceOf(u) * 0.5 + maintenanceOf(f)) *
      (1 + (2 * (total - realmLimits(g, a.id).armyCap)) / total),
  );
});
test('sem quartel só duas infantarias; quartel um recruta quatro e quartel dois/fundição sete', () => {
  const {
      g,
      players: [a],
    } = setup(),
    q = p(g, 'castile');
  assert.equal(provinceRecruitLimit(q), 2);
  for (const o of [{ infantry: 3 }, { cavalry: 1 }, { artillery: 1 }])
    assert.throws(() =>
      submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: q.id, ...o }),
    );
  q.barracksLevel = 1;
  submitOrder(g, a.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: q.id,
    infantry: 2,
    cavalry: 1,
    artillery: 1,
  });
  resolveTurn(g);
  assert.equal(recruitedCount(q, 1), 4);
  q.barracksLevel = 2;
  assert.equal(provinceRecruitLimit(q), 7);
  q.barracksLevel = 0;
  q.foundryLevel = 1;
  assert.equal(provinceRecruitLimit(q), 7);
});
test('mercenários não contornam o limite local por repetição ou divisão de formações', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.gold = 200;
  for (let i = 0; i < 2; i++)
    submitOrder(g, a.id, {
      type: 'RECRUIT_BATTALION',
      provinceId: 'castile',
      infantry: 1,
      isMercenary: true,
    });
  assert.equal(recruitedCount(p(g, 'castile'), g.turn), 2);
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'RECRUIT_BATTALION',
      provinceId: 'castile',
      infantry: 1,
      isMercenary: true,
    }),
  );
  resolveTurn(g);
  assert.equal(recruitedCount(p(g, 'castile'), g.turn), 0);
  submitOrder(g, a.id, {
    type: 'RECRUIT_BATTALION',
    provinceId: 'castile',
    infantry: 2,
    isMercenary: true,
  });
});
test('mercenários respeitam a capacidade reservada por uma ordem regular', () => {
  const {
    g,
    players: [a],
  } = setup();
  submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: 'castile', infantry: 2 });
  assert.throws(() =>
    submitOrder(g, a.id, {
      type: 'RECRUIT_BATTALION',
      provinceId: 'castile',
      infantry: 1,
      isMercenary: true,
    }),
  );
});
test('um quartel ainda em construção só libera armas avançadas na rodada seguinte', () => {
  const {
    g,
    players: [a],
  } = setup();
  submitOrder(g, a.id, { type: 'BUILD_BUILDING', provinceId: 'castile', building: 'BARRACKS' });
  assert.throws(() =>
    submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: 'castile', cavalry: 1 }),
  );
  resolveTurn(g);
  submitOrder(g, a.id, { type: 'RECRUIT_BATTALION', provinceId: 'castile', cavalry: 1 });
});
test('insolvência causa deserção: duzentas e cinquenta tropas sem estrutura não persistem de graça', () => {
  const {
    g,
    players: [a],
  } = setup();
  a.gold = 0;
  p(g, 'castile').baseSupplyLimit = 1000;
  army(g, a.id, 'castile', { infantry: 250 });
  const r = resolveTurn(g);
  assert.ok(
    g.battalions.filter((u) => u.ownerId === a.id).reduce((n, u) => n + unitCount(u), 0) < 200,
  );
  assert.equal(a.gold, 0);
  assert.ok(r.desertions.some((d) => d.ownerId === a.id && d.losses > 0));
  assert.ok(validGame(g));
});

test('moral estacionária própria recupera 35 ou 45 com quartel, aliada/ocupada 20 e cerco oito', () => {
  for (const [kind, expected] of [
    ['own', 35],
    ['barracks', 45],
    ['allied', 20],
    ['occupied', 20],
    ['siege', 8],
  ] as const) {
    const {
      g,
      players: [a, b, c],
    } = setup();
    let q = p(g, 'castile');
    if (kind === 'barracks') q.barracksLevel = 1;
    if (kind === 'allied') {
      q = p(g, 'germany');
      getRelation(g, a.id, c.id)!.allied = true;
    }
    if (kind === 'occupied' || kind === 'siege') {
      declareWar(g, a.id, b.id, 'CONQUEST');
      q = p(g, 'france');
      q.fortLevel = 2;
      if (kind === 'occupied') q.occupierId = a.id;
    }
    const u = army(g, a.id, q.id, { infantry: 3 });
    u.morale = 20;
    resolveTurn(g);
    assert.equal(u.morale, 20 + expected, kind);
  }
});
test('defensor que lutou não recebe recuperação instantânea de moral', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const x = army(g, a.id, 'castile', { infantry: 5 }),
    d = army(g, b.id, 'france', { infantry: 8 });
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: x.id, path: ['france'] });
  const r = resolveTurn(g),
    battle = r.battles[0];
  assert.ok(g.battalions.includes(d));
  assert.equal(d.morale, battle.defenderMoraleAfter);
});
test('combate médio causa pelo menos duas baixas campais com letalidade revisada', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const q = p(g, 'france'),
    u = army(g, a.id, q.id, { infantry: 12 });
  army(g, b.id, q.id, { infantry: 10 });
  const r = emptyTurnReport(g.turn, g.diet);
  resolveBattle(g, u, q, r);
  assert.ok(r.battles[0].attackerCompositionLosses.infantry >= 2);
  assert.ok(r.battles[0].defenderCompositionLosses.infantry >= 2);
});
test('cercamento aplica vinte de moral e quinze por cento de atrito quando não há caminho', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  p(g, 'japan').ownerId = b.id;
  p(g, 'japan').fortLevel = 2;
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'japan', { infantry: 10 });
  u.morale = 60;
  assert.equal(supplyConnected(g, u), false);
  const r = resolveTurn(g);
  assert.ok(u.encircled);
  assert.ok(r.encirclements.some((e) => e.battalionId === u.id && e.losses === 2));
  assert.equal(u.morale, 48);
});
test('porto/frota conecta a linha marítima e frota hostil corta a rota', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  p(g, 'japan').ownerId = b.id;
  p(g, 'alaska').ownerId = a.id;
  const u = army(g, a.id, 'japan');
  assert.equal(supplyConnected(g, u), false);
  createBattalion(g, a.id, 'north-pacific', compositionOf({ warships: 2 }), { isFleet: true });
  assert.equal(supplyConnected(g, u), true);
  declareWar(g, a.id, b.id, 'CONQUEST');
  createBattalion(g, b.id, 'north-pacific', compositionOf({ warships: 1 }), { isFleet: true });
  assert.equal(supplyConnected(g, u), false);
});

test('Defesa da Pátria exige guerra defensiva, custa recursos e mobiliza na província segura', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  b.gold = 200;
  p(g, 'italy').ownerId = b.id;
  declareWar(g, a.id, b.id, 'CONQUEST');
  const invader = army(g, a.id, 'france');
  beginSiege(g, invader, p(g, 'france'));
  assert.equal(levyReason(g, b.id), null);
  assert.throws(() => emergencyLevy(g, a.id));
  emergencyLevy(g, b.id);
  const levy = g.battalions.find((u) => u.name === 'Defesa da Pátria')!;
  assert.equal(levy.provinceId, 'italy');
  assert.equal(levy.infantry, 5);
  assert.equal(levy.morale, 90);
  assert.equal(b.gold, 150);
  assert.equal(b.stability, 100);
  assert.equal(b.authority, b.influence + b.prestige + b.militaryXP);
  assert.equal(b.homelandDefenseUntil, 2);
  assert.throws(() => emergencyLevy(g, b.id));
  g.turn = 8;
  assert.throws(() => emergencyLevy(g, b.id));
  g.turn = 9;
  b.militaryXP += 15;
  emergencyLevy(g, b.id);
  assert.equal(b.gold, 100);
});
test('bônus da Defesa da Pátria vale quinze por cento só em terra própria e expira', () => {
  const {
      g,
      players: [a, b],
    } = setup(),
    u = army(g, b.id, 'france');
  const base = compositionPower(g, u, p(g, 'france'), true);
  b.homelandDefenseUntil = g.turn + 1;
  near(compositionPower(g, u, p(g, 'france'), true) / base, 1.15);
  g.turn += 2;
  near(compositionPower(g, u, p(g, 'france'), true), base);
  b.homelandDefenseUntil = g.turn + 1;
  near(
    compositionPower(g, u, p(g, 'castile'), true),
    compositionPower(
      { ...g, players: g.players.map((p) => ({ ...p, homelandDefenseUntil: 0 })) },
      u,
      p(g, 'castile'),
      true,
    ),
  );
  assert.ok(a.id);
});
test('leva de emergência não consome ouro reservado de construções', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  b.lostProvinceIds = ['old-city'];
  b.gold = 60;
  submitOrder(g, b.id, { type: 'BUILD_MARKET', provinceId: 'france' });
  assert.throws(() => emergencyLevy(g, b.id), /reservado/);
});
test('cartas de Pax e Rivalidade exigem 55% e bots não vencem por carta por padrão', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  for (const kind of ['aurelia', 'ferro_norte'] as const) {
    a.nationId = kind;
    assert.equal(objectiveCards(g, a)[0].requirements.find((r) => r.key === 'share')?.target, 55);
  }
  a.nationId = 'kaldor';
  a.bot = true;
  a.secretObjectives = objectiveCards(g, a);
  a.selectedObjectiveId = a.secretObjectives[0].id;
  a.objectiveStreak = 3;
  a.gold = 1000;
  g.provinces
    .filter((q) => q.kind === 'LAND')
    .slice(0, Math.ceil(g.provinces.filter((p) => p.kind === 'LAND').length * 0.4))
    .forEach((q, i) => {
      q.ownerId = a.id;
      q.occupierId = null;
      q.pacification = 100;
      q.unrest = 0;
      q.religion = a.faith;
      if (i < 2) q.strategicResource = 'RELIC';
    });
  p(g, 'japan').ownerId = b.id;
  p(g, 'korea').ownerId = c.id;
  assert.equal(victoryStatus(g), null);
  g.allowBotSecretVictory = true;
  assert.equal(victoryStatus(g)?.objective, 'SECRET_OBJECTIVE');
});
test('sandbox preserva vencedor original, reabre planejamento e não encerra de novo por domínio', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  g.provinces
    .filter((p) => p.kind === 'LAND')
    .filter((p) => !['japan', 'korea'].includes(p.id))
    .slice(0, Math.ceil(g.provinces.filter((p) => p.kind === 'LAND').length * 0.75))
    .forEach((p) => {
      p.ownerId = a.id;
      p.occupierId = null;
      p.pacification = 100;
      p.unrest = 0;
    });
  p(g, 'japan').ownerId = b.id;
  p(g, 'korea').ownerId = c.id;
  resolveTurn(g);
  assert.equal(g.phase, 'finished');
  assert.throws(() => executeCommand(g, b.id, { type: 'CONTINUE_SANDBOX' }));
  const next = executeCommand(g, a.id, { type: 'CONTINUE_SANDBOX' });
  assert.equal(next.sandboxContinued, true);
  assert.equal(next.phase, 'planning');
  assert.equal(next.victoryRecord?.winnerId, a.id);
  resolveTurn(next);
  assert.equal(next.phase, 'planning');
  assert.equal(victoryStatus(next), null);
});
test('alertas pessoais têm envolvidos, foco e severidade; confirmação de leitura não vaza', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const alert = g.notifications.find((n) => n.type === 'DECLARE_WAR')!;
  assert.equal(alert.severity, 'CRITICAL');
  assert.ok(alert.focusProvinceId);
  assert.deepEqual(alert.involvesPlayerIds, [a.id, b.id]);
  assert.ok(viewFor(g, b.id).notifications.some((n) => n.id === alert.id));
  assert.ok(!viewFor(g, c.id).notifications.some((n) => n.id === alert.id));
  const next = executeCommand(g, b.id, { type: 'READ_NOTIFICATIONS', notificationIds: [alert.id] });
  assert.ok(viewFor(next, b.id).readNotificationIds.includes(alert.id));
  assert.deepEqual(viewFor(next, a.id).readNotificationIds, []);
  assert.ok(!('notificationReads' in viewFor(next, b.id)));
});
test('proposta de paz e chamado às armas vinculam o alerta à oferta acionável', () => {
  const {
    g,
    players: [a, b, c],
  } = setup();
  getRelation(g, b.id, c.id)!.allied = true;
  const w = declareWar(g, a.id, b.id, 'CONQUEST');
  const call = g.notifications.find((n) => n.type === 'CALL_TO_ARMS')!;
  assert.ok(g.offers.some((o) => o.id === call.offerId && o.to === c.id));
  offerPeace(g, a.id, w.id, []);
  const peace = g.notifications.find((n) => n.type === 'PEACE_OFFER')!;
  assert.ok(g.offers.some((o) => o.id === peace.offerId && o.to === b.id));
});
test('cerco e aniquilação emitem alertas pessoais com província de foco', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  declareWar(g, a.id, b.id, 'CONQUEST');
  const u = army(g, a.id, 'france', { infantry: 30 });
  beginSiege(g, u, p(g, 'france'));
  assert.ok(
    viewFor(g, b.id).notifications.some(
      (n) => n.type === 'SIEGE_STARTED' && n.focusProvinceId === 'france',
    ),
  );
  army(g, b.id, 'france', { infantry: 2 });
  resolveTurn(g);
  assert.ok(viewFor(g, b.id).notifications.some((n) => n.type === 'BATTALION_WIPED'));
});
test('migração v5 preserva ouro, tropas e locais; recalcula limites e reabre planos antigos', () => {
  const {
    g,
    players: [a],
  } = setup();
  army(g, a.id, 'castile', { infantry: 20 });
  a.gold = 4015;
  a.manpower = 103;
  a.armyCap = 999;
  g.orders[a.id] = [{ type: 'RECRUIT_BATTALION', provinceId: 'castile', infantry: 10 }];
  const old = structuredClone(g) as unknown as { version: number };
  old.version = 5;
  const next = migrateV5(old);
  assert.equal(next.version, 7);
  assert.equal(next.players[0].gold, 4015);
  assert.equal(next.battalions[0].infantry, 20);
  assert.ok(next.players[0].armyCap < 999);
  assert.equal(next.players[0].manpower, 103);
  assert.ok(next.players[0].manpowerCap < 103);
  assert.equal(next.orders[a.id].length, 0);
  assert.ok(next.provinces.find((p) => p.id === 'castile')?.straitNeighbors.includes('maghreb'));
  assert.ok(validGame(next));
});

test('estreito de Bering custa uma rodada mesmo desembocando em floresta', () => {
  const {
    g,
    players: [a],
  } = setup();
  p(g, 'alaska').ownerId = a.id;
  const u = army(g, a.id, 'alaska', { infantry: 5 });
  assert.equal(p(g, 'siberia').terrain, 'forest');
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['siberia'] });
  resolveTurn(g);
  assert.equal(u.provinceId, 'siberia');
});

test('nova oferta de paz na mesma rodada gera alerta não lido com a oferta correta', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  const war = declareWar(g, a.id, b.id, 'CONQUEST');
  offerPeace(g, a.id, war.id, []);
  const first = g.notifications.find((n) => n.type === 'PEACE_OFFER')!;
  const read = executeCommand(g, b.id, { type: 'READ_NOTIFICATIONS', notificationIds: [first.id] });
  const declined = executeCommand(read, b.id, {
    type: 'ANSWER_OFFER',
    offerId: first.offerId!,
    accept: false,
  });
  offerPeace(declined, a.id, war.id, []);
  const notices = viewFor(declined, b.id).notifications.filter((n) => n.type === 'PEACE_OFFER');
  assert.equal(notices.length, 2);
  assert.notEqual(notices[1].offerId, first.offerId);
  assert.ok(!viewFor(declined, b.id).readNotificationIds.includes(notices[1].id));
  const accepted = executeCommand(declined, b.id, {
    type: 'ANSWER_OFFER',
    offerId: notices[1].offerId!,
    accept: true,
  });
  assert.ok(!accepted.wars.some((w) => w.active));
});

test('cada participante altera apenas seu nome, normaliza espaços e conserva a identidade', () => {
  const g = createGame('NAMES', 'campaign', false, 123),
    a = addPlayer(g, 'A', false, 'vespera'),
    b = addPlayer(g, 'B', false, 'aurelia');
  const next = executeCommand(g, b.id, {
    type: 'SET_PLAYER_NAME',
    name: '  Ana   Maria  ',
    playerId: a.id,
  } as unknown as import('../shared/types').GameCommand);
  assert.equal(next.players[1].name, 'Ana Maria');
  assert.equal(next.players[0].name, 'A');
  assert.equal(next.players[1].id, b.id);
  assert.equal(next.players[1].nationId, b.nationId);
  assert.ok(validGame(next));
});
test('renomear no planejamento confirmado e no resultado não altera prazo, recursos ou ordens', () => {
  const {
    g,
    players: [a],
  } = setup();
  const ready = executeCommand(g, a.id, { type: 'READY', ready: true }, 1000);
  const next = executeCommand(ready, a.id, { type: 'SET_PLAYER_NAME', name: 'Novo nome' });
  assert.equal(next.players[0].ready, true);
  assert.equal(next.turnDeadlineAt, ready.turnDeadlineAt);
  assert.equal(next.players[0].gold, ready.players[0].gold);
  assert.deepEqual(next.orders, ready.orders);
  next.phase = 'finished';
  assert.equal(
    executeCommand(next, a.id, { type: 'SET_PLAYER_NAME', name: 'Depois' }).players[0].name,
    'Depois',
  );
});
test('nomes vazios, longos ou inválidos são rejeitados sem alterar a sala', () => {
  const {
      g,
      players: [a],
    } = setup(),
    before = structuredClone(g);
  for (const name of ['   ', 'a'.repeat(31), 'a\u0000b', 42])
    assert.throws(() =>
      executeCommand(g, a.id, {
        type: 'SET_PLAYER_NAME',
        name,
      } as import('../shared/types').GameCommand),
    );
  assert.deepEqual(g, before);
});
test('anfitrião escolhe nação do bot no lobby, incluindo suas propriedades e spawn', () => {
  let g = createGame('BOTS', 'campaign', false, 123);
  const host = addPlayer(g, 'Host', false, 'vespera'),
    bot = addPlayer(g, 'Bot', true, 'aurelia');
  addPlayer(g, 'Outro', true, 'ferro_norte');
  g = executeCommand(g, host.id, { type: 'SET_BOT_NATION', playerId: bot.id, nationId: 'kaldor' });
  const updated = g.players[1],
    nation = NATIONS.find((n) => n.id === 'kaldor')!;
  assert.equal(updated.nation, nation.name);
  assert.equal(updated.color, nation.color);
  assert.equal(updated.faith, nation.religion);
  startGame(g);
  assert.equal(p(g, 'south-africa').capitalOf, bot.id);
  assert.ok(validGame(g));
});
test('troca entre bots é atômica mesmo quando oito nações estão ocupadas', () => {
  let g = createGame('FULL', 'campaign', false, 123);
  for (const [i, n] of NATIONS.entries()) addPlayer(g, n.id, i > 0, n.id);
  const [host, a, b] = g.players;
  g = executeCommand(g, host.id, { type: 'SET_BOT_NATION', playerId: a.id, nationId: b.nationId });
  assert.equal(g.players[1].nationId, b.nationId);
  assert.equal(g.players[2].nationId, a.nationId);
  assert.equal(new Set(g.players.map((p) => p.nationId)).size, 8);
  assert.ok(validGame(g));
});
test('convidado não configura bots, anfitrião não troca humanos, e campanha bloqueia troca de nação', () => {
  const g = createGame('GUARDS', 'campaign', false, 123),
    host = addPlayer(g, 'Host', false, 'vespera'),
    guest = addPlayer(g, 'Guest', false, 'aurelia'),
    bot = addPlayer(g, 'Bot', true, 'ferro_norte');
  const change = { type: 'SET_BOT_NATION', playerId: bot.id, nationId: 'kaldor' } as const;
  assert.throws(() => executeCommand(g, guest.id, change), /anfitrião/);
  assert.throws(() => executeCommand(g, host.id, { ...change, playerId: guest.id }), /bots/);
  assert.throws(
    () => executeCommand(g, host.id, { ...change, nationId: guest.nationId }),
    /jogador/,
  );
  assert.throws(
    () =>
      executeCommand(g, host.id, {
        ...change,
        nationId: 'invalida',
      } as unknown as import('../shared/types').GameCommand),
    /Nação/,
  );
  startGame(g);
  assert.throws(() => executeCommand(g, host.id, change), /antes de iniciar/);
});

test('atalhos China–Japão e Germânia–Grã-Bretanha exigem transporte, preservando estreitos', () => {
  const {
    g,
    players: [a],
  } = setup();
  for (const [from, to] of [
    ['china-east', 'japan'],
    ['germany', 'britain'],
  ]) {
    p(g, from).ownerId = a.id;
    const u = army(g, a.id, from, { infantry: 3 });
    assert.ok(!p(g, from).neighbors.includes(to));
    assert.ok(!p(g, to).neighbors.includes(from));
    assert.throws(() =>
      submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: [to] }),
    );
    assert.ok(crossingOptions(g, u, p(g, to)).some((o) => o.cost === 15));
  }
  assert.ok(p(g, 'france').straitNeighbors.includes('britain'));
  assert.ok(p(g, 'korea').straitNeighbors.includes('japan'));
});
test('migração remove atalhos marítimos antigos sem mudar posições de tropas', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'china-east', { infantry: 3 });
  p(g, 'china-east').neighbors.push('japan');
  p(g, 'japan').neighbors.push('china-east');
  const old = structuredClone(g) as unknown as { version: number };
  old.version = 5;
  const next = migrateV5(old);
  assert.ok(!p(next, 'china-east').neighbors.includes('japan'));
  assert.equal(next.battalions.find((a) => a.id === u.id)?.provinceId, 'china-east');
});
