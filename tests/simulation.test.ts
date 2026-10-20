import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateBalance } from '../scripts/simulate-balance';
test('simulador v3 repete resultados e verifica batalhões, guerras, duas vitórias e exportação', () => {
  const first = simulateBalance(8, 123456),
    second = simulateBalance(8, 123456);
  assert.deepEqual(first, second);
  assert.equal(first.matches.length, 8);
  assert.equal(first.conditions.length, 2);
  assert.equal(first.conditions.reduce((n, c) => n + c.wins, 0) + first.draws, 8);
  assert.ok(first.matches.every((m) => m.turns <= 40 && m.telemetryTurns === m.turns));
  assert.ok(first.means.battles > 0 && first.means.wars > 0 && first.means.movements > 0);
  assert.ok(
    first.matches.some((m) => m.mode === 'quick') &&
      first.matches.some((m) => m.mode === 'campaign'),
  );
});
