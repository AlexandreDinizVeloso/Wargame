import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPlayer,
  answerAlliance,
  breakAlliance,
  canAttack,
  createGame,
  proposeAlliance,
  refreshScores,
  resolveTurn,
  startGame,
  submitOrder,
  viewFor,
} from '../server/game';
import { economyOf } from '../shared/types';
import { makeMap } from '../shared/map';

function fixture(mode: 'quick' | 'campaign' = 'quick') {
  const game = createGame('TEST01', mode, true);
  const players = ['Ana', 'Bruno', 'Clara'].map((name) => addPlayer(game, name));
  startGame(game);
  game.targetScore = 999;
  game.seed = 42;
  return { game, players };
}
test('o grafo tem 32 regiões, vizinhanças recíprocas e nenhum território isolado', () => {
  const provinces = makeMap();
  assert.equal(provinces.length, 32);
  for (const p of provinces)
    for (const id of p.neighbors)
      assert.ok(provinces.find((n) => n.id === id)?.neighbors.includes(p.id));
  const visited = new Set<string>();
  const queue = ['p0'];
  while (queue.length) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...provinces.find((p) => p.id === id)!.neighbors);
  }
  assert.equal(visited.size, 32);
});
test('sala só começa com 3–8 jogadores e distribui territórios sem sobreposição', () => {
  const g = createGame('TEST');
  addPlayer(g, 'Ana');
  assert.throws(() => startGame(g), /3 a 8/);
  for (let i = 1; i < 8; i++) addPlayer(g, `Pessoa ${i}`);
  assert.throws(() => addPlayer(g, 'Nona'), /8 jogadores/);
  startGame(g);
  for (const p of g.players) assert.equal(g.provinces.filter((t) => t.ownerId === p.id).length, 2);
  assert.equal(g.provinces.filter((t) => t.ownerId !== null).length, 16);
});
test('servidor recusa ordens de outro reino, marchas não vizinhas e quantidades inválidas', () => {
  const {
    game,
    players: [p, b],
  } = fixture();
  assert.throws(
    () => submitOrder(game, b.id, { provinceId: 'p16', action: 'train' }),
    /suas províncias/,
  );
  assert.throws(
    () =>
      submitOrder(game, p.id, { provinceId: 'p16', action: 'move', targetId: 'p31', amount: 2 }),
    /vizinha/,
  );
  for (const amount of [0, -1, 6, 1.5, NaN])
    assert.throws(
      () => submitOrder(game, p.id, { provinceId: 'p16', action: 'move', targetId: 'p8', amount }),
      /1 tropa/,
    );
});
test('ordens reservam recursos e a substituição não cobra duas vezes', () => {
  const {
    game,
    players: [p],
  } = fixture();
  p.gold = 20;
  submitOrder(game, p.id, { provinceId: 'p16', action: 'develop' });
  assert.throws(
    () => submitOrder(game, p.id, { provinceId: 'p24', action: 'develop' }),
    /Ouro insuficiente/,
  );
  submitOrder(game, p.id, { provinceId: 'p16', action: 'train' });
  submitOrder(game, p.id, { provinceId: 'p24', action: 'train' });
  assert.equal(game.orders[p.id].length, 2);
  assert.equal(p.gold, 20);
  resolveTurn(game);
  assert.equal(p.gold, 20 - 12 + economyOf(game.provinces, p.id).net);
});
test('recrutamento consome reservas, adiciona tropas e dilui o treinamento', () => {
  const {
    game,
    players: [p],
  } = fixture();
  const t = game.provinces[16];
  submitOrder(game, p.id, { provinceId: t.id, action: 'recruit' });
  resolveTurn(game);
  assert.equal(t.troops, 9);
  assert.ok(t.training < 50);
  assert.equal(p.manpower, 10 - 3 + economyOf(game.provinces, p.id).manpower);
});
test('moral e treinamento mudam resultados de combate e marchas deixam guarnição', () => {
  const {
    game,
    players: [p],
  } = fixture();
  const t = game.provinces[16];
  t.morale = 100;
  t.training = 100;
  submitOrder(game, p.id, { provinceId: t.id, action: 'move', targetId: 'p8', amount: 5 });
  resolveTurn(game);
  assert.equal(t.troops, 1);
  assert.equal(game.provinces[8].ownerId, p.id);
  assert.ok(game.provinces[8].unrest > 25);
  assert.ok(game.log.some((e) => e.kind === 'battle' && e.text.includes('Galícia')));
});
test('aliança cancela ataques planejados e rompimento exige duas rodadas de trégua', () => {
  const {
    game,
    players: [a, b],
  } = fixture();
  submitOrder(game, a.id, { provinceId: 'p16', action: 'move', targetId: 'p17', amount: 3 });
  proposeAlliance(game, a.id, b.id);
  answerAlliance(game, b.id, game.offers[0].id, true);
  assert.equal(game.orders[a.id].length, 0);
  assert.equal(canAttack(game, a.id, b.id), false);
  assert.throws(
    () =>
      submitOrder(game, a.id, { provinceId: 'p16', action: 'move', targetId: 'p17', amount: 3 }),
    /aliança ou trégua/,
  );
  const before = a.influence;
  breakAlliance(game, a.id, b.id);
  assert.equal(a.influence, Math.max(0, before - 4));
  assert.equal(game.provinces[16].morale, 65);
  assert.equal(canAttack(game, a.id, b.id), false);
  resolveTurn(game);
  assert.equal(canAttack(game, a.id, b.id), false);
  resolveTurn(game);
  assert.equal(canAttack(game, a.id, b.id), true);
});
test('romper pacto preserva influência não negativa ao cancelar missões que ficaram sem reserva', () => {
  const {
    game,
    players: [a, b],
  } = fixture();
  game.provinces[16].faith = 'Ortodoxia';
  game.provinces[24].faith = 'Ortodoxia';
  a.influence = 4;
  submitOrder(game, a.id, { provinceId: 'p16', action: 'convert' });
  submitOrder(game, a.id, { provinceId: 'p24', action: 'convert' });
  proposeAlliance(game, a.id, b.id);
  answerAlliance(game, b.id, game.offers[0].id, true);
  breakAlliance(game, a.id, b.id);
  assert.equal(game.orders[a.id].length, 0);
  resolveTurn(game);
  assert.ok(a.influence >= 0);
});
test('ordens e semente de resolução não vazam para outros clientes', () => {
  const {
    game,
    players: [a, b],
  } = fixture();
  submitOrder(game, a.id, { provinceId: 'p16', action: 'train' });
  assert.equal(viewFor(game, a.id).myOrders.length, 1);
  assert.equal(viewFor(game, b.id).myOrders.length, 0);
  assert.equal('orders' in viewFor(game, b.id), false);
  assert.equal('seed' in viewFor(game, b.id), false);
});
test('conversão exige duas missões, pacificação reduz revolta e intolerância gera tensão', () => {
  const {
    game,
    players: [a],
  } = fixture();
  const p = game.provinces[16];
  p.faith = 'Ortodoxia';
  p.unrest = 40;
  a.doctrine = 'devout';
  submitOrder(game, a.id, { provinceId: p.id, action: 'convert' });
  resolveTurn(game);
  assert.equal(p.faith, 'Ortodoxia');
  assert.equal(p.conversion, 50);
  assert.equal(p.unrest, 52);
  submitOrder(game, a.id, { provinceId: p.id, action: 'convert' });
  resolveTurn(game);
  assert.equal(p.faith, a.faith);
  assert.equal(a.conversions, 1);
  assert.equal(p.conversion, 0);
  const unrest = p.unrest;
  submitOrder(game, a.id, { provinceId: p.id, action: 'pacify' });
  resolveTurn(game);
  assert.equal(p.unrest, Math.max(0, unrest - 29));
});
test('Campanha aplica suprimentos e desgaste; Rápido mantém logística simplificada', () => {
  const a = fixture('campaign'),
    b = fixture('quick');
  a.game.provinces[16].troops = 30;
  b.game.provinces[16].troops = 30;
  a.game.provinces[16].morale = 90;
  b.game.provinces[16].morale = 90;
  resolveTurn(a.game);
  resolveTurn(b.game);
  assert.ok(a.game.provinces[16].morale < b.game.provinces[16].morale);
  a.players[0].warExhaustion = 50;
  resolveTurn(a.game);
  assert.equal(a.players[0].warExhaustion, 44);
});
test('resolução usa a mesma semente para o mesmo estado e não depende da ordem de confirmação', () => {
  const {
    game,
    players: [a, b],
  } = fixture();
  submitOrder(game, a.id, { provinceId: 'p16', action: 'move', targetId: 'p9', amount: 5 });
  submitOrder(game, b.id, { provinceId: 'p17', action: 'move', targetId: 'p9', amount: 3 });
  const clone = structuredClone(game);
  game.players[0].ready = true;
  clone.players[1].ready = true;
  resolveTurn(game);
  resolveTurn(clone);
  assert.deepEqual(game.provinces, clone.provinces);
  assert.deepEqual(game.players, clone.players);
});
test('todos os caminhos de vitória pontuam e a partida termina com resultado', () => {
  const {
    game,
    players: [a],
  } = fixture();
  a.objective = 'prosperity';
  game.provinces[16].development = 3;
  refreshScores(game);
  assert.ok(a.score >= 6);
  a.objective = 'concord';
  a.peaceTurns = 3;
  refreshScores(game);
  assert.equal(a.score, 5);
  a.objective = 'faith';
  refreshScores(game);
  assert.equal(a.score, 4);
  game.targetScore = 4;
  resolveTurn(game);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winnerId, a.id);
});
test('partida completa com 8 bots termina sem recursos ou tropas negativos', () => {
  const g = createGame('BOTRUN', 'campaign', true);
  for (let i = 0; i < 8; i++)
    addPlayer(
      g,
      `Bot ${i}`,
      true,
      (['conquest', 'prosperity', 'concord', 'faith'] as const)[i % 4],
    );
  startGame(g);
  for (let i = 0; i < 40 && g.phase === 'planning'; i++) {
    resolveTurn(g);
    for (const p of g.players) {
      assert.ok(p.gold >= 0);
      assert.ok(p.manpower >= 0);
      assert.ok(p.influence >= 0);
    }
    for (const t of g.provinces) {
      assert.ok(t.troops >= 1);
      assert.ok(t.morale >= 0 && t.morale <= 100);
      assert.ok(t.training >= 0 && t.training <= 100);
    }
  }
  assert.equal(g.phase, 'finished');
  assert.ok(g.winnerId);
});
