export { ProvinceStructuresVisual as InfrastructureSymbols } from './MapMiniatures';
import type { Province } from '../shared/types';
export function CartographicDefs() {
  return (
    <>
      <radialGradient id="chart-frost">
        <stop stopColor="#d4f1ff" stopOpacity=".04" />
        <stop offset=".7" stopColor="#c5e9ff" stopOpacity=".16" />
        <stop offset="1" stopColor="#9cd4f1" stopOpacity=".4" />
      </radialGradient>
      <radialGradient id="chart-water">
        <stop stopColor="#234d59" />
        <stop offset="1" stopColor="#0c2837" />
      </radialGradient>
      <linearGradient id="chart-light" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff3c2" stopOpacity=".28" />
        <stop offset=".42" stopColor="#c5b98d" stopOpacity=".04" />
        <stop offset="1" stopColor="#071b20" stopOpacity=".33" />
      </linearGradient>
      <pattern id="chart-waves" width="45" height="30" patternUnits="userSpaceOnUse">
        <path
          d="M3 18q5-3 10 0t10 0M28 7q4-2 8 0"
          fill="none"
          stroke="#91b4ad"
          strokeWidth=".4"
          opacity=".18"
        />
      </pattern>
      <pattern id="chart-mountains" width="23" height="19" patternUnits="userSpaceOnUse">
        <path d="M1 16L10 2L21 16Z" fill="#172b28" opacity=".24" />
        <path d="M1 16L10 2L10 16Z" fill="#edf0ca" opacity=".25" />
        <path d="M6 8L10 2L14 8L10 6Z" fill="#f2e7cb" opacity=".48" />
      </pattern>
      <pattern id="chart-hills" width="22" height="17" patternUnits="userSpaceOnUse">
        <path d="M1 15Q7-2 16 15" fill="#274136" opacity=".18" />
        <path d="M2 13Q7 2 12 8" stroke="#ecdfb3" fill="none" strokeWidth=".6" opacity=".35" />
      </pattern>
      <pattern id="chart-forest" width="19" height="17" patternUnits="userSpaceOnUse">
        <path d="M3 12L7 3L11 12ZM11 16L15 7L19 16Z" fill="#122f28" opacity=".26" />
        <path
          d="M6 6L7 3L9 7M14 10L15 7L17 11"
          stroke="#c4d3a5"
          fill="none"
          strokeWidth=".55"
          opacity=".35"
        />
      </pattern>
    </>
  );
}
export function ProvinceRelief({ province: p, scale }: { province: Province; scale: number }) {
  if (p.kind !== 'LAND') return null;
  const depth = p.terrain === 'mountains' ? 4 : p.terrain === 'hills' ? 3 : 1.5;
  return (
    <g className="province-relief" pointerEvents="none" aria-hidden="true">
      <path
        d={p.path}
        transform={`translate(0 ${depth / scale})`}
        fill="#112b2b"
        stroke="#0b1e28"
        strokeWidth={1.4 / scale}
      />
      <path d={p.path} fill="none" stroke="#8ba7a0" strokeOpacity=".3" strokeWidth={3 / scale} />
    </g>
  );
}
export function ProvinceShading({
  province: p,
  winter = false,
}: {
  province: Province;
  winter?: boolean;
}) {
  if (p.kind !== 'LAND') return null;
  return (
    <g className="province-shading" pointerEvents="none" aria-hidden="true">
      <path d={p.path} fill="url(#chart-light)" />
      {winter && (p.y < 270 || p.terrain === 'mountains') && (
        <path data-winter-frost={p.id} d={p.path} fill="url(#chart-frost)" />
      )}
      {['forest', 'hills', 'mountains'].includes(p.terrain) && (
        <path d={p.path} fill={`url(#chart-${p.terrain})`} />
      )}
    </g>
  );
}
