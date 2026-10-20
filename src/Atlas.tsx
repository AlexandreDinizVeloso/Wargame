import { useState } from 'react';
import { Compass, Flag, Layers, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { hexPoints } from '../shared/map';
import type { Order, Player, Province } from '../shared/types';

const faithColors: Record<string, string> = {
  Catolicismo: '#d5ac68',
  Anglicanismo: '#c995bc',
  Protestantismo: '#8bb8d4',
  Ortodoxia: '#a6b978',
  'Islã sunita': '#72b7a5',
};
export default function Atlas({
  provinces,
  players,
  selectedId,
  onSelect,
  orders = [],
  moveTargets = [],
  preview = false,
}: {
  provinces: Province[];
  players: Pick<Player, 'id' | 'color' | 'nation'>[];
  selectedId?: string;
  onSelect?: (p: Province) => void;
  orders?: Order[];
  moveTargets?: string[];
  preview?: boolean;
}) {
  const [layer, setLayer] = useState<'political' | 'faith'>('political'),
    [zoom, setZoom] = useState(1);
  const selected = provinces.find((p) => p.id === selectedId);
  const cx = Math.max(440 / zoom, Math.min(880 - 440 / zoom, selected?.x ?? 440)),
    cy = Math.max(290 / zoom, Math.min(580 - 290 / zoom, selected?.y ?? 290));
  return (
    <div className={`atlas ${preview ? 'atlas-preview' : ''}`}>
      {!preview && (
        <div className="map-toolbar">
          <span>
            <Compass size={15} /> TEATRO EUROPEU
          </span>
          <button
            className="quiet tiny"
            onClick={() => setLayer(layer === 'political' ? 'faith' : 'political')}
          >
            <Layers size={14} />
            {layer === 'political' ? 'Mapa político' : 'Crenças'}
          </button>
        </div>
      )}
      <svg
        className="map-svg"
        viewBox={`${cx - 440 / zoom} ${cy - 290 / zoom} ${880 / zoom} ${580 / zoom}`}
        aria-label="Mapa esquemático de 32 regiões da Europa"
        role="group"
      >
        <defs>
          <pattern id="sea-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="#6d9297"
              strokeOpacity=".09"
              strokeWidth=".7"
            />
          </pattern>
          <pattern id="land-grain" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".7" fill="#e3ddbe" fillOpacity=".07" />
          </pattern>
          <filter id="tile-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity=".3" />
          </filter>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#f0d193" />
          </marker>
        </defs>
        <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#sea-grid)" />
        <g className="sea-label">
          <text x="21" y="325" transform="rotate(-90 21 325)">
            OCEANUS ATLANTICUS
          </text>
          <text x="585" y="550">
            MARE MEDITERRANEUM
          </text>
        </g>
        {[80, 210, 340, 470].map((y) => (
          <path
            key={y}
            d={`M0 ${y} Q440 ${y + 40} 880 ${y}`}
            fill="none"
            stroke="#68868b"
            strokeWidth=".6"
            strokeDasharray="2 8"
            opacity=".2"
          />
        ))}
        {provinces.map((p) => {
          const owner = players.find((x) => x.id === p.ownerId),
            color =
              layer === 'faith' ? (faithColors[p.faith] ?? '#829990') : (owner?.color ?? '#62766c');
          const isSelected = p.id === selectedId,
            isTarget = moveTargets.includes(p.id);
          return (
            <g
              key={p.id}
              className={`province ${onSelect ? 'interactive' : ''} ${isSelected ? 'selected' : ''} ${isTarget ? 'target' : ''}`}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${p.name}, ${owner?.nation ?? 'forças locais'}, ${p.troops} tropas${isTarget ? ', destino disponível' : ''}`}
              onClick={() => onSelect?.(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(p);
                }
              }}
            >
              <title>
                {p.name} · {owner?.nation ?? 'Forças locais'} · {p.faith} · {p.troops} tropas ·
                Revolta {p.unrest}%
              </title>
              <polygon
                points={hexPoints(p)}
                fill={color}
                fillOpacity={owner?.id ? '.24' : '.16'}
                stroke={isSelected ? '#f0d193' : isTarget ? '#d7c291' : color}
                strokeOpacity={isSelected || isTarget ? 1 : 0.5}
                strokeWidth={isSelected ? 2.7 : isTarget ? 1.8 : 1}
                filter="url(#tile-shadow)"
              />
              <polygon points={hexPoints(p)} fill="url(#land-grain)" />
              {p.capital && (
                <path
                  d={`M${p.x - 7} ${p.y - 27}l3 3 4-6 4 6 3-3-1 10h-12z`}
                  fill={color}
                  opacity=".9"
                />
              )}
              <text
                x={p.x}
                y={p.y - 3}
                className="province-name"
                fill={owner ? '#e6e5d7' : '#a5b5ab'}
              >
                {p.name}
              </text>
              <rect
                x={p.x - 18}
                y={p.y + 9}
                width="36"
                height="23"
                rx="6"
                fill="#102027"
                stroke={color}
                strokeOpacity=".6"
              />
              <path
                d={`M${p.x - 9} ${p.y + 16}v9m-3-6h6m-6-4l3-3 3 3`}
                stroke={color}
                fill="none"
                strokeWidth="1.2"
              />
              <text x={p.x + 5} y={p.y + 25} className="troop-count">
                {p.troops}
              </text>
              {p.unrest > 25 && (
                <circle
                  cx={p.x + 37}
                  cy={p.y - 22}
                  r="3"
                  fill={p.unrest > 60 ? '#dd8179' : '#dab66e'}
                />
              )}
              {p.development > 0 && (
                <g>
                  {Array.from({ length: p.development }, (_, i) => (
                    <rect
                      key={i}
                      x={p.x - 8 + i * 7}
                      y={p.y + 40}
                      width="4"
                      height="3"
                      rx="1"
                      fill={color}
                    />
                  ))}
                </g>
              )}
              {orders.some((o) => o.provinceId === p.id) && (
                <circle cx={p.x - 38} cy={p.y - 22} r="4" fill="#f0d193" />
              )}
            </g>
          );
        })}
        {orders
          .filter((o) => o.action === 'move')
          .map((o) => {
            const from = provinces.find((p) => p.id === o.provinceId)!,
              to = provinces.find((p) => p.id === o.targetId)!;
            return (
              <path
                key={o.provinceId}
                className="march-route"
                d={`M${from.x} ${from.y + 5}L${to.x} ${to.y + 5}`}
                stroke="#f0d193"
                strokeWidth="2.4"
                strokeDasharray="6 4"
                markerEnd="url(#arrow)"
              />
            );
          })}
        <g transform="translate(840 45)" opacity=".65">
          <path d="M0-21L6 0L0 19L-6 0z" fill="none" stroke="#baa87d" />
          <path d="M-15 0H15M0-15V15" stroke="#baa87d" />
          <text y="-27" textAnchor="middle" fill="#baa87d" fontSize="10">
            N
          </text>
        </g>
      </svg>
      <div className="map-bottom">
        <span>
          <Flag size={12} />
          {preview ? 'EUROPA · C. 1550' : 'Mapa esquemático · vizinhanças de jogo'}
        </span>
        {!preview && (
          <div className="map-zoom">
            <button aria-label="Diminuir zoom" onClick={() => setZoom(Math.max(1, zoom - 0.25))}>
              <ZoomOut size={15} />
            </button>
            <button aria-label="Restaurar mapa" onClick={() => setZoom(1)}>
              <RotateCcw size={13} />
            </button>
            <button aria-label="Aumentar zoom" onClick={() => setZoom(Math.min(1.75, zoom + 0.25))}>
              <ZoomIn size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
