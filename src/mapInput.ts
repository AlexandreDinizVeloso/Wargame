import type { Province } from '../shared/types';

/** Use province metadata first: displaced army markers still belong to their actual territory. */
export function provinceTargetId(target: EventTarget | null): string | null {
  return typeof Element !== 'undefined' && target instanceof Element
    ? (target.closest('[data-province]')?.getAttribute('data-province') ?? null)
    : null;
}

/** Even/odd polygon hit testing also handles islands and holes beneath decorative overlays. */
export function provinceAtPoint(provinces: Province[], x: number, y: number): Province | undefined {
  return provinces.find((province) => {
    if (province.kind !== 'LAND') return false;
    let inside = false;
    for (const ring of province.rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j];
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
    return inside;
  });
}
