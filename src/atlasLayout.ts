import type { Battalion, Province } from '../shared/types';
export interface MapMarkerPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlaps = (a: MapMarkerPosition, b: MapMarkerPosition) =>
  Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
/** Keep symbols apart in screen space while retaining a leader back to their province. */
export function layoutArmyMarkers(
  armies: Battalion[],
  provinces: Province[],
  scale: number,
  reservedMarkers: MapMarkerPosition[] = [],
) {
  const zoom = Math.max(0.01, scale),
    positions = new Map<string, MapMarkerPosition>(),
    placed: MapMarkerPosition[] = [...reservedMarkers];
  for (const army of [...armies].sort(
    (a, b) => a.provinceId.localeCompare(b.provinceId) || a.id.localeCompare(b.id),
  )) {
    const province = provinces.find((p) => p.id === army.provinceId);
    if (!province) continue;
    const size = { width: 58 / zoom, height: 60 / zoom };
    let selected: MapMarkerPosition | undefined;
    for (let ring = 0; ring < 24 && !selected; ring++) {
      const offsets: [number, number][] = [];
      if (!ring) offsets.push([0, 0]);
      else
        for (let row = -ring; row <= ring; row++)
          for (let col = -ring; col <= ring; col++)
            if (Math.max(Math.abs(row), Math.abs(col)) === ring) offsets.push([col, row]);
      offsets.sort(
        (a, b) =>
          a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1] || b[1] - a[1] || a[0] - b[0],
      );
      for (const [col, row] of offsets) {
        const candidate = {
          x: province.x + (col * 62) / zoom,
          y: province.y + (3 + row * 64) / zoom,
          ...size,
        };
        if (!placed.some((p) => overlaps(candidate, p))) {
          selected = candidate;
          break;
        }
      }
    }
    if (selected) {
      positions.set(army.id, selected);
      placed.push(selected);
    }
  }
  return positions;
}
export function layoutProvinceLabels(
  provinces: Province[],
  markers: Iterable<MapMarkerPosition>,
  scale: number,
) {
  const zoom = Math.max(0.01, scale),
    blocked = [...markers],
    result = new Map<string, { x: number; y: number }>();
  const fontSize = Math.max(4, Math.min(11, 10 / zoom));
  for (const province of [...provinces].sort(
    (a, b) => Number(!!b.capitalOf) - Number(!!a.capitalOf) || a.id.localeCompare(b.id),
  )) {
    const width = Math.max(24 / zoom, province.name.length * (fontSize * 0.62 + 0.4 / zoom)),
      height = 16 / zoom;
    for (const [x, y] of [
      [0, -48],
      [0, 50],
      [-70, -28],
      [70, -28],
      [0, -80],
      [0, 82],
    ]) {
      const candidate = { x: province.x + x / zoom, y: province.y + y / zoom, width, height };
      if (blocked.some((p) => overlaps(candidate, p))) continue;
      blocked.push(candidate);
      result.set(province.id, { x: candidate.x, y: candidate.y + 3 / zoom });
      break;
    }
  }
  return result;
}
