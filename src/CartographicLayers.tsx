import { useMemo } from 'react';
import { WORLD_RIVERS, impassableFeatures } from '../shared/map';
export { ProvinceStructuresVisual as InfrastructureSymbols } from './MapMiniatures';
import type { Province, Season } from '../shared/types';
type Terrain = Province['terrain'];

export interface ProvinceContainerMetrics {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  /** Safe inscribed radius around the province centroid (p.x, p.y) */
  safeRadius: number;
  /** Recommended scale factor for interior vector terrain icons so they never overflow */
  iconScale: number;
  /** Optimal interior anchor for the terrain emblem */
  anchorX: number;
  anchorY: number;
}

/**
 * Computes exact bounding-box and boundary-clearance metrics from a province's polygon rings
 * so interior vector terrain icons scale dynamically to fit the province container without overflowing.
 */
export function computeProvinceContainerMetrics(p: Province): ProvinceContainerMetrics {
  const pts = p.rings.flat();
  if (!pts.length) {
    return {
      minX: p.x - 16,
      minY: p.y - 16,
      maxX: p.x + 16,
      maxY: p.y + 16,
      width: 32,
      height: 32,
      safeRadius: 10,
      iconScale: 0.55,
      anchorX: p.x,
      anchorY: p.y - 4,
    };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let minEdgeDistSq = Infinity;

  for (let i = 0; i < pts.length; i++) {
    const [vx, vy] = pts[i];
    if (vx < minX) minX = vx;
    if (vy < minY) minY = vy;
    if (vx > maxX) maxX = vx;
    if (vy > maxY) maxY = vy;
    const dx = vx - p.x;
    const dy = vy - p.y;
    const dSq = dx * dx + dy * dy;
    if (dSq < minEdgeDistSq) minEdgeDistSq = dSq;
  }

  for (const ring of p.rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      const vx = x2 - x1;
      const vy = y2 - y1;
      const lenSq = vx * vx + vy * vy;
      if (lenSq > 1e-6) {
        const t = Math.max(0, Math.min(1, ((p.x - x1) * vx + (p.y - y1) * vy) / lenSq));
        const px = x1 + t * vx;
        const py = y1 + t * vy;
        const dSq = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
        if (dSq < minEdgeDistSq) minEdgeDistSq = dSq;
      }
    }
  }

  const width = Math.max(12, maxX - minX);
  const height = Math.max(12, maxY - minY);
  const nearestEdge = Number.isFinite(minEdgeDistSq) ? Math.sqrt(minEdgeDistSq) : Math.min(width, height) * 0.35;
  const boxRadius = Math.min(width, height) * 0.34;
  const safeRadius = Math.max(6, Math.min(nearestEdge * 0.78, boxRadius));
  const iconScale = Math.max(0.44, Math.min(1.06, (safeRadius * 0.88) / 15.5));
  const offsetY = Math.min(safeRadius * 0.2, 4.5);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    safeRadius,
    iconScale,
    anchorX: p.x,
    anchorY: p.y - offsetY,
  };
}

/**
 * Stylized high-contrast vector terrain icon (SVG) that renders either inside a UI badge or scaled inside a province.
 */
export function TerrainVectorGlyph({
  terrain,
  season = 'SUMMER',
}: {
  terrain: Terrain | string;
  season?: Season;
}) {
  const foliageFill =
    season === 'WINTER'
      ? '#7dd3fc'
      : season === 'AUTUMN'
        ? '#d97706'
        : season === 'SPRING'
          ? '#22c55e'
          : '#16a34a';
  const foliageShadow =
    season === 'WINTER'
      ? '#0369a1'
      : season === 'AUTUMN'
        ? '#92400e'
        : season === 'SPRING'
          ? '#15803d'
          : '#14532d';
  const foliageHighlight =
    season === 'WINTER'
      ? '#f0f9ff'
      : season === 'AUTUMN'
        ? '#fde68a'
        : season === 'SPRING'
          ? '#bbf7d0'
          : '#86efac';

  if (terrain === 'mountains') {
    return (
      <g className="terrain-vector-glyph terrain-mountains">
        {/* Left & Right Flanking Peaks */}
        <path
          d="M-15 8L-7-7L1 8Z"
          fill="#263c47"
          stroke="#050e14"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M-15 8L-7-7L-7 8Z" fill="#8fa6b2" />
        <path d="M-7-7L-10-1L-7-2L-5 0Z" fill="#ffffff" />

        <path
          d="M1 8L9-6L16 8Z"
          fill="#223640"
          stroke="#050e14"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M1 8L9-6L9 8Z" fill="#8299a6" />
        <path d="M9-6L6-1L9-2L11 0Z" fill="#f8fafc" />

        {/* Towering Central Peak */}
        <path
          d="M-9 10L1-12L11 10Z"
          fill="#1b2d36"
          stroke="#050e14"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M-9 10L1-12L1 10Z" fill="#b0c4cf" />
        {/* Gleaming Snow Cap */}
        <path
          d="M1-12L-4-1L-1-3L1 0L4-3L6-1Z"
          fill="#ffffff"
          stroke="#050e14"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        {/* Crisp Ridge Engraving */}
        <path
          d="M-9 10L1-12L11 10M1-12V10"
          fill="none"
          stroke="#050e14"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M-13 9H14" stroke="#f5e0a6" strokeOpacity=".75" strokeWidth="1.1" strokeLinecap="round" />
      </g>
    );
  }

  if (terrain === 'hills') {
    return (
      <g className="terrain-vector-glyph terrain-hills">
        {/* Back Hill */}
        <path
          d="M-15 6Q-7-8 2 6Z"
          fill="#244a37"
          stroke="#05120d"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M-13 5Q-7-5 -1 5" fill="none" stroke="#86efac" strokeOpacity=".65" strokeWidth="1.1" strokeLinecap="round" />
        {/* Front Right Hill */}
        <path
          d="M-4 8Q6-7 15 8Z"
          fill="#2f6347"
          stroke="#05120d"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        {/* Sunlit Crest Highlight */}
        <path
          d="M-2 7Q6-4 13 7"
          fill="none"
          stroke="#fde68a"
          strokeOpacity=".85"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M-12 9Q0 5 13 9"
          fill="none"
          stroke="#f5e0a6"
          strokeOpacity=".8"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (terrain === 'forest' || terrain === 'jungle') {
    return (
      <g className="terrain-vector-glyph terrain-forest">
        {/* Tree Trunks */}
        <path
          d="M-9 9V3M9 9V3M0 10V2"
          stroke="#784721"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        {/* Left & Right Canopies */}
        <circle
          cx="-9"
          cy="-0.5"
          r="5.2"
          fill={foliageShadow}
          stroke="#05140c"
          strokeWidth="1.5"
        />
        <circle cx="-9.5" cy="-1.2" r="3.8" fill={foliageFill} />
        <circle
          cx="9"
          cy="0"
          r="5"
          fill={foliageShadow}
          stroke="#05140c"
          strokeWidth="1.5"
        />
        <circle cx="8.5" cy="-0.7" r="3.6" fill={foliageFill} />
        {/* Central Tall Canopy */}
        <circle
          cx="0"
          cy="-3.5"
          r="6.2"
          fill={foliageShadow}
          stroke="#05140c"
          strokeWidth="1.7"
        />
        <circle cx="-0.6" cy="-4.3" r="4.7" fill={foliageFill} />
        {/* Sunlit Crown Highlights */}
        <path
          d="M-12.5-1.5Q-9-6-5.5-1.5M-4-4.5Q0-10 4-4.5M5.5-1Q9-5 12-1"
          fill="none"
          stroke={foliageHighlight}
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (terrain === 'coastal') {
    return (
      <g className="terrain-vector-glyph terrain-coastal">
        {/* Coastal Headland Cliff */}
        <path
          d="M-14 2L-6-9L2 2Z"
          fill="#d9c796"
          stroke="#06151f"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M-6-9L2 2H-6Z" fill="#8c7a53" />
        {/* High-Contrast Azure Waves */}
        <path
          d="M-14 4Q-9 0-4 4T6 4T15 4"
          fill="none"
          stroke="#051520"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M-14 4Q-9 0-4 4T6 4T15 4"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M-11 8.5Q-6 4.5-1 8.5T9 8.5"
          fill="none"
          stroke="#bae6fd"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    );
  }

  // Default: Plains / Steppe
  return (
    <g className="terrain-vector-glyph terrain-plains">
      {/* Rolling Steppe Horizon */}
      <path
        d="M-14 4Q-5 0 4 4T14 4"
        fill="none"
        stroke="#06140e"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M-14 4Q-5 0 4 4T14 4"
        fill="none"
        stroke="#a3e635"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M-10 8Q-1 5 9 8"
        fill="none"
        stroke="#fde047"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Golden Grain / Steppe Grass Stalks */}
      <path
        d="M-5 2L-8-6M0 2V-8M5 2L8-6"
        fill="none"
        stroke="#06140e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M-5 2L-8-6M0 2V-8M5 2L8-6"
        fill="none"
        stroke="#facc15"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Standalone inline SVG badge for displaying a province's terrain icon cleanly in HUD drawers/cards.
 */
export function TerrainBadgeIcon({
  terrain,
  season = 'SUMMER',
  size = 18,
}: {
  terrain: Terrain | string;
  season?: Season;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-18 -14 36 28"
      className="terrain-badge-svg"
      aria-hidden="true"
    >
      <ellipse
        cx="0"
        cy="0"
        rx="16.5"
        ry="12"
        fill="#08151d"
        fillOpacity=".85"
        stroke="#d8be7c"
        strokeWidth="1.1"
      />
      <TerrainVectorGlyph terrain={terrain} season={season} />
    </svg>
  );
}

export function CartographicDefs() {
  return (
    <>
      <radialGradient id="chart-frost">
        <stop stopColor="#d4f1ff" stopOpacity=".04" />
        <stop offset="1" stopColor="#b9dcf0" stopOpacity=".38" />
      </radialGradient>
      <linearGradient id="chart-light" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff3c2" stopOpacity=".16" />
        <stop offset=".42" stopColor="#c5b98d" stopOpacity=".02" />
        <stop offset="1" stopColor="#071b20" stopOpacity=".24" />
      </linearGradient>
      <pattern id="fog-of-war-pattern" width="180" height="150" patternUnits="userSpaceOnUse">
        <rect width="180" height="150" fill="#09141e" fillOpacity=".45" />
        <path
          d="M-20 35Q35 2 90 35T200 35M-20 105Q35 72 90 105T200 105"
          fill="none"
          stroke="#82939b"
          strokeOpacity=".16"
          strokeWidth="16"
        />
      </pattern>

      {/* Seamless Cartographic Engraved Mountain Relief Pattern */}
      <pattern
        id="terrain-pattern-mountains"
        width="28"
        height="20"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-5)"
      >
        <path d="M2 16L8 6L14 16ZM14 18L20 7L26 18Z" fill="#0a181e" fillOpacity=".28" />
        <path d="M2 16L8 6L8 16ZM14 18L20 7L20 18Z" fill="#f3ebd2" fillOpacity=".24" />
        <path
          d="M2 16L8 6L14 16M8 6L9.5 11.5M5.5 11L8 9M14 18L20 7L26 18M20 7L21.5 13M17 12.5L20 10"
          fill="none"
          stroke="#07151b"
          strokeOpacity=".52"
          strokeWidth=".85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </pattern>

      {/* Seamless Cartographic Hills Pattern */}
      <pattern
        id="terrain-pattern-hills"
        width="26"
        height="18"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M2 12Q7.5 6 13 12M12 15Q18 9 24 15"
          fill="#142922"
          fillOpacity=".24"
        />
        <path
          d="M2 12Q7.5 6 13 12M12 15Q18 9 24 15"
          fill="none"
          stroke="#0a1c17"
          strokeOpacity=".44"
          strokeWidth=".8"
          strokeLinecap="round"
        />
      </pattern>

      {/* Seamless Cartographic Woodland Pattern — Summer / Default */}
      <pattern
        id="terrain-pattern-forest-SUMMER"
        width="22"
        height="20"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="5.5" cy="6.5" r="3.2" fill="#143d27" fillOpacity=".34" />
        <circle cx="15.5" cy="5.5" r="2.9" fill="#1b4d32" fillOpacity=".32" />
        <circle cx="10.5" cy="14" r="3.4" fill="#123622" fillOpacity=".34" />
        <path
          d="M3.2 7Q5.5 3.5 7.8 7M13.5 6Q15.5 3 17.5 6M8.2 14.5Q10.5 11 12.8 14.5"
          fill="none"
          stroke="#081d12"
          strokeOpacity=".46"
          strokeWidth=".75"
          strokeLinecap="round"
        />
      </pattern>

      {/* Seamless Cartographic Woodland Pattern — Spring */}
      <pattern
        id="terrain-pattern-forest-SPRING"
        width="22"
        height="20"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="5.5" cy="6.5" r="3.2" fill="#1e5e38" fillOpacity=".34" />
        <circle cx="15.5" cy="5.5" r="2.9" fill="#287346" fillOpacity=".32" />
        <circle cx="10.5" cy="14" r="3.4" fill="#1a5231" fillOpacity=".34" />
        <path
          d="M3.2 7Q5.5 3.5 7.8 7M13.5 6Q15.5 3 17.5 6M8.2 14.5Q10.5 11 12.8 14.5"
          fill="none"
          stroke="#0b2617"
          strokeOpacity=".44"
          strokeWidth=".75"
          strokeLinecap="round"
        />
      </pattern>

      {/* Seamless Cartographic Woodland Pattern — Autumn */}
      <pattern
        id="terrain-pattern-forest-AUTUMN"
        width="22"
        height="20"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="5.5" cy="6.5" r="3.2" fill="#8c4f1e" fillOpacity=".34" />
        <circle cx="15.5" cy="5.5" r="2.9" fill="#a86424" fillOpacity=".32" />
        <circle cx="10.5" cy="14" r="3.4" fill="#783f16" fillOpacity=".34" />
        <path
          d="M3.2 7Q5.5 3.5 7.8 7M13.5 6Q15.5 3 17.5 6M8.2 14.5Q10.5 11 12.8 14.5"
          fill="none"
          stroke="#361c08"
          strokeOpacity=".44"
          strokeWidth=".75"
          strokeLinecap="round"
        />
      </pattern>

      {/* Seamless Cartographic Woodland Pattern — Winter */}
      <pattern
        id="terrain-pattern-forest-WINTER"
        width="22"
        height="20"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="5.5" cy="6.5" r="3.2" fill="#b8d4de" fillOpacity=".32" />
        <circle cx="15.5" cy="5.5" r="2.9" fill="#cce3eb" fillOpacity=".3" />
        <circle cx="10.5" cy="14" r="3.4" fill="#a6c5d1" fillOpacity=".32" />
        <path
          d="M3.2 7Q5.5 3.5 7.8 7M13.5 6Q15.5 3 17.5 6M8.2 14.5Q10.5 11 12.8 14.5"
          fill="none"
          stroke="#1d3540"
          strokeOpacity=".42"
          strokeWidth=".75"
          strokeLinecap="round"
        />
      </pattern>

      {/* Subtle Steppe / Plains Topographic Hatching */}
      <pattern id="terrain-pattern-plains" width="28" height="18" patternUnits="userSpaceOnUse">
        <path
          d="M2 6Q8 4.5 14 6M15 13Q21 11.5 27 13"
          fill="none"
          stroke="#152820"
          strokeOpacity=".24"
          strokeWidth=".7"
          strokeLinecap="round"
        />
      </pattern>

      {/* Subtle Coastal Hatching */}
      <pattern id="terrain-pattern-coastal" width="24" height="16" patternUnits="userSpaceOnUse">
        <path
          d="M1 8Q6 5.5 11 8T21 8"
          fill="none"
          stroke="#102c38"
          strokeOpacity=".28"
          strokeWidth=".7"
          strokeLinecap="round"
        />
      </pattern>

      {/* Subtle Urban Citadel Engraving */}
      <pattern id="terrain-pattern-urban" width="16" height="16" patternUnits="userSpaceOnUse">
        <path
          d="M0 8H16M8 0V16"
          fill="none"
          stroke="#e5cf94"
          strokeOpacity=".18"
          strokeWidth=".55"
        />
        <circle
          cx="8"
          cy="8"
          r="2.2"
          fill="none"
          stroke="#182b33"
          strokeOpacity=".3"
          strokeWidth=".6"
        />
      </pattern>
    </>
  );
}

export function ProvinceRelief({ province: p, scale }: { province: Province; scale: number }) {
  if (p.kind !== 'LAND') return null;
  return (
    <g className="province-relief" pointerEvents="none" aria-hidden="true">
      <path
        d={p.path}
        fillRule="evenodd"
        transform={`translate(0 ${2.1 / scale})`}
        fill="#0b1c23"
        stroke="#06131a"
        strokeWidth={1 / scale}
      />
      <path
        d={p.path}
        fill="none"
        fillRule="evenodd"
        stroke="#dfc98a"
        strokeOpacity=".26"
        strokeWidth={2 / scale}
      />
    </g>
  );
}

export function ProvinceShading({
  province: p,
  winter = false,
  season,
  clipPrefix = 'prov-clip',
}: {
  province: Province;
  winter?: boolean;
  season?: Season;
  clipPrefix?: string;
}) {
  const metrics = useMemo(() => computeProvinceContainerMetrics(p), [p.id, p.path]);
  if (p.kind !== 'LAND') return null;

  const mountains = p.terrain === 'mountains';
  const hills = p.terrain === 'hills';
  const forest = ['forest', 'jungle'].includes(p.terrain as string);
  const coastal = p.terrain === 'coastal';
  const seasonKey = season ?? (winter ? 'WINTER' : 'SUMMER');

  const patternUrl = mountains
    ? 'url(#terrain-pattern-mountains)'
    : hills
      ? 'url(#terrain-pattern-hills)'
      : forest
        ? `url(#terrain-pattern-forest-${seasonKey})`
        : coastal
          ? 'url(#terrain-pattern-coastal)'
          : (p.terrain as string) === 'urban'
            ? 'url(#terrain-pattern-urban)'
            : 'url(#terrain-pattern-plains)';

  const clipId = `${clipPrefix}-${p.id}`;

  return (
    <g
      className="province-shading"
      pointerEvents="none"
      aria-hidden="true"
      clipPath={`url(#${clipId})`}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={p.path} clipRule="evenodd" />
        </clipPath>
      </defs>
      <path d={p.path} fillRule="evenodd" fill="url(#chart-light)" />
      <path d={p.path} fillRule="evenodd" fill={patternUrl} data-terrain-art={p.terrain} />

      {/* Dynamically scaled vector terrain emblem with high-contrast cartographic medallion */}
      <g
        className="province-terrain-vector"
        data-terrain-vector={p.terrain}
        transform={`translate(${metrics.anchorX} ${metrics.anchorY}) scale(${metrics.iconScale})`}
      >
        <ellipse
          cx="0"
          cy="0.5"
          rx="16.5"
          ry="11.2"
          fill="#07131b"
          fillOpacity=".66"
          stroke="#e2c882"
          strokeOpacity=".68"
          strokeWidth="1.05"
        />
        <ellipse
          cx="0"
          cy="0.5"
          rx="14.6"
          ry="9.4"
          fill="none"
          stroke="#fff5d1"
          strokeOpacity=".22"
          strokeWidth=".55"
        />
        <TerrainVectorGlyph terrain={p.terrain} season={seasonKey} />
      </g>

      {(mountains || hills) && (
        <path
          d={p.path}
          fill="none"
          fillRule="evenodd"
          stroke="#0d1e24"
          strokeOpacity=".36"
          strokeWidth="1.4"
        />
      )}
      {winter && (p.y < 270 || p.terrain === 'mountains') && (
        <path data-winter-frost={p.id} d={p.path} fillRule="evenodd" fill="url(#chart-frost)" />
      )}
    </g>
  );
}

function densifyPoints(points: number[][]): { x: number; y: number; primary: boolean }[] {
  const result: { x: number; y: number; primary: boolean }[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    result.push({ x, y, primary: true });
    if (i < points.length - 1) {
      const [nx, ny] = points[i + 1];
      result.push({
        x: (x + nx) / 2,
        y: (y + ny) / 2,
        primary: false,
      });
    }
  }
  return result;
}

export function GeographyLayers({ provinces, season }: { provinces: Province[]; season?: Season }) {
  const ids = new Set(provinces.map((p) => p.id));
  const smooth = (points: number[][]) =>
    points
      .map(([x, y], i) =>
        i === 0 ? `M${x},${y}` : `Q${(points[i - 1][0] + x) / 2},${points[i - 1][1]} ${x},${y}`,
      )
      .join(' ');
  const polyline = (points: number[][]) =>
    points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

  return (
    <g className="geography-layer" pointerEvents="none" aria-hidden="true">
      {WORLD_RIVERS.filter((r) => r.provinces.some((id) => ids.has(id))).map((river) => {
        const d = smooth(river.points);
        return (
          <g key={river.id} data-world-river={river.id} className="world-river-group">
            {/* Dark Riverbank Casing for High Contrast */}
            <path
              d={d}
              fill="none"
              stroke="#05131c"
              strokeOpacity=".74"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            {/* Outer River Glow */}
            <path
              d={d}
              fill="none"
              stroke="#0284c7"
              strokeOpacity=".55"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {/* Main Water Channel */}
            <path
              d={d}
              fill="none"
              stroke="#38bdf8"
              strokeOpacity=".96"
              strokeWidth="1.55"
              strokeLinecap="round"
            />
            {/* Specular Water Current Highlight */}
            <path
              d={d}
              fill="none"
              stroke="#e0f2fe"
              strokeOpacity=".7"
              strokeWidth=".6"
              strokeDasharray="5 6"
              strokeLinecap="round"
            />
            <title>{`${river.name} · travessia: −${season === 'SPRING' ? 25 : 15}% ataque${season === 'SPRING' ? ' (cheias de primavera)' : ''}`}</title>
          </g>
        );
      })}
      {impassableFeatures
        .filter((f) => f.provinces.some((id) => ids.has(id)))
        .map((feature) => {
          const isBlocked = feature.blocked.length > 0;
          const spinePath = polyline(feature.points);
          const chain = densifyPoints(feature.points);
          const midIdx = Math.floor(chain.length / 2);
          const mid = chain[midIdx] ?? { x: feature.points[0][0], y: feature.points[0][1] };
          const labelText = isBlocked
            ? `⛔ ${feature.name.toUpperCase()} · INTRANSPONÍVEL`
            : `⛰ ${feature.name.toUpperCase()}`;

          return (
            <g
              key={feature.id}
              data-natural-feature={feature.id}
              data-impassable-barrier={isBlocked ? 'true' : 'false'}
              className={`natural-feature-group ${isBlocked ? 'impassable-barrier' : 'mountain-cordillera'}`}
            >
              {/* Continuous Cordillera Shadow & Barrier Spine */}
              <path
                d={spinePath}
                fill="none"
                stroke="#050e14"
                strokeOpacity={isBlocked ? 0.88 : 0.72}
                strokeWidth={isBlocked ? 17 : 12}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {isBlocked && (
                <>
                  {/* High-Contrast Crimson/Amber Blocked Frontier Wall Casing */}
                  <path
                    d={spinePath}
                    fill="none"
                    stroke="#dc2626"
                    strokeOpacity=".78"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={spinePath}
                    fill="none"
                    stroke="#fecaca"
                    strokeOpacity=".92"
                    strokeWidth="2.2"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Dense 3D Relief Cordillera Peaks / Desert Dunes */}
              {chain.map((pt, i) => {
                const sc = pt.primary ? (isBlocked ? 1.18 : 1.02) : isBlocked ? 0.94 : 0.82;
                return (
                  <g key={i} transform={`translate(${pt.x} ${pt.y}) scale(${sc})`}>
                    {feature.kind === 'desert' ? (
                      <>
                        {/* High-Contrast Sand Dune Barrier */}
                        <path
                          d="M-13 5Q-5-7 3 5Q9-4 15 5Z"
                          fill="#9a3412"
                          stroke="#1c0d04"
                          strokeWidth="1.9"
                          strokeLinejoin="round"
                        />
                        <path d="M-13 5Q-5-7-1 5Z" fill="#f59e0b" />
                        <path d="M-1 5Q9-4 7 5Z" fill="#fbbf24" />
                        <path
                          d="M-11 4Q-5-5 1 4M2 4Q8-2 13 4"
                          fill="none"
                          stroke="#fef08a"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                        />
                        <path
                          d="M-10 7.5H12"
                          stroke="#ef4444"
                          strokeWidth="1.3"
                          strokeDasharray="2.5 2.5"
                          strokeLinecap="round"
                        />
                      </>
                    ) : (
                      <>
                        {/* Flanking Sub-Peak */}
                        <path
                          d="M-11 6L-4-6L3 6Z"
                          fill="#243842"
                          stroke="#050d12"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <path d="M-11 6L-4-6L-4 6Z" fill="#8fa5b2" />
                        <path d="M-4-6L-7-1L-4-2L-2 0Z" fill="#ffffff" />

                        {/* Main Cordillera Peak */}
                        <path
                          d="M-6 7L2-10L10 7Z"
                          fill="#192a33"
                          stroke="#050d12"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        <path d="M-6 7L2-10L2 7Z" fill="#b8ccd6" />
                        {/* Gleaming Snow Summit */}
                        <path
                          d="M2-10L-2-2L0-3L2 0L4-3L6-2Z"
                          fill="#ffffff"
                          stroke="#050d12"
                          strokeWidth="0.8"
                          strokeLinejoin="round"
                        />
                        {isBlocked && (
                          <path
                            d="M-9 7.5H9"
                            stroke="#fca5a5"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                        )}
                      </>
                    )}
                    <title>
                      {isBlocked
                        ? `${feature.name} · BARREIRA INTRANSPONÍVEL (passagem militar bloqueada)`
                        : `${feature.name} · Cordilheira Estratégica`}
                    </title>
                  </g>
                );
              })}

              {/* Cartographic Cordillera / Impassable Barrier Plaque */}
              <g
                className="cordillera-banner"
                transform={`translate(${mid.x} ${mid.y + (isBlocked ? 15 : 13)})`}
              >
                <text
                  textAnchor="middle"
                  fontSize={isBlocked ? '6.2' : '5.4'}
                  fontWeight="800"
                  letterSpacing="0.06em"
                  fill={isBlocked ? '#ffe4e6' : '#fef3c7'}
                  stroke="#050d12"
                  strokeWidth="2.8"
                  paintOrder="stroke"
                >
                  {labelText}
                </text>
              </g>
            </g>
          );
        })}
    </g>
  );
}
