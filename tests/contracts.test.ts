import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStaticMap, TERRAIN_DEFENSE } from '../shared/map';
import { emptyTurnReport, type PlayerOrder } from '../shared/types';

test('contratos do mapa e de eventos são dados JSON puros e têm terrenos corretos', () => {
  const map = makeStaticMap();
  assert.deepEqual(JSON.parse(JSON.stringify(map)), map);
  assert.equal(map.length, 32);
  for (const p of map) {
    assert.equal(p.terrainDefenseBonus, TERRAIN_DEFENSE[p.terrain]);
    assert.ok(p.baseTax >= 1 && p.baseTax <= 6);
    assert.ok(p.baseSupplyLimit >= 8 && p.baseSupplyLimit <= 20);
    assert.equal(p.polygon.split(' ').length, 6);
    assert.equal('ownerId' in p, false);
  }
  const orders: PlayerOrder[] = [
    { type: 'MOVE_ATTACK', fromProvinceId: 'p16', toProvinceId: 'p8', troops: 4 },
    { type: 'RECRUIT', provinceId: 'p16', amount: 3, isMercenary: true },
    {
      type: 'DIPLOMACY',
      action: 'FUND_REBELS',
      targetRealmId: 'p2',
      targetProvinceId: 'p17',
      amount: 12,
    },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(orders)), orders);
  const report = emptyTurnReport(1);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.deepEqual(Object.keys(report), [
    'turn',
    'battles',
    'retreats',
    'stackwipes',
    'conversions',
    'rebellions',
    'diplomaticChanges',
    'attritionLosses',
    'hegemonyAlerts',
  ]);
});
