import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Castle, Church, Crown, Mountain, Trees, TriangleAlert, Waves, Wheat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Terrain } from '../shared/map';
import type { GameView, MapMode, Player, PlayerOrder, Province, ReligionId } from '../shared/types';
import { clamp, effectiveTax, supplyLimit } from '../shared/rules';
import { typing } from './ui';

export const MAP_MODES: { id: MapMode; name: string; key: string; description: string }[] = [
  {
    id: 'POLITICAL',
    name: 'Político',
    key: '1',
    description: 'Reinos e fronteiras. Hachura: pacificação abaixo de 50.',
  },
  {
    id: 'RELIGIOUS',
    name: 'Religião',
    key: '2',
    description: 'Crença local. Losango: divergência com a religião estatal.',
  },
  {
    id: 'ECONOMIC_SUPPLY',
    name: 'Economia',
    key: '3',
    description:
      'Verde: maior imposto e folga de suprimento. Vermelho: baixa renda ou exército excessivo.',
  },
  {
    id: 'DIPLOMATIC',
    name: 'Diplomacia',
    key: '4',
    description:
      'Verde: próprio. Azul: aliado. Amarelo: trégua. Laranja: embargo/tributo. Vermelho: guerra.',
  },
  {
    id: 'UNREST',
    name: 'Estabilidade',
    key: '5',
    description: 'Verde: pacificação alta e pouca revolta. Alerta a partir de 70 de revolta.',
  },
];
export const FAITH_COLORS: Record<ReligionId, string> = {
  Catolicismo: '#d7b779',
  Anglicanismo: '#b48fc8',
  Protestantismo: '#75a9d1',
  Ortodoxia: '#a9b97b',
  'Islã sunita': '#63b79f',
};
const TERRAIN_ICONS: Record<Terrain, LucideIcon> = {
  plains: Wheat,
  coastal: Waves,
  forest: Trees,
  hills: Mountain,
  mountains: Mountain,
};
const heat = (value: number) => {
  const t = clamp(value, 0, 1),
    a = t < 0.5 ? [63, 151, 118] : [211, 174, 80],
    b = t < 0.5 ? [211, 174, 80] : [192, 70, 68],
    u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return `rgb(${a.map((n, i) => Math.round(n + (b[i] - n) * u)).join(',')})`;
};
export interface CameraHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  focus: (p: Province) => void;
}
interface Props {
  provinces: Province[];
  players: Pick<Player, 'id' | 'color' | 'nation' | 'faith'>[];
  mode: MapMode;
  referenceId?: string;
  selectedId?: string;
  game?: GameView;
  orders?: PlayerOrder[];
  onSelect?: (p: Province) => void;
  onTactical?: (p: Province) => void;
  preview?: boolean;
}
const DEFAULT_CAMERA = { x: 440, y: 285, zoom: 1 };
const Atlas = forwardRef<CameraHandle, Props>(function Atlas(
  {
    provinces,
    players,
    mode,
    referenceId,
    selectedId,
    game,
    orders = [],
    onSelect,
    onTactical,
    preview = false,
  },
  handle,
) {
  const root = useRef<HTMLDivElement>(null),
    [bounds, setBounds] = useState({ width: 1440, height: 900 }),
    [camera, setCamera] = useState(DEFAULT_CAMERA),
    [grabbing, setGrabbing] = useState(false),
    [spaceHeld, setSpaceHeld] = useState(false);
  const space = useRef(false),
    dragged = useRef(false),
    pan = useRef<{
      x: number;
      y: number;
      camera: typeof camera;
      provinceId: string | null;
      button: number;
      touch: boolean;
    } | null>(null);
  const fit = Math.max(
    0.1,
    Math.min(bounds.width / 1030, Math.max(240, bounds.height - 170) / 610),
  );
  const scale = fit * camera.zoom,
    viewWidth = bounds.width / scale,
    viewHeight = bounds.height / scale;
  const left = camera.x - viewWidth / 2,
    top = camera.y - viewHeight / 2;
  const latest = useRef({ bounds, fit, camera });
  latest.current = { bounds, fit, camera };
  function changeZoom(factor: number, point?: { x: number; y: number }) {
    const { bounds, fit } = latest.current;
    setCamera((old) => {
      const zoom = clamp(old.zoom * factor, 0.8, 3.5),
        px = point?.x ?? bounds.width / 2,
        py = point?.y ?? bounds.height / 2;
      const worldX = old.x + (px - bounds.width / 2) / (fit * old.zoom),
        worldY = old.y + (py - bounds.height / 2) / (fit * old.zoom);
      return {
        x: worldX - (px - bounds.width / 2) / (fit * zoom),
        y: worldY - (py - bounds.height / 2) / (fit * zoom),
        zoom,
      };
    });
  }
  useImperativeHandle(
    handle,
    () => ({
      zoomIn: () => changeZoom(1.2),
      zoomOut: () => changeZoom(1 / 1.2),
      reset: () => setCamera(DEFAULT_CAMERA),
      focus: (p) => setCamera((old) => ({ ...old, x: p.x, y: p.y })),
    }),
    [],
  );
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBounds({ width: r.width, height: r.height });
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (preview) return;
    const down = (e: KeyboardEvent) => {
        if (
          e.code === 'Space' &&
          !typing(e.target) &&
          !(e.target instanceof HTMLElement && e.target.closest('button,.game-modal'))
        ) {
          e.preventDefault();
          space.current = true;
          setSpaceHeld(true);
        }
      },
      up = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          space.current = false;
          setSpaceHeld(false);
        }
      },
      blur = () => {
        space.current = false;
        setSpaceHeld(false);
        setGrabbing(false);
        pan.current = null;
      };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [preview]);
  useEffect(() => {
    const element = root.current;
    if (!element || preview) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = element.getBoundingClientRect();
      changeZoom(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [preview]);
  const relationTo = (owner: string | null) =>
    game?.relations.find(
      (r) => (r.a === referenceId && r.b === owner) || (r.b === referenceId && r.a === owner),
    );
  function color(p: Province) {
    const owner = players.find((x) => x.id === p.ownerId);
    if (mode === 'RELIGIOUS') return FAITH_COLORS[p.religion];
    if (mode === 'UNREST') return heat(Math.max(p.unrest / 100, 1 - p.pacification / 100));
    if (mode === 'ECONOMIC_SUPPLY') {
      const utilization =
        (p.troops +
          (game?.stationedArmies
            .filter((a) => a.provinceId === p.id)
            .reduce((s, a) => s + a.troops, 0) ?? 0)) /
        supplyLimit(p);
      return heat(
        0.6 * (1 - Math.min(1, effectiveTax(p, owner?.faith ?? p.religion) / 7)) +
          0.4 * Math.min(1, utilization / 1.5),
      );
    }
    if (mode === 'DIPLOMATIC') {
      const r = relationTo(p.ownerId);
      return p.ownerId === referenceId
        ? '#55ae87'
        : r?.allied
          ? '#629bd1'
          : r && r.truceUntil >= (game?.turn ?? 1)
            ? '#d5bb62'
            : r && (r.embargoes.length || r.tribute)
              ? '#d69255'
              : r?.atWar
                ? '#d05a59'
                : owner
                  ? '#849aa1'
                  : '#3c5159';
    }
    return owner?.color ?? '#52716e';
  }
  function targetProvince(event: React.PointerEvent) {
    const target = event.target instanceof Element ? event.target.closest('[data-province]') : null;
    return target?.getAttribute('data-province') ?? null;
  }
  return (
    <div
      ref={root}
      className={`map-stage ${preview ? 'preview-map' : ''} ${grabbing ? 'grabbing' : spaceHeld ? 'grab-ready' : ''}`}
      data-zoom={camera.zoom.toFixed(3)}
      data-camera-x={camera.x.toFixed(2)}
      data-camera-y={camera.y.toFixed(2)}
      data-mode={mode}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        dragged.current = false;
        if (preview) return;
        const touch = e.pointerType === 'touch';
        if (e.button === 1 || e.button === 2 || (e.button === 0 && space.current) || touch) {
          if (!touch) e.preventDefault();
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            camera: { ...camera },
            provinceId: targetProvince(e),
            button: e.button,
            touch,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          setGrabbing(true);
        }
      }}
      onPointerMove={(e) => {
        const start = pan.current;
        if (!start) return;
        const dx = e.clientX - start.x,
          dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 4) dragged.current = true;
        if (dragged.current)
          setCamera({
            ...start.camera,
            x: start.camera.x - dx / (fit * start.camera.zoom),
            y: start.camera.y - dy / (fit * start.camera.zoom),
          });
      }}
      onPointerUp={(e) => {
        const start = pan.current;
        if (!start) return;
        pan.current = null;
        setGrabbing(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        if (!dragged.current && start.provinceId) {
          const p = provinces.find((p) => p.id === start.provinceId);
          if (p && start.button === 2) onTactical?.(p);
          else if (p && start.touch) {
            onSelect?.(p);
            dragged.current = true;
          }
        }
      }}
      onPointerCancel={() => {
        pan.current = null;
        setGrabbing(false);
      }}
    >
      <svg
        className="world-map"
        viewBox={`${left} ${top} ${viewWidth} ${viewHeight}`}
        aria-label="Mapa estratégico da Europa, com câmera livre"
        role="group"
      >
        <defs>
          <pattern id="ocean-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0H0V80" fill="none" stroke="#7897a2" strokeWidth=".6" opacity=".11" />
            <path
              d="M35 40q5-3 10 0t10 0"
              fill="none"
              stroke="#7897a2"
              strokeWidth=".5"
              opacity=".15"
            />
          </pattern>
          <pattern id="land-texture" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r=".6" fill="#e0d3ac" opacity=".13" />
          </pattern>
          <pattern
            id="occupation-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <path d="M0 0V8" stroke="#efcd89" strokeWidth="2" opacity=".29" />
          </pattern>
          <filter id="map-shadow" x="-15%" y="-15%" width="130%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity=".4" />
          </filter>
          <marker
            id="march-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10Z" fill="#f3d48b" />
          </marker>
          <marker
            id="retreat-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10Z" fill="#9cb9da" />
          </marker>
        </defs>
        <rect
          x={left - 500}
          y={top - 500}
          width={viewWidth + 1000}
          height={viewHeight + 1000}
          fill="#111e30"
        />
        <rect
          x={left - 500}
          y={top - 500}
          width={viewWidth + 1000}
          height={viewHeight + 1000}
          fill="url(#ocean-grid)"
        />
        <g className="ocean-labels">
          <text x="-70" y="300" transform="rotate(-90 -70 300)">
            OCEANUS ATLANTICUS
          </text>
          <text x="385" y="610">
            MARE MEDITERRANEUM
          </text>
          <text x="160" y="-40">
            EUROPA · ANNO DOMINI MDL
          </text>
        </g>
        <g transform="translate(900 65)" className="compass-rose">
          <path d="M0-35L7 0 0 35-7 0Z" />
          <path d="M-26 0L0-5 26 0 0 5Z" />
          <circle r="19" />
          <text y="-45">N</text>
          <text y="55">S</text>
          <text x="-40" y="4">
            W
          </text>
          <text x="40" y="4">
            E
          </text>
        </g>
        {provinces.map((p) => {
          const owner = players.find((x) => x.id === p.ownerId),
            c = color(p),
            selected = p.id === selectedId,
            divergent = owner && p.religion !== owner.faith,
            TerrainIcon = TERRAIN_ICONS[p.terrain];
          const camps = game?.stationedArmies.filter((a) => a.provinceId === p.id) ?? [];
          const moraleColor = p.morale >= 65 ? '#83c298' : p.morale >= 35 ? '#d9b365' : '#d9766a';
          return (
            <g
              key={p.id}
              data-province={p.id}
              className={`province ${selected ? 'selected' : ''} ${p.unrest >= 70 ? 'unstable' : ''}`}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${p.name}, ${owner?.nation ?? 'forças locais'}, ${p.troops} tropas`}
              onClick={() => {
                if (!dragged.current && !space.current) onSelect?.(p);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSelect?.(p);
                }
              }}
            >
              <title>{`${p.name} · ${owner?.nation ?? 'Forças locais'}\n${p.religion} · ${p.terrain}\n${p.troops} tropas · Moral ${p.morale} · Treinamento ${p.training.toFixed(2)}\nPacificação ${p.pacification} · Revolta ${p.unrest}`}</title>
              <polygon
                points={p.polygon}
                fill={c}
                fillOpacity={mode === 'POLITICAL' ? (owner?.id ? 0.46 : 0.22) : 0.65}
                stroke={selected ? '#f5d797' : (owner?.color ?? '#788a80')}
                strokeOpacity={selected ? 1 : 0.7}
                strokeWidth={selected ? 2.7 : 1.2}
                filter="url(#map-shadow)"
              />
              <polygon className="province-texture" points={p.polygon} fill="url(#land-texture)" />
              {mode === 'POLITICAL' && p.pacification < 50 && (
                <polygon
                  className="province-texture"
                  points={p.polygon}
                  fill="url(#occupation-hatch)"
                />
              )}
              <TerrainIcon
                className="terrain-symbol"
                x={p.x - 39}
                y={p.y - 31}
                width="13"
                height="13"
                strokeWidth="1.3"
              />
              {p.capital && (
                <Crown
                  x={p.x - 7}
                  y={p.y - 31}
                  width="14"
                  height="13"
                  strokeWidth="1.4"
                  color={owner?.color ?? '#c6b780'}
                />
              )}
              {mode === 'RELIGIOUS' && divergent && (
                <path className="faith-divergence" d={`M${p.x + 32} ${p.y - 32}l5 5-5 5-5-5z`} />
              )}
              <text x={p.x} y={p.y - 7} className="province-name">
                {p.name}
              </text>
              <g className="army-piece" transform={`translate(${p.x - 22} ${p.y + 2})`}>
                <rect width="44" height="28" rx="4" />
                <path d="M7 8l3-3 3 3v8H7z" fill={owner?.color ?? '#80958c'} stroke="none" />
                <text x="28" y="18">
                  {p.troops}
                </text>
                <rect className="morale-track" x="4" y="23" width="36" height="2" rx="1" />
                <rect
                  x="4"
                  y="23"
                  width={(36 * p.morale) / 100}
                  height="2"
                  rx="1"
                  fill={moraleColor}
                  stroke="none"
                />
              </g>
              {p.fortLevel > 0 && (
                <g className="fort-piece">
                  <Castle x={p.x + 29} y={p.y + 6} width="13" height="14" />
                  <text x={p.x + 36} y={p.y + 31}>
                    {p.fortLevel}
                  </text>
                </g>
              )}
              {camps.length > 0 && (
                <g className="foreign-army">
                  <circle
                    cx={p.x - 33}
                    cy={p.y + 16}
                    r="8"
                    fill={players.find((x) => x.id === camps[0].ownerId)?.color ?? '#9bb7c6'}
                  />
                  <text x={p.x - 33} y={p.y + 19}>
                    {camps.reduce((n, a) => n + a.troops, 0)}
                  </text>
                </g>
              )}
              {mode === 'ECONOMIC_SUPPLY' && (
                <text className="map-number" x={p.x} y={p.y + 43}>
                  {effectiveTax(p, owner?.faith ?? p.religion).toFixed(1)} ouro · {p.troops}/
                  {supplyLimit(p)}
                </text>
              )}
              {mode === 'UNREST' && (
                <text className="map-number" x={p.x} y={p.y + 43}>
                  P {p.pacification} · R {p.unrest}
                </text>
              )}
              {mode === 'RELIGIOUS' && (
                <text className="map-number" x={p.x} y={p.y + 43}>
                  {p.religion}
                </text>
              )}
              {p.unrest >= 70 && (
                <TriangleAlert
                  className="unrest-alert"
                  x={p.x + 28}
                  y={p.y - 33}
                  width="14"
                  height="14"
                />
              )}
            </g>
          );
        })}
        <g pointerEvents="none">
          {orders
            .filter((o) => o.type === 'MOVE_ATTACK')
            .map((o) => {
              const from = provinces.find((p) => p.id === o.fromProvinceId),
                to = provinces.find((p) => p.id === o.toProvinceId);
              if (!from || !to) return null;
              const dx = to.x - from.x,
                dy = to.y - from.y,
                length = Math.hypot(dx, dy) || 1;
              const midX = (from.x + to.x) / 2 - (dy / length) * 20,
                midY = (from.y + to.y) / 2 + (dx / length) * 20;
              return (
                <g key={o.fromProvinceId}>
                  <path
                    className="planned-route"
                    d={`M${from.x} ${from.y + 9}Q${midX} ${midY} ${to.x} ${to.y + 9}`}
                    markerEnd="url(#march-arrow)"
                  />
                  <text className="route-count" x={midX} y={midY - 4}>
                    {o.troops}
                  </text>
                </g>
              );
            })}
          {game?.lastReport?.retreats
            .filter((r) => r.toProvinceId)
            .map((r, i) => {
              const from = provinces.find((p) => p.id === r.fromProvinceId)!,
                to = provinces.find((p) => p.id === r.toProvinceId)!;
              return (
                <path
                  key={`${r.armyId}-${i}`}
                  className="retreat-route"
                  d={`M${from.x} ${from.y}Q${(from.x + to.x) / 2 + 20} ${(from.y + to.y) / 2} ${to.x} ${to.y}`}
                  markerEnd="url(#retreat-arrow)"
                />
              );
            })}
        </g>
      </svg>
      {!preview && (
        <div className="camera-hint">
          <span>Arraste com botão direito/meio ou Espaço + clique</span>
          <i />
          Scroll para zoom
          <i />
          Clique direito numa vizinha para marchar
        </div>
      )}
    </div>
  );
});
export default Atlas;
