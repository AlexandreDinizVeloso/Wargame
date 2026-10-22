import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, army } from './fixtures';
import { submitOrder, resolveTurn } from '../server/game';
import { createBattalion, mergeBattalions } from '../server/state';
import { instantArmyAction } from '../server/armies';
import { declareWar } from '../server/diplomacy';
import { combatPowers } from '../server/combat';
import { developNeutralCities } from '../server/neutral';
import { resolveBombardments } from '../server/maritime';
import { migrateV6 } from '../server/migration';
import { validGame } from '../server/storage';
import { compositionOf, realmEconomy, unitCount } from '../shared/rules';
import { offensiveBlock, isDisorganized } from '../shared/morale';
import { seaTradeNodes, maritimeIncome, bombardmentBlock } from '../shared/maritime';
import { neutralTarget } from '../shared/neutral';
import { emptyTurnReport, type GameState } from '../shared/types';
const p = (g: GameState, id: string) => g.provinces.find((p) => p.id === id)!;
function fixture() {
  const result = setup();
  result.g.turn = 2;
  for (const a of result.players) a.gold = 300;
  return result;
}
function fleet(g: GameState, owner: string, sea = 'north-atlantic', warships = 3, transports = 1) {
  return createBattalion(g, owner, sea, compositionOf({ warships, transports }), {
    isFleet: true,
    morale: 80,
    training: 1.2,
  });
}
test('moral <25 bloqueia ofensiva neutra/inimiga, permitindo terra amiga', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    u = army(g, a.id, 'portugal');
  u.morale = 24;
  assert.match(offensiveBlock(g, u, p(g, 'maghreb'))!, /desorganizada/);
  assert.equal(offensiveBlock(g, u, p(g, 'portugal')), null);
  assert.throws(
    () => submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['castile'] }),
    /desorganizada/,
  );
  u.morale = 25;
  assert.equal(offensiveBlock(g, u, p(g, 'castile')), null);
});
test('marcha já enviada é revalidada, descanso completo em casa reorganiza', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    u = army(g, a.id, 'portugal');
  submitOrder(g, a.id, { type: 'MOVE_BATTALION', battalionId: u.id, path: ['maghreb'] });
  u.morale = 20;
  const r = resolveTurn(g);
  assert.equal(u.provinceId, 'portugal');
  assert.equal(r.battles.length, 0);
  assert.equal(u.pathQueue.length, 0);
  assert.equal(isDisorganized(u), false);
});
test('treinamento eleva moral sem substituir a rodada de reorganização', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    u = army(g, a.id, 'portugal');
  u.morale = 20;
  submitOrder(g, a.id, { type: 'TRAIN_BATTALION', battalionId: u.id });
  resolveTurn(g);
  assert.equal(u.morale, 28);
  assert.equal(u.disorganized, true);
  assert.throws(
    () =>
      submitOrder(g, a.id, {
        type: 'AUTO_TRANSPORT',
        battalionId: u.id,
        targetProvinceId: 'brazil',
      }),
    /desorganizada/,
  );
  resolveTurn(g);
  assert.equal(u.disorganized, false);
});
test('divisão e fusão preservam desorganização mesmo com moral média alta', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    u = army(g, a.id, 'portugal', { infantry: 6 });
  u.morale = 40;
  u.disorganized = true;
  instantArmyAction(g, a.id, {
    type: 'SPLIT_BATTALION',
    battalionId: u.id,
    composition: compositionOf({ infantry: 2 }),
  });
  const split = g.battalions.find((v) => v.id !== u.id)!;
  assert.equal(split.disorganized, true);
  const fresh = army(g, a.id, 'portugal', { infantry: 8 });
  mergeBattalions(fresh, u);
  assert.ok(fresh.morale > 25);
  assert.equal(fresh.disorganized, true);
});
test('formação desorganizada parada em terra neutra não inicia combate', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    u = army(g, a.id, 'maghreb');
  u.morale = 0;
  army(g, 'NEUTRAL', 'maghreb', { infantry: 2 });
  const r = resolveTurn(g);
  assert.equal(r.battles.length, 0);
  assert.equal(u.disorganized, true);
});
test('atrito agrega formações do mesmo dono e divisão não evita perdas', () => {
  const run = (split: boolean) => {
    const {
      g,
      players: [a],
    } = fixture();
    p(g, 'portugal').baseSupplyLimit = 10;
    p(g, 'portugal').portLevel = 0;
    army(g, a.id, 'portugal', { infantry: split ? 15 : 30 });
    if (split) army(g, a.id, 'portugal', { infantry: 15 });
    const r = resolveTurn(g);
    const losses = r.attritionLosses.reduce((n, e) => n + e.losses, 0);
    assert.ok(losses > 0);
    assert.ok(g.battalions.every((u) => u.morale === 80)); // descanso até 100, −20 fome
    return losses;
  };
  assert.equal(run(false), run(true));
});
test('cidades independentes reforçam a cada quatro rodadas, sem duplicar, até o teto', () => {
  const { g } = fixture(),
    city = p(g, 'italy');
  city.baseTax = 8;
  city.fortLevel = 0;
  army(g, 'NEUTRAL', city.id, { infantry: 2 });
  for (const turn of [4, 8, 12, 16, 20, 24]) {
    g.turn = turn;
    const report = emptyTurnReport(turn, g.diet);
    developNeutralCities(g, report);
    const troops = g.battalions
      .filter((u) => u.provinceId === city.id)
      .reduce((n, u) => n + unitCount(u), 0);
    developNeutralCities(g, report);
    assert.equal(
      g.battalions.filter((u) => u.provinceId === city.id).reduce((n, u) => n + unitCount(u), 0),
      troops,
    );
    assert.equal(troops, Math.min(12, 2 + turn / 2));
  }
  assert.equal(city.fortLevel, 2);
  assert.equal(city.neutralDevelopmentLevel, 5);
  assert.equal(neutralTarget(city), 12);
});
test('cidade pobre ou com invasor não cresce; nova guarda recebe treinamento da onda', () => {
  const {
    g,
    players: [a],
  } = fixture();
  g.turn = 4;
  const city = p(g, 'italy');
  city.baseTax = 8;
  army(g, a.id, city.id);
  const poor = p(g, 'maghreb');
  poor.resource = 'grain';
  developNeutralCities(g, emptyTurnReport(4, g.diet));
  assert.equal(city.neutralDevelopmentLevel, 0);
  assert.equal(poor.neutralDevelopmentLevel, 0);
  g.battalions = [];
  developNeutralCities(g, emptyTurnReport(4, g.diet));
  const guard = g.battalions.find((u) => u.provinceId === city.id)!;
  assert.equal(guard.training, 1.08);
  assert.equal(guard.morale, 64);
});
test('nó marítimo exige guerra+transporte e soma navios sem multiplicar renda', () => {
  const {
    g,
    players: [a],
  } = fixture();
  fleet(g, a.id, 'north-atlantic', 2, 0);
  assert.equal(maritimeIncome(g, a.id), 0);
  const cargo = fleet(g, a.id, 'north-atlantic', 0, 2);
  assert.equal(maritimeIncome(g, a.id), 6);
  cargo.morale = 24;
  assert.equal(maritimeIncome(g, a.id), 0);
  cargo.morale = 80;
  cargo.embarkedArmyId = 'loaded';
  assert.equal(maritimeIncome(g, a.id), 0);
  cargo.embarkedArmyId = undefined;
  const eco = realmEconomy(g, a.id);
  g.battalions = [];
  assert.equal(eco.maritimeTrade, 6);
  assert.ok(Math.abs(eco.trade - realmEconomy(g, a.id).trade - 6) < 0.001);
});
test('empate ou navio inimigo interrompe comércio; perder terra impede renda fantasma', () => {
  const {
    g,
    players: [a, b],
  } = fixture();
  fleet(g, a.id);
  const other = fleet(g, b.id);
  assert.equal(seaTradeNodes(g).find((s) => s.seaId === 'north-atlantic')!.contested, true);
  other.transports = 0;
  assert.equal(maritimeIncome(g, a.id), 6);
  declareWar(g, a.id, b.id, 'CONQUEST');
  assert.equal(maritimeIncome(g, a.id), 0);
  g.battalions = g.battalions.filter((u) => u.ownerId === a.id);
  p(g, 'portugal').ownerId = null;
  assert.equal(maritimeIncome(g, a.id), 0);
});
test('receita naval nacional tem teto de doze', () => {
  const {
    g,
    players: [a],
  } = fixture();
  for (const sea of ['north-atlantic', 'south-atlantic', 'western-med']) fleet(g, a.id, sea);
  assert.equal(maritimeIncome(g, a.id), 12);
});
test('bombardeio cobra seis uma vez, reduz forte e vale até a rodada seguinte', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    f = fleet(g, a.id, 'western-med'),
    city = p(g, 'italy');
  city.fortLevel = 2;
  const before = a.gold;
  submitOrder(g, a.id, { type: 'BOMBARD_COAST', battalionId: f.id, targetProvinceId: city.id });
  const r = resolveTurn(g);
  assert.equal(r.bombardments.length, 1);
  assert.equal(city.fortLevel, 1);
  assert.equal(city.coastalBombardment?.untilTurn, 3);
  assert.ok(
    Math.abs(a.gold - (before - 6 + r.economy.find((e) => e.playerId === a.id)!.net)) < 0.02,
  );
});
test('bombardeio revalida frota, bloqueia repetição na costa e inimigo no mar', () => {
  const {
      g,
      players: [a, b],
    } = fixture(),
    f = fleet(g, a.id, 'western-med'),
    city = p(g, 'italy');
  f.warships = 2;
  assert.match(bombardmentBlock(g, f, city)!, /três navios/);
  f.warships = 3;
  submitOrder(g, a.id, { type: 'BOMBARD_COAST', battalionId: f.id, targetProvinceId: city.id });
  const origins = new Map([[f.id, f.provinceId]]),
    r = emptyTurnReport(g.turn, g.diet);
  f.provinceId = 'north-atlantic';
  resolveBombardments(g, r, new Set(), origins);
  assert.equal(r.bombardments.length, 0);
  f.provinceId = 'western-med';
  resolveBombardments(g, r, new Set(), origins);
  assert.equal(r.bombardments.length, 1);
  resolveBombardments(g, r, new Set(), origins);
  assert.equal(r.bombardments.length, 1);
  city.coastalBombardment = null;
  declareWar(g, a.id, b.id, 'CONQUEST');
  fleet(g, b.id, 'western-med', 1, 0);
  assert.match(bombardmentBlock(g, f, city)!, /frota hostil/);
});
test('apoio costeiro afeta só o atacante indicado e expira', () => {
  const {
      g,
      players: [a, b],
    } = fixture(),
    city = p(g, 'italy');
  const u = army(g, a.id, city.id),
    defender = army(g, 'NEUTRAL', city.id);
  city.coastalBombardment = { ownerId: a.id, startedTurn: 1, untilTurn: 2 };
  assert.equal(combatPowers(g, [u], [defender], city).bombardmentModifier, 0.85);
  city.coastalBombardment.ownerId = b.id;
  assert.equal(combatPowers(g, [u], [defender], city).bombardmentModifier, 1);
  city.coastalBombardment.ownerId = a.id;
  g.turn = 3;
  assert.equal(combatPowers(g, [u], [defender], city).bombardmentModifier, 1);
});
test('migração v6 mantém recursos e tropas, cancela ofensivas e inicializa novos campos', () => {
  const {
      g,
      players: [a],
    } = fixture(),
    u = army(g, a.id, 'portugal');
  g.turn = 159;
  u.morale = 20;
  a.ready = true;
  g.orders[a.id] = [
    { type: 'MOVE_BATTALION', battalionId: u.id, path: ['castile'] },
    { type: 'TRAIN_BATTALION', battalionId: u.id },
  ];
  const old = structuredClone(g) as unknown as Record<string, unknown>;
  old.version = 6;
  for (const v of old.provinces as Record<string, unknown>[]) {
    delete v.neutralDevelopmentLevel;
    delete v.neutralDevelopmentTurn;
    delete v.coastalBombardment;
  }
  for (const v of old.battalions as Record<string, unknown>[]) delete v.disorganized;
  const migrated = migrateV6(old);
  assert.equal(migrated.players[0].gold, a.gold);
  assert.equal(unitCount(migrated.battalions[0]), unitCount(u));
  assert.equal(migrated.battalions[0].disorganized, true);
  assert.equal(migrated.players[0].ready, false);
  assert.deepEqual(
    migrated.orders[a.id].map((o) => o.type),
    ['TRAIN_BATTALION'],
  );
  assert.ok(
    migrated.provinces.every(
      (v) => v.neutralDevelopmentLevel === 0 && v.neutralDevelopmentTurn === 159,
    ),
  );
  assert.ok(validGame(migrated));
});
