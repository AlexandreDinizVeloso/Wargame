import assert from 'node:assert/strict';
import test from 'node:test';
import { BALANCE, ECONOMY_BALANCE } from '../shared/balance';
import {
  authorityIncome,
  getNationAuthority,
  realmLimits,
  spendNationAuthority,
} from '../shared/economy';
import { realmEconomy } from '../shared/rules';
import { addPlayer, createGame, executeCommand, resolveTurn, startGame } from '../server/game';
import { earnMilitaryAuthority } from '../server/economy';

function campaign() {
  const g = createGame('SCARCE101', 'campaign', false, 101);
  for (const nation of ['vespera', 'sol_invicto', 'kaldor'] as const)
    addPlayer(g, nation, false, nation);
  startGame(g);
  return g;
}

test('v101 scarcity: abertura de todas as facções mantém 40 Ouro, 8 Recrutas, 8 Autoridade e saldo entre zero e quatro', () => {
  for (const mode of ['campaign', 'quick'] as const)
    for (const theater of ['EUROPE', 'AMERICAS', 'ASIA'] as const)
      for (const seats of [3, 6, 8]) {
        const g = createGame('OPEN101', mode, false, 101, theater);
        g.matchConfig.ruleset = 'GOLD_098';
        g.matchConfig.verticalSlice = true;
        for (let i = 0; i < seats; i++) addPlayer(g, 'P' + i);
        startGame(g);
        for (const player of g.players) {
          assert.equal(player.gold, BALANCE.initialGold);
          assert.equal(player.manpower, BALANCE.initialManpower);
          assert.equal(getNationAuthority(player), BALANCE.initialAuthority);
          const economy = realmEconomy(g, player.id);
          assert.ok(
            economy.net >= BALANCE.openingNetMin && economy.net <= BALANCE.openingNetMax,
            `${mode}/${theater}/${player.nationId}: ${economy.net}`,
          );
          assert.equal(authorityIncome(g, player.id), ECONOMY_BALANCE.authorityPerTurn);
          assert.ok(economy.manpower >= 0.5 && economy.manpower <= 1);
        }
      }
});

test('v101 scarcity: batalhas e cercos compartilham teto de duas Autoridades por nação e rodada', () => {
  const g = campaign(),
    actor = g.players[0],
    before = getNationAuthority(actor);
  assert.equal(earnMilitaryAuthority(g, actor.id, 1), 1);
  assert.equal(earnMilitaryAuthority(g, actor.id, 1), 1);
  for (let i = 0; i < 20; i++) assert.equal(earnMilitaryAuthority(g, actor.id, 1), 0);
  assert.equal(getNationAuthority(actor), before + 2);
  assert.equal(actor.authorityEarnedThisTurn, ECONOMY_BALANCE.militaryAuthorityCapPerTurn);
  g.turn++;
  assert.equal(earnMilitaryAuthority(g, actor.id, 1), 1);
});

test('v101 scarcity: reserva fracionária antiga não financia gasto de Autoridade arredondado para cima', () => {
  const balance = { influence: 1.2, militaryXP: 0, prestige: 2.4 };
  assert.equal(getNationAuthority(balance), 3);
  const before = structuredClone(balance);
  assert.equal(spendNationAuthority(balance, 4), false);
  assert.deepEqual(balance, before);
  assert.equal(spendNationAuthority(balance, 3), true);
  assert.ok(Math.abs(balance.influence + balance.militaryXP + balance.prestige - 0.6) < 1e-10);
});

test('v101 scarcity: bancos de Recrutas legados acima do novo teto são preservados sem regeneração adicional', () => {
  let g = campaign();
  const id = g.players[0].id;
  g.players[0].manpower = 50;
  const originalGold = g.players[0].gold,
    originalAuthority = getNationAuthority(g.players[0]);
  assert.ok(realmLimits(g, id).manpowerCap < 50);
  g = executeCommand(g, id, { type: 'SET_PLAYER_NAME', name: 'Reserva preservada' });
  assert.equal(g.players[0].manpower, 50);
  assert.equal(g.players[0].gold, originalGold);
  assert.equal(getNationAuthority(g.players[0]), originalAuthority);
  const income = authorityIncome(g, id);
  resolveTurn(g);
  assert.equal(g.players[0].manpower, 50);
  assert.equal(getNationAuthority(g.players[0]), originalAuthority + income);
});

test('v101 scarcity: +20 moral custa +35% manutenção e empréstimos descontam caixa sem maquiar receita bruta', () => {
  const g = campaign(),
    actor = g.players[0],
    baseline = realmEconomy(g, actor.id);
  actor.councilEffects = [
    {
      id: 'morale',
      sourceId: 'military-council',
      label: 'Soldos de campanha',
      startsTurn: g.turn,
      expiresTurn: g.turn + 2,
      modifiers: { moraleBonus: 20, upkeepMultiplier: 1.35 },
    },
  ];
  const mobilized = realmEconomy(g, actor.id);
  assert.ok(Math.abs(mobilized.upkeep - baseline.upkeep * 1.35) < 0.02);
  assert.ok(mobilized.net < baseline.net);
  actor.councilEffects = [
    {
      id: 'loan',
      sourceId: 'guilds',
      label: 'Pagamento contratual',
      startsTurn: g.turn,
      expiresTurn: g.turn + 2,
      modifiers: { goldPerTurn: -9 },
    },
  ];
  const debt = realmEconomy(g, actor.id);
  assert.equal(debt.grossIncome, baseline.grossIncome);
  assert.equal(debt.net, Math.round((baseline.net - 9) * 100) / 100);
  assert.equal(debt.councilCashflow, -9);
  g.turn += 3;
  assert.equal(realmEconomy(g, actor.id).councilCashflow, 0);
});

test('v101 scarcity: templos concedem Autoridade inteira somente a cada quatro rodadas', () => {
  const g = campaign(),
    actor = g.players[0],
    capital = g.provinces.find((p) => p.capitalOf === actor.id)!;
  capital.templeLevel = 2;
  g.turn = 3;
  assert.equal(authorityIncome(g, actor.id), 2);
  g.turn = 4;
  assert.equal(authorityIncome(g, actor.id), 4);
  g.turn = 5;
  assert.equal(authorityIncome(g, actor.id), 2);
});
