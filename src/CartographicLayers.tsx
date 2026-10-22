export { ProvinceStructuresVisual as InfrastructureSymbols } from './MapMiniatures';
import type { Province } from '../shared/types';
export function CartographicDefs() {
  return (
    <>
      <filter
        id="province-relief"
        x="-10%"
        y="-10%"
        width="120%"
        height="120%"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceAlpha" stdDeviation=".55" result="soft" />
        <feSpecularLighting
          in="soft"
          surfaceScale="2"
          specularConstant=".25"
          specularExponent="14"
          lightingColor="#ffe7ac"
          result="light"
        >
          <feDistantLight azimuth="225" elevation="48" />
        </feSpecularLighting>
        <feComposite in="light" in2="SourceAlpha" operator="in" result="inside" />
        <feBlend in="SourceGraphic" in2="inside" mode="screen" />
      </filter>
      <filter id="shoreline-glow" x="-5%" y="-5%" width="110%" height="110%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="2.3" result="wide" />
        <feComposite in="wide" in2="SourceAlpha" operator="out" result="outer" />
        <feFlood floodColor="#72b2ac" floodOpacity=".32" />
        <feComposite in2="outer" operator="in" result="halo" />
        <feMorphology in="SourceAlpha" operator="dilate" radius=".65" result="thin" />
        <feComposite in="thin" in2="SourceAlpha" operator="out" result="edge" />
        <feFlood floodColor="#d7dfb6" floodOpacity=".85" />
        <feComposite in2="edge" operator="in" result="foam" />
        <feMerge>
          <feMergeNode in="halo" />
          <feMergeNode in="foam" />
        </feMerge>
      </filter>
      <radialGradient id="chart-frost">
        <stop stopColor="#d4f1ff" stopOpacity=".04" />
        <stop offset="1" stopColor="#b9dcf0" stopOpacity=".4" />
      </radialGradient>
      <linearGradient id="chart-light" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff3c2" stopOpacity=".18" />
        <stop offset=".42" stopColor="#c5b98d" stopOpacity=".01" />
        <stop offset="1" stopColor="#071b20" stopOpacity=".25" />
      </linearGradient>
      <filter id="fog-clouds">
        <feTurbulence type="fractalNoise" baseFrequency=".025" numOctaves="2" seed="17" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope=".3" />
        </feComponentTransfer>
      </filter>
      <pattern id="fog-of-war-pattern" width="180" height="150" patternUnits="userSpaceOnUse">
        <rect width="180" height="150" fill="#09141e" fillOpacity=".45" />
        <rect width="180" height="150" fill="#82939b" filter="url(#fog-clouds)" opacity=".28" />
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
        transform={`translate(0 ${2.1 / scale})`}
        fill="#0b1c23"
        stroke="#06131a"
        strokeWidth={1 / scale}
      />
      <path d={p.path} fill="none" stroke="#dfc98a" strokeOpacity=".26" strokeWidth={2 / scale} />
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
  const mountains = ['mountains', 'hills'].includes(p.terrain),
    forest = ['forest', 'jungle'].includes(p.terrain as string);
  const seed = [...p.id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return (
    <g className="province-shading" pointerEvents="none" aria-hidden="true">
      <path d={p.path} fill="url(#chart-light)" />
      {winter && (p.y < 270 || p.terrain === 'mountains') && (
        <path data-winter-frost={p.id} d={p.path} fill="url(#chart-frost)" />
      )}
      {(mountains || forest) && (
        <>
          <clipPath id={`terrain-clip-${p.id}`}>
            <path d={p.path} />
          </clipPath>
          <g clipPath={`url(#terrain-clip-${p.id})`} data-terrain-art={p.terrain}>
            <g
              transform={`translate(${p.x - 19} ${p.y - 24}) rotate(${(seed % 25) - 12})`}
              opacity=".68"
            >
              {mountains ? (
                <>
                  <path
                    d="M-15 18Q-6 8 2-9L12 1Q22-24 28-29Q33-12 43 0L56 21Q19 28-15 18Z"
                    fill="#132b2b"
                  />
                  <path
                    d="M-15 18L2-9L6 8L12 1L14 18L28-29L29-5L43 0L48 15"
                    fill="#bdbba1"
                    opacity=".55"
                  />
                  <path d="M17-11L28-29L34-12L29-16L25-12L24-18Z" fill="#ede5ca" opacity=".75" />
                  <path
                    d="M-15 19Q7 12 13 23M27-9L31 13L43 19"
                    fill="none"
                    stroke="#091c22"
                    strokeWidth="1.1"
                  />
                </>
              ) : (
                <>
                  <path d="M-10 17Q15 4 48 21Q22 32-10 17" fill="#102723" opacity=".6" />
                  {[
                    [-2, 9],
                    [13, 2],
                    [29, 10],
                    [18, 17],
                    [40, 16],
                  ].map(([x, y], i) => (
                    <g key={i} transform={`translate(${x} ${y})`}>
                      <path d="M0 0L1 16" stroke="#2b3020" strokeWidth="2" />
                      <path
                        d="M-9 4Q-13-6-4-9Q-5-19 3-16Q13-16 10-6Q18 3 7 7Q-3 12-9 4"
                        fill={i % 2 ? '#284d37' : '#36553c'}
                        stroke="#162f27"
                        strokeWidth=".8"
                      />
                      <path d="M-8-3Q-4-11 3-10" stroke="#9ea982" fill="none" opacity=".5" />
                    </g>
                  ))}
                </>
              )}
            </g>
          </g>
        </>
      )}
    </g>
  );
}
