import { Anchor, Castle, Church, Factory, Landmark, Swords } from 'lucide-react';
import type { Province } from '../shared/types';
export function CartographicDefs() {
  return (
    <>
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
export function ProvinceShading({ province: p }: { province: Province }) {
  if (p.kind !== 'LAND') return null;
  return (
    <g className="province-shading" pointerEvents="none" aria-hidden="true">
      <path d={p.path} fill="url(#chart-light)" />
      {['forest', 'hills', 'mountains'].includes(p.terrain) && (
        <path d={p.path} fill={`url(#chart-${p.terrain})`} />
      )}
    </g>
  );
}
export function InfrastructureSymbols({
  province: p,
  scale,
  expanded,
}: {
  province: Province;
  scale: number;
  expanded: boolean;
}) {
  const buildings = [
    { name: 'Forte', level: p.fortLevel, Icon: Castle },
    { name: 'Quartel', level: p.barracksLevel, Icon: Swords },
    { name: 'Porto', level: p.portLevel, Icon: Anchor },
    { name: 'Mercado', level: p.marketLevel, Icon: Landmark },
    { name: 'Fundição', level: p.foundryLevel, Icon: Factory },
    { name: 'Templo', level: p.templeLevel, Icon: Church },
  ].filter((b) => b.level > 0);
  if (!buildings.length || p.kind !== 'LAND') return null;
  const visible = expanded ? buildings : buildings.slice(0, 1);
  return (
    <g
      className="infrastructure-symbols"
      data-infrastructure={p.id}
      pointerEvents="none"
      transform={`translate(${p.x} ${p.y + 29 / scale}) scale(${1 / scale})`}
    >
      <title>
        {p.name}: {buildings.map((b) => `${b.name} ${b.level}`).join(', ')}
      </title>
      {visible.map(({ name, level, Icon }, i) => (
        <g key={name} transform={`translate(${(i - (visible.length - 1) / 2) * 23} 0)`}>
          <rect
            x="-10"
            y="-8"
            width="21"
            height="17"
            rx="4"
            fill="#152c31"
            stroke="#bba76c"
            strokeWidth=".65"
          />
          <Icon x="-7" y="-5" width="11" height="11" color="#e2c98f" strokeWidth="1.8" />
          <text x="6" y="5" textAnchor="middle" fontSize="7" fill="#f5e1b6">
            {level}
          </text>
        </g>
      ))}
    </g>
  );
}
