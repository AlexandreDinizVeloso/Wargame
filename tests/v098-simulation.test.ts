import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startGame, resolveTurn } from '../server/game';
import { NATIONS } from '../shared/rules';
import { SCENARIOS } from '../shared/scenarios';
import { validGame } from '../server/storage';
for (const scenario of SCENARIOS.filter((s) => s.id !== 'CLASSIC'))
  test(`Gold: simulação de oito bots atravessa três eras em ${scenario.id}`, () => {
    const g = createGame(
      'SIM098',
      scenario.mode ?? 'campaign',
      true,
      1977,
      scenario.theater ?? 'EUROPE',
    );
    g.matchConfig.ruleset = 'GOLD_098';
    g.matchConfig.scenarioId = scenario.id;
    g.matchConfig.createdVersion = '0.98.0';
    g.enableSecretObjectives = false;
    for (const n of NATIONS) addPlayer(g, n.name, true, n.id);
    startGame(g);
    for (let i = 0; i < 28 && g.phase === 'planning'; i++) {
      resolveTurn(g);
      assert.equal(validGame(g), true, `Estado inválido em ${scenario.id}, turno ${g.turn}`);
      for (const p of g.players) {
        assert.ok(Number.isFinite(p.gold) && p.gold >= 0);
        assert.ok(Number.isFinite(p.militaryXP));
      }
      assert.ok(g.wars.every((w) => w.warScore >= -100 && w.warScore <= 100));
    }
  });
