import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateBalance } from '../scripts/simulate-balance';

test('simulador repete os mesmos resultados e realmente termina partidas com seis bots', () => {
  const first = simulateBalance(8, 123456),
    second = simulateBalance(8, 123456);
  assert.deepEqual(first, second);
  assert.equal(first.matches.length, 8);
  assert.equal(first.draws, 0);
  assert.equal(
    first.conditions.reduce((n, c) => n + c.wins, 0),
    8,
  );
  assert.ok(
    first.matches.every((match) => match.turns >= 1 && match.turns <= 40 && match.condition),
  );
  assert.ok(first.means.battles > 0);
  assert.ok(first.means.retreats + first.means.stackwipes > 0);
  assert.equal(first.archetypes.length, 4);
});
