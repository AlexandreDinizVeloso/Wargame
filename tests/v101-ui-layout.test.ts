import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMap } from '../shared/map';
import { layoutArmyMarkers, layoutProvinceLabels } from '../src/atlasLayout';
import type { Battalion } from '../shared/types';

test('v101: símbolos de formações permanecem separados em pilhas e zooms diferentes', () => {
  const map = makeMap('campaign');
  const troops = Array.from(
    { length: 24 },
    (_, i) => ({ id: `army-${i}`, provinceId: i < 18 ? 'castile' : 'france' }) as Battalion,
  );
  for (const scale of [0.45, 1, 2.8]) {
    const positions = layoutArmyMarkers(troops, map, scale);
    assert.equal(positions.size, troops.length);
    assert.deepEqual(positions, layoutArmyMarkers([...troops].reverse(), map, scale));
    const all = [...positions.values()];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i],
          b = all[j];
        assert.ok(
          Math.abs(a.x - b.x) * 2 >= a.width + b.width ||
            Math.abs(a.y - b.y) * 2 >= a.height + b.height,
        );
      }
  }
});
test('v101: nomes do mapa são posicionados fora das miniaturas e de outros nomes', () => {
  const map = makeMap('campaign').filter((p) =>
    ['castile', 'france', 'germany', 'italy', 'balkans', 'poland'].includes(p.id),
  );
  const scale = 0.8;
  const markers = layoutArmyMarkers(
    map.map((p) => ({ id: p.id, provinceId: p.id }) as Battalion),
    map,
    scale,
  );
  const labels = layoutProvinceLabels(map, markers.values(), scale);
  assert.ok(labels.size > 0);
  const boxes = [...markers.values()];
  for (const [id, point] of labels) {
    const province = map.find((p) => p.id === id)!;
    const box = {
      x: point.x,
      y: point.y - 3 / scale,
      width: Math.max(
        24 / scale,
        province.name.length * (Math.max(4, Math.min(11, 10 / scale)) * 0.62 + 0.4 / scale),
      ),
      height: 16 / scale,
    };
    for (const other of boxes)
      assert.ok(
        Math.abs(box.x - other.x) * 2 >= box.width + other.width ||
          Math.abs(box.y - other.y) * 2 >= box.height + other.height,
      );
    boxes.push(box);
  }
});
