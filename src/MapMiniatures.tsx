import { useId } from 'react';
import type { Battalion, Commander, Province } from '../shared/types';
import { unitCount } from '../shared/rules';
export function MiniatureDefs() {
  return (
    <>
      <linearGradient id="miniature-gold" x2=".8" y2="1">
        <stop stopColor="#fff1bd" />
        <stop offset=".35" stopColor="#d4af37" />
        <stop offset="1" stopColor="#785c18" />
      </linearGradient>
      <linearGradient id="miniature-stone" x2=".8" y2="1">
        <stop stopColor="#e2ddd0" />
        <stop offset=".45" stopColor="#8d9b9c" />
        <stop offset="1" stopColor="#354956" />
      </linearGradient>
      <linearGradient id="miniature-wood" x2="0" y2="1">
        <stop stopColor="#a87643" />
        <stop offset=".3" stopColor="#5c3a21" />
        <stop offset="1" stopColor="#3d2616" />
      </linearGradient>
      <radialGradient id="miniature-ocean">
        <stop stopColor="#346774" />
        <stop offset="1" stopColor="#0c2637" />
      </radialGradient>
      <radialGradient id="miniature-fire">
        <stop stopColor="#fff5b6" />
        <stop offset=".5" stopColor="#f59e0b" />
        <stop offset="1" stopColor="#dc4825" />
      </radialGradient>
      <filter id="miniature-drop-shadow" x="-70%" y="-60%" width="240%" height="240%">
        <feDropShadow dx="1" dy="3" stdDeviation="1.7" floodColor="#02131c" floodOpacity=".7" />
      </filter>
    </>
  );
}
function NationGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop stopColor={color} />
      <stop offset=".5" stopColor={color} stopOpacity=".85" />
      <stop offset="1" stopColor="#102433" />
    </linearGradient>
  );
}
function Crown({ stars }: { stars: number }) {
  return (
    <g className="miniature-crown" fill="url(#miniature-gold)" stroke="#533f1b" strokeWidth=".55">
      <path d="M-13-23L-15-32L-7-28L0-36L7-28L15-32L13-23Z" />
      <path d="M-12-21H12" stroke="#f5d887" strokeWidth="2" />
      {Array.from({ length: stars }, (_, i) => (
        <path
          key={i}
          transform={`translate(${(i - (stars - 1) / 2) * 7} -27) scale(.65)`}
          d="M0-4L1-1L4-1L2 1L3 4L0 2L-3 4L-2 1L-4-1L-1-1Z"
          fill="#fff6c6"
        />
      ))}
    </g>
  );
}
function InfantryEmblem() {
  return (
    <g stroke="#192b30" strokeLinejoin="round" strokeWidth=".8">
      <path d="M-13 12L11-13M13 12L-11-13" stroke="#f5e0a2" strokeWidth="2.3" />
      <path
        d="M6-9L9-17L15-16L12-11L16-7L8-6ZM-6-9L-9-17L-15-16L-12-11L-16-7L-8-6Z"
        fill="url(#miniature-stone)"
      />
      <path d="M-8 3V-5Q-8-14 0-15Q8-14 8-5V3L3 8H-3Z" fill="url(#miniature-stone)" />
      <path d="M0-15V7M-7-4H7M-6-1L-2 0M2 0L6-1M-5 3H5" stroke="#18313b" />
      <path d="M-2-14Q-7-19 1-22Q6-18 3-14" fill="#dfc47b" />
      <path d="M-6 9Q0 5 6 9L9 13H-9Z" fill="#cec5ac" />
    </g>
  );
}
function CavalryEmblem() {
  return (
    <g stroke="#172c34" strokeWidth=".9" strokeLinejoin="round">
      <path d="M10 12V-21" stroke="#e2ce8c" strokeWidth="1.4" />
      <path d="M11-20Q19-22 18-17L11-15Z" fill="#f3d59a" />
      <path
        d="M-10 13L-7 4L-9-3L-4-7L-2-15L2-18L4-14L9-12L8-8L4-8L2-3L4 1L1 5L-2 5L-1 12L-4 14L-6 6L-8 14ZM-8-2L-13-6L-15-2L-12 2L-11 9L-14 11L-16 1L-19-2L-16-9L-11-9L-7-6Z"
        fill="#e4ddbd"
      />
      <path d="M0-16L-5-12L-7-5M3-8L5-3L2 0M-7 2L-2 4" fill="none" stroke="#7a6041" />
      <circle cx="4" cy="-12" r=".8" fill="#162b30" />
      <path d="M-5-4L-1-2L-3 2L-8 0Z" fill="url(#miniature-gold)" />
    </g>
  );
}
function ArtilleryEmblem() {
  return (
    <g strokeLinejoin="round" stroke="#172b33" strokeWidth=".8">
      <path d="M-13 9L-9 1L12 7L16 12L8 12L-3 7Z" fill="url(#miniature-wood)" />
      <path d="M-11-2L14-9L17-4L-9 4Z" fill="url(#miniature-stone)" />
      <ellipse cx="15.5" cy="-6.5" rx="2" ry="3" fill="#1a2830" transform="rotate(-14 15 -6)" />
      <circle cx="-4" cy="8" r="7" fill="#78502e" stroke="#e4c781" strokeWidth="1.4" />
      <circle cx="-4" cy="8" r="2" fill="#d6bd7c" />
      {[0, 45, 90, 135].map((a) => (
        <path
          key={a}
          d="M-10 8H2"
          transform={`rotate(${a} -4 8)`}
          stroke="#d6bd7c"
          strokeWidth="1"
        />
      ))}
      <path
        d="M17-11Q25-14 20-20Q14-22 18-25M19-9Q29-10 27-17"
        fill="none"
        stroke="#e4ddc3"
        strokeWidth="1.8"
        opacity=".65"
      />
    </g>
  );
}
export function ArmyCrestToken({
  army: a,
  color,
  commander,
  selected = false,
}: {
  army: Battalion;
  color: string;
  commander?: Commander;
  selected?: boolean;
}) {
  const id = `crest-${useId().replace(/:/g, '')}`;
  const artillery = a.artillery > 0 && a.artillery * 3 >= Math.max(a.infantry, a.cavalry),
    kind = artillery ? 'artillery' : a.cavalry > a.infantry ? 'cavalry' : 'infantry';
  return (
    <g
      data-miniature="army"
      data-composition={kind}
      className={`crest-miniature ${a.morale < 25 || a.disorganized ? 'low-morale' : ''}`}
      color={color}
    >
      <defs>
        <NationGradient id={id} color={color} />
      </defs>
      <ellipse cx="1" cy="26" rx="21" ry="5" fill="#041522" opacity=".3" />
      {selected && (
        <ellipse
          rx="29"
          ry="35"
          fill="none"
          stroke="#fff1b4"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      )}
      <path
        d="M0-22L18-16V4C18 16 0 24 0 26C0 24-18 16-18 4V-16Z"
        fill={`url(#${id})`}
        stroke="#785c18"
        strokeWidth="3.5"
        filter="url(#miniature-drop-shadow)"
      />
      <path
        d="M0-20L16-14V4Q16 14 0 23Q-16 14-16 4V-14Z"
        fill="none"
        stroke="#d4af37"
        strokeWidth="1.1"
      />
      <path d="M-14-13L0-18V16Q-14 9-14 3Z" fill="#fff6cb" opacity=".12" />
      {kind === 'artillery' ? (
        <ArtilleryEmblem />
      ) : kind === 'cavalry' ? (
        <CavalryEmblem />
      ) : (
        <InfantryEmblem />
      )}
      {commander && <Crown stars={commander.stars} />}
      {a.entrenched && (
        <g fill="url(#miniature-stone)" stroke="#283d47" strokeWidth=".7">
          <path d="M-25 14V-2H-22V2H-19V-2H-16V14ZM16 14V-2H19V2H22V-2H25V14Z" />
          <path d="M-24 8H-17M17 8H24" />
        </g>
      )}
      <path
        d="M-23 15L-28 12V23L-21 21M23 15L28 12V23L21 21"
        fill="#785c18"
        stroke="#d4af37"
        strokeWidth=".6"
      />
      <path
        d="M-22 14Q0 20 22 14V24Q0 29-22 24Z"
        fill="#102330"
        stroke="#d4af37"
        strokeWidth=".8"
      />
      <text
        y="23"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#fff5d0"
        className="miniature-count"
      >
        {unitCount(a)}
      </text>
      <path d="M-15 28Q0 35 15 28" fill="none" stroke="#142d35" strokeWidth="3.2" />
      <path
        className="miniature-morale"
        d="M-15 28Q0 35 15 28"
        pathLength="100"
        strokeDasharray={`${a.morale} 100`}
        fill="none"
        stroke={a.morale < 25 ? '#ef4444' : a.morale < 50 ? '#f59e0b' : '#22c55e'}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {[a.infantry, a.cavalry, a.artillery].map(
        (n, i) =>
          n > 0 && (
            <circle
              key={i}
              cx={(i - 1) * 5}
              cy="11"
              r="1.5"
              fill={['#f4e8be', '#dab56c', '#bcc7ce'][i]}
            />
          ),
      )}
      {(a.encircled || a.stranded) && (
        <g className="miniature-alert" transform="translate(23 -19)">
          <path d="M0-7L7 6H-7Z" fill="#d95035" stroke="#ffe1a0" />
          <text textAnchor="middle" y="4" fontSize="10" fill="white">
            !
          </text>
        </g>
      )}
    </g>
  );
}
export function FleetShipToken({
  army: a,
  color,
  commander,
  selected = false,
}: {
  army: Battalion;
  color: string;
  commander?: Commander;
  selected?: boolean;
}) {
  const id = `sails-${useId().replace(/:/g, '')}`;
  return (
    <g data-miniature="fleet" className={`ship-miniature ${a.morale < 25 ? 'low-morale' : ''}`}>
      <defs>
        <NationGradient id={id} color={color} />
      </defs>
      {selected && (
        <ellipse cy="3" rx="34" ry="32" fill="none" stroke="#ffdfa0" strokeDasharray="3 3" />
      )}
      <g filter="url(#miniature-drop-shadow)">
        <path
          d="M-28 8Q-18 28 17 21L29 9L18 11L-25 6Z"
          fill="url(#miniature-wood)"
          stroke="#c4a05d"
          strokeWidth=".8"
        />
        <path
          d="M-22 13Q0 23 22 14M-18 17Q0 24 16 19"
          fill="none"
          stroke="#c38b4c"
          strokeWidth=".8"
        />
        <path
          d="M-24 7L-25 0L-18 1V9M18 11V3H24L23 10"
          fill="#69452a"
          stroke="#cbad72"
          strokeWidth=".8"
        />
        <path d="M-14 8V-23M2 11V-32M18 11V-20" stroke="#e0bb7b" strokeWidth="1.4" />
        <path
          d="M-13-21Q-25-11-14 4L-2 2Q-5-13-3-21ZM3-29Q-9-16 3 6L17 3Q12-16 17-29ZM19-18Q10-7 19 7L29 5Q25-6 29-18Z"
          fill={`url(#${id})`}
          stroke="#e8d1a0"
          strokeWidth=".65"
        />
        <path
          d="M-10-19Q-17-9-10 2M7-27Q-1-12 7 4M22-16Q17-6 23 5"
          fill="none"
          stroke="#fff2c7"
          strokeOpacity=".3"
          strokeWidth="1.2"
        />
        <path d="M2-32Q15-38 16-30Q11-33 3-28Z" fill={color} stroke="#ebd593" strokeWidth=".7" />
        <path
          d="M-27 2L-14-23L2-32L23 7"
          fill="none"
          stroke="#d2bd8a"
          strokeOpacity=".65"
          strokeWidth=".6"
        />
        {[-16, -8, 0, 8, 16].map((x) => (
          <circle key={x} cx={x} cy="15" r="1.3" fill="#172a31" stroke="#c19c5b" strokeWidth=".4" />
        ))}
      </g>
      <path
        className="ship-wake"
        d="M-34 22Q-25 17-16 23T3 24T23 23T36 22M-28 27Q-19 23-10 28T12 28T30 26"
        fill="none"
        stroke="#badde0"
        strokeOpacity=".85"
        strokeWidth="1.6"
      />
      <ellipse
        cx="0"
        cy="25"
        rx="20"
        ry="9"
        fill="#5f4728"
        stroke="url(#miniature-gold)"
        strokeWidth="1.3"
      />
      <text
        y="28"
        textAnchor="middle"
        fill="#fff1c6"
        fontSize="10"
        fontWeight="700"
        className="miniature-count"
      >
        {a.warships} / {a.transports}
      </text>
      <path d="M-15 35Q0 39 15 35" fill="none" stroke="#143743" strokeWidth="3" />
      <path
        d="M-15 35Q0 39 15 35"
        pathLength="100"
        fill="none"
        stroke={a.morale < 25 ? '#ef4444' : a.morale < 50 ? '#f59e0b' : '#22c55e'}
        strokeWidth="2"
        strokeDasharray={`${a.morale} 100`}
      />
      {commander && (
        <g transform="translate(-21 0) scale(.65)">
          <Crown stars={commander.stars} />
        </g>
      )}
      {a.embarkedArmyId && (
        <path
          d="M24-7L32-4V4Q32 10 24 13Q16 10 16 4V-4Z"
          fill={color}
          stroke="#f1d48b"
          strokeWidth="1.3"
        />
      )}
      {a.embarkedArmyId && (
        <path d="M20 3L23 6L29-1" fill="none" stroke="#fff1b8" strokeWidth="1.8" />
      )}
    </g>
  );
}
export function SeaZoneCompassNode({
  value,
  color,
  contested = false,
  selected = false,
}: {
  value: number;
  color?: string;
  contested?: boolean;
  selected?: boolean;
}) {
  return (
    <g data-miniature="compass" className={contested ? 'compass-node contested' : 'compass-node'}>
      <circle
        r="27"
        fill="url(#miniature-ocean)"
        fillOpacity=".85"
        stroke={color ?? '#ac9c6d'}
        strokeWidth={selected ? 2.4 : 1.4}
      />
      <circle r="23" fill="none" stroke="#d4bc80" strokeWidth=".6" opacity=".7" />
      {Array.from({ length: 24 }, (_, i) => (
        <path
          key={i}
          d={i % 3 === 0 ? 'M0-21V-26' : 'M0-24V-26'}
          transform={`rotate(${i * 15})`}
          stroke="#d7c28a"
          strokeWidth=".7"
        />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d="M0-22L4-4L0 0L-3-4Z"
          transform={`rotate(${i * 45})`}
          fill={i % 2 ? '#8b9da0' : 'url(#miniature-gold)'}
          stroke="#102d3a"
          strokeWidth=".6"
        />
      ))}
      <circle r="10" fill="#102e3d" stroke="#c2aa72" strokeWidth=".8" />
      <path
        d="M0-5V7M-6 2Q-6 9 0 7Q6 9 6 2M-4-1H4M-7 3L-6 0L-3 2M7 3L6 0L3 2"
        fill="none"
        stroke="#e6d3a1"
        strokeWidth="1.2"
      />
      <circle cy="-6" r="1.5" fill="none" stroke="#e6d3a1" />
      <path
        d="M-26 20Q0 31 26 20L24 30Q0 39-24 30Z"
        fill="#12313e"
        stroke={color ?? '#bfa568'}
        strokeWidth=".8"
      />
      <text y="30" textAnchor="middle" fill="#f0d79b" fontSize="9" className="miniature-count">
        {contested ? 'Disputa' : `+${value} ouro`}
      </text>
    </g>
  );
}
function Structure({ kind, level }: { kind: string; level: number }) {
  return (
    <g data-structure={kind} stroke="#243b43" strokeWidth=".65" strokeLinejoin="round">
      {kind === 'FORT' && (
        <>
          <path d="M-10 9V-7H-7V-11H-4V-7H4V-11H7V-7H10V9ZM-12 9H12" fill="url(#miniature-stone)" />
          <path d="M-8-2H8M-8 3H8M-3-5V1M4 0V6" fill="none" stroke="#62747b" />
          <path d="M-3 9V4Q0 0 3 4V9" fill="#152c38" />
          {Array.from({ length: level }, (_, i) => (
            <path
              key={i}
              transform={`translate(${(i - (level - 1) / 2) * 5} -4) scale(.48)`}
              d="M-4-3H4V2L0 6L-4 2Z"
              fill="#d4af37"
            />
          ))}
        </>
      )}
      {kind === 'BARRACKS' && (
        <>
          <path d="M-12 9L0-10L12 9ZM0-9L-4 9H5Z" fill="#c7b98d" />
          <path d="M0-9V-17M0-17L10-15L0-12" fill="#ad4d41" stroke="#ddc58b" />
          <path d="M-5 9L0 1L5 9" fill="#19323b" />
          <path d="M-12 8H12" stroke="#a8814c" strokeWidth="2" />
        </>
      )}
      {kind === 'MARKET' && (
        <>
          <path d="M-12 0L-9-7H9L12 0Z" fill="#c2a76a" />
          <path d="M-10 0V10H10V0M-10 6H10" fill="#775237" />
          <path
            d="M0-10V4M-8-6H8M-6-6L-10 0H-2ZM6-6L2 0H10Z"
            fill="url(#miniature-gold)"
            stroke="#e5cb83"
            strokeWidth=".6"
          />
        </>
      )}
      {kind === 'PORT' && (
        <>
          <path d="M-13 9H13M-9 5V13M0 5V13M9 5V13" stroke="#9e7546" strokeWidth="2.2" />
          <path d="M-10 4L-8-12H-3L-1 4Z" fill="url(#miniature-stone)" />
          <path d="M-10-12L-6-17L-2-12Z" fill="#b96743" />
          <path d="M-8-8H-3" stroke="#ffe4a3" strokeWidth="2" />
          <path
            d="M7-6V3M3 0Q3 6 7 3Q11 6 11 0M4-3H10"
            fill="none"
            stroke="#d6bd7f"
            strokeWidth="1.2"
          />
        </>
      )}
      {kind === 'FOUNDRY' && (
        <>
          <path d="M-11 9V-3L-2-7L6-3V-13H11V9Z" fill="#697c82" />
          <path d="M-8 5L-4 1H5L10-1L7 5H2V9H-4V5Z" fill="#263b46" stroke="#bdc7bd" />
          <path d="M-5-1Q-9-5-4-8Q-1-5-1-3Q2-9 4-6L3-1Z" fill="url(#miniature-fire)" />
        </>
      )}
      {kind === 'TEMPLE' && (
        <>
          <path d="M-10 9V-3H10V9Z" fill="#d0c5a5" />
          <path d="M-11-3Q-10-13 0-13Q10-13 11-3Z" fill="url(#miniature-gold)" />
          <path d="M0-13V-20M-3-17H3" stroke="#e6d79c" strokeWidth="1.3" />
          <path d="M-3 9V3Q0-1 3 3V9M-7 0V3M7 0V3" fill="#294454" />
        </>
      )}
      <text
        x="10"
        y="14"
        fontSize="7"
        textAnchor="middle"
        fill="#fff0c2"
        stroke="#153140"
        strokeWidth="1.6"
        paintOrder="stroke"
      >
        {level}
      </text>
    </g>
  );
}
export function ProvinceStructuresVisual({
  province: p,
  scale,
  expanded,
}: {
  province: Province;
  scale: number;
  expanded: boolean;
}) {
  const buildings = [
    ['FORT', p.fortLevel],
    ['BARRACKS', p.barracksLevel],
    ['MARKET', p.marketLevel],
    ['PORT', p.portLevel],
    ['FOUNDRY', p.foundryLevel],
    ['TEMPLE', p.templeLevel],
  ] as const;
  const active = buildings.filter(([, n]) => n > 0),
    visible = expanded ? active : active.slice(0, 1);
  if (p.kind !== 'LAND' || (!active.length && !p.siege)) return null;
  return (
    <g
      data-infrastructure={p.id}
      className="province-structures"
      pointerEvents="none"
      transform={`translate(${p.x} ${p.y + 33 / scale}) scale(${0.85 / scale})`}
    >
      <title>
        {p.name}: {active.map(([kind, n]) => `${kind} ${n}`).join(', ')}
        {p.siege ? ` · cerco ${p.siege.progress}/${p.siege.required}` : ''}
      </title>
      {visible.map(([kind, level], i) => (
        <g key={kind} transform={`translate(${(i - (visible.length - 1) / 2) * 28} 0)`}>
          <Structure kind={kind} level={level} />
        </g>
      ))}
      {p.siege && (
        <g className="siege-miniature">
          <circle r="22" fill="none" stroke="#563d2e" strokeWidth="3" />
          <circle
            r="22"
            fill="none"
            stroke="#f1b15e"
            strokeWidth="2.6"
            pathLength="100"
            strokeDasharray={`${Math.min(100, (p.siege.progress / p.siege.required) * 100)} 100`}
            transform="rotate(-90)"
          />
          {[-9, 0, 9].map((x, i) => (
            <g key={x} transform={`translate(${x} -8)`}>
              <path
                className="siege-flame"
                style={{ animationDelay: `${i * 0.3}s` }}
                d="M-4 5Q-8-3-2-8Q-3-2 1-4L3-12Q10 0 4 5Z"
                fill="url(#miniature-fire)"
              />
              <path
                className="siege-smoke"
                style={{ animationDelay: `${i * 0.7}s` }}
                d="M0-8Q-7-15 0-19Q7-23 0-28"
                stroke="#b4b7ae"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                opacity=".5"
              />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
