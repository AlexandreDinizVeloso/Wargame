import test from 'node:test';
import assert from 'node:assert/strict';
import { DILEMMAS, dilemmaFor } from '../shared/dilemmas';
import { activeCouncilEffects, councilModifiers } from '../shared/councilEffects';
import { getNationAuthority } from '../shared/economy';
import { realmEconomy } from '../shared/rules';
import { effectiveSupply, seasonAt } from '../shared/strategy';
import { chooseDilemma } from '../server/dilemmas';
import { resolveTurn, submitOrder } from '../server/game';
import { validGame } from '../server/storage';
import { setup, army } from './fixtures';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.025, `${a} != ${b}`);

test('v101 conselho: todas as três categorias permanecem no sorteio contextual determinístico', () => {
  const {
    g,
    players: [me],
  } = setup();
  g.turn = 4;
  const categories = new Set<string>(),
    ids = new Set<string>();
  for (let seed = 0; seed < 240; seed++) {
    const card = dilemmaFor(seed, me.id, g.turn, g);
    assert.deepEqual(card, dilemmaFor(seed, me.id, g.turn, g));
    const definition = DILEMMAS.find((d) => d.id === card.id)!;
    categories.add(definition.category);
    ids.add(card.id);
    assert.ok(g.provinces.some((p) => p.id === card.targetProvinceId && p.ownerId === me.id));
  }
  assert.deepEqual([...categories].sort(), ['CRISIS', 'POLICY', 'TACTICAL']);
  assert.equal(ids.size, DILEMMAS.length);
});

test('v101 conselho: cada decisão automática A é financiável com cofres e reservas vazios', () => {
  for (const definition of DILEMMAS) {
    const {
      g,
      players: [me],
    } = setup();
    g.turn = 4;
    me.gold = 0;
    me.manpower = 0;
    me.influence = 0;
    me.prestige = 0;
    me.militaryXP = 0;
    me.activeDilemma = { id: definition.id, turn: 4, targetProvinceId: 'castile' };
    chooseDilemma(g, me.id, 0, true);
    assert.equal(me.activeDilemma, null, definition.id);
    assert.ok(me.gold >= 0 && me.manpower >= 0 && getNationAuthority(me) >= 0, definition.id);
    assert.ok(validGame(g), definition.id);
  }
});

test('v101 conselho: custo de Ouro e Autoridade nunca consome recursos reservados em ordens', () => {
  {
    const {
      g,
      players: [me],
    } = setup();
    g.turn = 4;
    me.gold = 30;
    const home = g.provinces.find((p) => p.id === 'castile')!;
    home.marketLevel = 0;
    home.portLevel = 0;
    submitOrder(g, me.id, { type: 'BUILD_MARKET', provinceId: home.id });
    me.activeDilemma = { id: 'guilds', turn: 4, targetProvinceId: home.id };
    const before = structuredClone(g);
    assert.throws(() => chooseDilemma(g, me.id, 1), /Ouro livre insuficiente/);
    assert.deepEqual(g, before);
  }
  {
    const {
      g,
      players: [me],
    } = setup();
    g.turn = 4;
    me.influence = 11;
    me.prestige = 0;
    me.militaryXP = 0;
    const home = g.provinces.find((p) => p.id === 'castile')!;
    home.religion = me.faith === 'SOLAR' ? 'MERCHANT' : 'SOLAR';
    submitOrder(g, me.id, { type: 'CONVERT', targetProvinceId: home.id });
    me.activeDilemma = { id: 'military-council', turn: 4, targetProvinceId: home.id };
    const before = structuredClone(g);
    assert.throws(() => chooseDilemma(g, me.id, 1), /Autoridade livre insuficiente/);
    assert.deepEqual(g, before);
  }
});

test('v101 conselho: o adiantamento da Coroa cobra quatro parcelas reais e expira na rodada correta', () => {
  const {
    g,
    players: [me],
  } = setup();
  g.turn = 4;
  g.season = seasonAt(g.turn);
  g.globalEvent = { id: 'GOLD_RUSH', startedTurn: 4, endsTurn: 100 };
  me.activeDilemma = { id: 'mint', turn: 4, targetProvinceId: 'castile' };
  const beforeChoice = me.gold;
  chooseDilemma(g, me.id, 0);
  assert.equal(me.gold, beforeChoice + 20);
  for (let turn = 4; turn <= 7; turn++) {
    assert.equal(g.turn, turn);
    assert.equal(councilModifiers(me, turn).goldPerTurn, -7);
    assert.equal(realmEconomy(g, me.id).councilCashflow, -7);
    const before = me.gold;
    const report = resolveTurn(g),
      economy = report.economy.find((e) => e.playerId === me.id)!;
    near(economy.net, economy.income - economy.upkeep - 7);
    near(me.gold, before + economy.net);
  }
  assert.equal(g.turn, 8);
  assert.equal(councilModifiers(me, 8).goldPerTurn, 0);
  assert.equal(realmEconomy(g, me.id).councilCashflow, 0);
});

test('v101 conselho: moral e manutenção começam na decisão e desaparecem juntos após três rodadas', () => {
  const {
    g,
    players: [me],
  } = setup();
  g.turn = 4;
  army(g, me.id, 'castile', { infantry: 5 });
  me.activeDilemma = { id: 'military-council', turn: 4, targetProvinceId: 'castile' };
  chooseDilemma(g, me.id, 1);
  assert.equal(activeCouncilEffects(me, 3).length, 0);
  for (const turn of [4, 5, 6]) {
    assert.equal(councilModifiers(me, turn).moraleBonus, 20);
    assert.equal(councilModifiers(me, turn).upkeepMultiplier, 1.35);
  }
  assert.equal(activeCouncilEffects(me, 7).length, 0);
  assert.equal(councilModifiers(me, 7).moraleBonus, 0);
  assert.equal(councilModifiers(me, 7).upkeepMultiplier, 1);
});

test('v101 conselho: contrato logístico mantém custo nacional e amplia suprimento somente na região escolhida', () => {
  const {
    g,
    players: [me],
  } = setup();
  g.turn = 4;
  g.season = 'SUMMER';
  const home = g.provinces.find((p) => p.id === 'castile')!,
    other = g.provinces.find((p) => p.id === 'balkans')!;
  other.ownerId = me.id;
  other.pacification = 100;
  const originalHome = effectiveSupply(g, me.id, home),
    originalOther = effectiveSupply(g, me.id, other);
  me.activeDilemma = { id: 'harvest', turn: 4, targetProvinceId: home.id };
  chooseDilemma(g, me.id, 1);
  assert.equal(councilModifiers(me, 4).upkeepMultiplier, 1.15);
  assert.equal(councilModifiers(me, 4, home.id).supplyBonus, 6);
  assert.equal(councilModifiers(me, 4, other.id).supplyBonus, 0);
  near(effectiveSupply(g, me.id, home), originalHome + 6);
  near(effectiveSupply(g, me.id, other), originalOther);
  assert.equal(councilModifiers(me, 7, home.id).supplyBonus, 0);
});

test('v101 conselho: reservas antigas acima do novo teto não são confiscadas por escolhas sem custo', () => {
  for (const [id, option, expected] of [
    ['military-council', 1, 100],
    ['barons', 1, 97],
    ['frontier-settlers', 1, 100],
  ] as const) {
    const {
      g,
      players: [me],
    } = setup();
    g.turn = 4;
    me.manpower = 100;
    assert.ok(me.manpower > me.manpowerCap);
    me.activeDilemma = { id, turn: 4, targetProvinceId: 'castile' };
    chooseDilemma(g, me.id, option);
    assert.equal(me.manpower, expected);
  }
});
