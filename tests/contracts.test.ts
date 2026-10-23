import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeStaticMap, THEATERS, TERRAIN_DEFENSE } from '../shared/map';
import { NATIONS, RELIGIONS, shortestPath, holyCityId, zeroComposition } from '../shared/rules';
import type { Battalion } from '../shared/types';
test('mapa mundial tem 42 terras orgânicas e zonas marítimas JSON puras', () => {
  const map = makeStaticMap();
  assert.deepEqual(JSON.parse(JSON.stringify(map)), map);
  assert.equal(map.filter((p) => p.kind === 'LAND').length, 42);
  assert.ok(map.some((p) => p.kind === 'SEA_ZONE'));
  for (const p of map) {
    assert.equal(p.terrainDefenseBonus, p.kind === 'SEA_ZONE' ? 1 : TERRAIN_DEFENSE[p.terrain]);
    assert.ok(p.path.startsWith('M'));
    assert.ok(p.rings.every((r) => r.length >= 4));
    for (const id of p.neighbors) assert.ok(map.find((q) => q.id === id)?.neighbors.includes(p.id));
  }
  assert.ok(map.find((p) => p.id === 'germany')!.rings.some((r) => r.length > 10));
});
test('cada teatro rápido contém suas subdivisões e caminhos BFS válidos', () => {
  for (const theater of THEATERS) {
    const map = makeMap('quick', theater);
    assert.equal(
      map.filter((p) => p.kind === 'LAND').length,
      { EUROPE: 9, ASIA: 13, AMERICAS: 11 }[theater],
    );
    assert.ok(
      map.every(
        (p) =>
          p.kind === 'SEA_ZONE' ||
          (theater === 'AMERICAS'
            ? ['NORTH_AMERICA', 'SOUTH_AMERICA'].includes(p.continent)
            : p.continent === theater),
      ),
    );
    for (const faith of Object.keys(RELIGIONS))
      assert.ok(map.some((p) => p.id === holyCityId(faith as keyof typeof RELIGIONS, map)));
    const land = map.filter((p) => p.kind === 'LAND');
    for (const p of land) assert.ok(shortestPath(map, land[0].id, p.id));
  }
});
test('oito nações têm duas ideias, brasão e composição independentes da província', () => {
  assert.equal(new Set(NATIONS.map((n) => n.id)).size, 8);
  assert.equal(new Set(NATIONS.map((n) => n.emblem)).size, 8);
  for (const n of NATIONS) {
    assert.equal(n.ideas.length, 2);
    assert.ok(n.style.length > 0 && n.mechanic.length > 0);
    assert.ok(RELIGIONS[n.religion]);
  }
  const army: Battalion = {
    ...zeroComposition(),
    id: 'a',
    ownerId: 'p',
    name: 'Exército',
    provinceId: 'germany',
    isFleet: false,
    morale: 80,
    training: 1.2,
    entrenched: false,
    pathQueue: [],
    isMercenary: false,
    stranded: false,
    movementCredit: 0,
    movementPoints: 1,
    autoMerge: false,
    infantryPower: 1,
    artilleryPower: 1,
    encircled: false,
    disorganized: false,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(army)), army);
  assert.equal('troops' in makeMap()[0], false);
});
