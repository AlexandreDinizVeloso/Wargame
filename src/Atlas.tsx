import WebGLMapBackdrop from './WebGLMapBackdrop';
import { computeVisibleProvinces, verticalRules } from '../shared/fogOfWar';
import {
  MAP_LENSES,
  provinceLensColor,
  provinceIncome,
  provinceLogistics,
} from '../shared/mapLenses';
import { lazy, Suspense } from 'react';
const BattlePreviewTooltip = lazy(() => import('./BattlePreviewTooltip'));
import type { MapPing } from '../shared/types';
import { ArmyCrestToken, FleetShipToken, SeaZoneCompassNode, MiniatureDefs } from './MapMiniatures';
import { seaTradeNodes, SEA_TRADE_VALUE } from '../shared/maritime';
import {
  CartographicDefs,
  ProvinceRelief,
  ProvinceShading,
  InfrastructureSymbols,
} from './CartographicLayers';
import { crossingOptions } from '../shared/naval';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type {
  Battalion,
  GameView,
  MapMode,
  Player,
  PlayerOrder,
  Province,
  ReligionId,
  TurnResolutionReport,
} from '../shared/types';
import {
  atWar,
  canUnitVisit,
  unitPath,
  clamp,
  controller,
  effectiveTax,
  getRelation,
  RELIGIONS,
  supplyLimit,
  unitCount,
} from '../shared/rules';
import { RESOURCES } from '../shared/strategy';
import { typing } from './ui';
export const MAP_MODES = MAP_LENSES;
export const FAITH_COLORS: Record<ReligionId, string> = Object.fromEntries(
  Object.entries(RELIGIONS).map(([id, r]) => [id, r.color]),
) as Record<ReligionId, string>;
export interface CameraHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  focus: (p: Province) => void;
}
interface Props {
  fogEnabled?: boolean;
  onBattle?: (battle: import('../shared/types').BattleReport) => void;
  cartographic?: boolean;
  provinces: Province[];
  players: Player[];
  mode: MapMode;
  referenceId?: string;
  selectedId?: string;
  selectedArmyId?: string;
  game?: GameView;
  orders?: PlayerOrder[];
  onSelect?: (p: Province) => void;
  onSelectArmy?: (a: Battalion) => void;
  onTactical?: (p: Province) => void;
  preview?: boolean;
  viewerId?: string;
  onCancelOrder?: (id: string) => void;
  onDeselect?: () => void;
  replay?: { report: TurnResolutionReport; progress: number; nonce: number } | null;
  pings?: MapPing[];
  onPing?: (p: Province) => void;
}
const heat = (n: number) => `hsl(${145 - clamp(n, 0, 1) * 140} 36% ${38 + clamp(n, 0, 1) * 8}%)`;
const Atlas = forwardRef<CameraHandle, Props>(function Atlas(
  {
    provinces,
    fogEnabled = true,
    onBattle,
    cartographic = false,
    players,
    mode,
    referenceId,
    selectedId,
    selectedArmyId,
    game,
    orders = [],
    onSelect,
    onSelectArmy,
    onTactical,
    preview = false,
    replay,
    viewerId,
    onCancelOrder,
    onDeselect,
    pings = [],
    onPing,
  },
  ref,
) {
  const root = useRef<HTMLDivElement>(null),
    [bounds, setBounds] = useState({ width: 1440, height: 900 }),
    [hoveredId, setHoveredId] = useState(''),
    [pointer, setPointer] = useState({ x: 0, y: 0 }),
    [isTurnReplayPlaying, setIsTurnReplayPlaying] = useState(false);
  useEffect(() => {
    if (!replay) {
      setIsTurnReplayPlaying(false);
      return;
    }
    setIsTurnReplayPlaying(true);
    const timer = setTimeout(
      () => setIsTurnReplayPlaying(false),
      verticalRules(game) ? 6500 : 4000,
    );
    return () => clearTimeout(timer);
  }, [replay?.nonce]);
  const extent = useMemo(() => {
    const points = provinces.filter((p) => p.kind === 'LAND').flatMap((p) => p.rings.flat());
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      width: maxX - minX + 80,
      height: maxY - minY + 80,
    };
  }, [provinces.length, game?.matchConfig.mapId]);
  const [camera, setCamera] = useState({ x: extent.x, y: extent.y, zoom: 1 }),
    [grabbing, setGrabbing] = useState(false);
  const pan = useRef<{
      x: number;
      y: number;
      start: typeof camera;
      provinceId: string | null;
      armyId: string | null;
      button: number;
      touch: boolean;
    } | null>(null),
    space = useRef(false),
    dragged = useRef(false);
  const fit = Math.min(
      bounds.width / extent.width,
      Math.max(200, bounds.height - 150) / extent.height,
    ),
    scale = fit * camera.zoom;
  const latest = useRef({ camera, bounds, fit, extent });
  latest.current = { camera, bounds, fit, extent };
  function changeZoom(factor: number, point?: { x: number; y: number }) {
    const { bounds, fit } = latest.current;
    setCamera((old) => {
      const zoom = clamp(old.zoom * factor, 0.8, 3.5),
        px = point?.x ?? bounds.width / 2,
        py = point?.y ?? bounds.height / 2;
      const wx = old.x + (px - bounds.width / 2) / (fit * old.zoom),
        wy = old.y + (py - bounds.height / 2) / (fit * old.zoom);
      return {
        x: wx - (px - bounds.width / 2) / (fit * zoom),
        y: wy - (py - bounds.height / 2) / (fit * zoom),
        zoom,
      };
    });
  }
  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => changeZoom(1.2),
      zoomOut: () => changeZoom(1 / 1.2),
      reset: () => setCamera({ x: latest.current.extent.x, y: latest.current.extent.y, zoom: 1 }),
      focus: (p) => setCamera((old) => ({ ...old, x: p.x, y: p.y, zoom: Math.max(old.zoom, 1.8) })),
    }),
    [],
  );
  useEffect(() => {
    setCamera({ x: extent.x, y: extent.y, zoom: 1 });
  }, [extent.x, extent.y]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver((entries) =>
      setBounds({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element || preview) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = element.getBoundingClientRect();
      changeZoom(Math.exp(-e.deltaY * 0.0016), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [preview]);
  useEffect(() => {
    if (preview) return;
    const down = (e: KeyboardEvent) => {
        if (
          e.code === 'Space' &&
          !typing(e.target) &&
          !(e.target instanceof Element && e.target.closest('button,[role=dialog]'))
        ) {
          e.preventDefault();
          space.current = true;
        }
      },
      up = (e: KeyboardEvent) => {
        if (e.code === 'Space') space.current = false;
      },
      blur = () => {
        space.current = false;
        pan.current = null;
        setGrabbing(false);
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
  const color = (p: Province) => {
    if (
      game &&
      referenceId &&
      ['POLITICAL', 'ECONOMIC', 'LOGISTICS', 'DIPLOMATIC', 'UNREST'].includes(mode)
    )
      return provinceLensColor(game, p, mode, referenceId, viewerId);
    const owner = players.find((a) => a.id === controller(p));
    if (preview)
      return {
        EUROPE: '#a7af8b',
        AMERICAS: '#619c8d',
        MENA_AFRICA: '#b69b6a',
        ASIA: '#8b91aa',
        SEA_ZONE: '#253d51',
      }[p.continent];
    if (p.kind === 'SEA_ZONE') return '#19394c';
    if (mode === 'RELIGIOUS') return FAITH_COLORS[p.religion];
    if (mode === 'UNREST') return heat(Math.max(p.unrest / 100, 1 - p.pacification / 100));
    if (mode === 'ECONOMIC_SUPPLY' || mode === 'ECONOMIC') {
      const troops =
        game?.battalions
          .filter((a) => a.provinceId === p.id && !a.embarkedOnId)
          .reduce((n, a) => n + unitCount(a), 0) ?? 0;
      return heat(
        0.55 * (1 - Math.min(1, effectiveTax(p, owner?.faith ?? p.religion) / 8)) +
          0.45 * Math.min(1, troops / supplyLimit(p)),
      );
    }
    if (mode === 'DIPLOMATIC' && game && referenceId) {
      const id = controller(p),
        r = id ? getRelation(game, referenceId, id) : null;
      return id === referenceId
        ? '#4b9c76'
        : r?.allied
          ? '#548cbf'
          : r && r.truceUntil >= game.turn
            ? '#c4ab58'
            : r && (r.embargoes.length || r.tribute)
              ? '#bb804b'
              : id && atWar(game, referenceId, id)
                ? '#bd5655'
                : '#546c71';
    }
    return owner?.color ?? '#536c67';
  };
  const tradeNodes = game ? seaTradeNodes(game) : [];
  const visible = game
    ? computeVisibleProvinces(game, viewerId ?? null)
    : new Set(provinces.map((p) => p.id));
  const fogActive =
    !!game &&
    verticalRules(game) &&
    fogEnabled &&
    game.phase !== 'finished' &&
    game.winnerId === null;
  const armies =
    game?.battalions.filter(
      (a) => !a.embarkedOnId && (!fogActive || visible.has(a.provinceId) || a.ownerId === viewerId),
    ) ?? [];
  const routes = armies
    .filter((a) => a.ownerId === (viewerId ?? referenceId) || a.pathQueue.length > 0)
    .map((a) => {
      const order = orders.find(
        (o) =>
          (o.type === 'MOVE_BATTALION' ||
            o.type === 'NAVAL_BRIDGE' ||
            o.type === 'AUTO_TRANSPORT') &&
          o.battalionId === a.id,
      );
      const path =
        order?.type === 'MOVE_BATTALION'
          ? (order.path ??
            (order.targetProvinceId && game
              ? (unitPath(game, a, order.targetProvinceId) ?? [])
              : []))
          : order?.type === 'AUTO_TRANSPORT'
            ? [...(order.seaPath ?? []), order.targetProvinceId]
            : order?.type === 'NAVAL_BRIDGE'
              ? [
                  game!.battalions.find((f) => f.id === order.fleetId)?.provinceId ?? a.provinceId,
                  order.targetProvinceId,
                ]
              : a.pathQueue;
      return { army: a, path };
    })
    .filter((r) => r.path.length);
  const selectedArmy = game?.battalions.find(
    (a) => a.id === selectedArmyId && a.ownerId === viewerId,
  );
  const current = provinces.find((p) => p.id === selectedArmy?.provinceId);
  const highlight = (p: Province) => {
    if (!selectedArmy || !current || !game) return null;
    if (!current.neighbors.includes(p.id))
      return crossingOptions(game, selectedArmy, p, orders, true).length ? 'naval' : null;
    const strait = current.straitSeaIds?.[p.id];
    if (
      strait &&
      game.battalions.some(
        (f) =>
          f.isFleet &&
          f.warships > 0 &&
          f.provinceId === strait &&
          atWar(game, selectedArmy.ownerId, f.ownerId),
      )
    )
      return null;
    if (selectedArmy.embarkedOnId)
      return p.kind === 'LAND' && p.isCoastal && canUnitVisit(game, selectedArmy, p)
        ? 'naval'
        : null;
    if (selectedArmy.isFleet) return canUnitVisit(game, selectedArmy, p) ? 'naval' : null;
    if (p.kind === 'SEA_ZONE')
      return current.portLevel > 0 &&
        armies.some(
          (a) =>
            a.ownerId === viewerId &&
            a.isFleet &&
            a.provinceId === p.id &&
            !a.embarkedArmyId &&
            a.transports * 4 >= unitCount(selectedArmy),
        )
        ? 'naval'
        : null;
    const owner = controller(p);
    if (
      owner &&
      owner !== viewerId &&
      getRelation(game, viewerId!, owner)?.allied &&
      !canUnitVisit(game, selectedArmy, p)
    )
      return null;
    return owner &&
      owner !== viewerId &&
      (atWar(game, viewerId!, owner) || !canUnitVisit(game, selectedArmy, p))
      ? 'attack'
      : owner === null
        ? 'attack'
        : 'friendly';
  };
  const pick = (p: Province, alt = false) => {
    if (alt) {
      onPing?.(p);
      return;
    }
    onDeselect?.();
    onSelect?.(p);
  };
  const pickArmy = (a: Battalion) => {
    onSelectArmy?.(a);
  };
  const pathFor = (ids: string[]) => {
    const points = ids
      .map((id) => provinces.find((p) => p.id === id))
      .filter((p): p is Province => !!p);
    return points
      .map((p, i) => {
        if (i === 0) return `M${p.x},${p.y}`;
        const from = points[i - 1],
          dx = p.x - from.x,
          dy = p.y - from.y;
        return `Q${(p.x + from.x) / 2 - dy * 0.14},${(p.y + from.y) / 2 + dx * 0.14} ${p.x},${p.y}`;
      })
      .join(' ');
  };
  const target = (event: React.PointerEvent) =>
    event.target instanceof Element
      ? (event.target.closest('[data-province]')?.getAttribute('data-province') ?? null)
      : null;
  return (
    <div
      ref={root}
      className={`map-stage ${grabbing ? 'grabbing' : ''} ${preview ? 'preview-map' : ''}`}
      data-mode={mode}
      data-zoom={camera.zoom.toFixed(3)}
      data-camera-x={camera.x.toFixed(2)}
      data-camera-y={camera.y.toFixed(2)}
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
            start: { ...camera },
            provinceId: target(e),
            armyId:
              e.target instanceof Element
                ? (e.target.closest('[data-battalion]')?.getAttribute('data-battalion') ?? null)
                : null,
            button: e.button,
            touch,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          setGrabbing(true);
        }
      }}
      onPointerMove={(e) => {
        if (selectedArmy) setPointer({ x: e.clientX, y: e.clientY });
        const p = pan.current;
        if (!p) return;
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y;
        if (Math.hypot(dx, dy) >= 6) dragged.current = true;
        if (dragged.current)
          setCamera({
            ...p.start,
            x: p.start.x - dx / (fit * p.start.zoom),
            y: p.start.y - dy / (fit * p.start.zoom),
          });
      }}
      onPointerUp={(e) => {
        const p = pan.current;
        if (!p) return;
        pan.current = null;
        setGrabbing(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        if (!dragged.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6 && p.provinceId) {
          const province = provinces.find((q) => q.id === p.provinceId)!;
          if (p.button === 2) onTactical?.(province);
          else if (p.touch) {
            const army = p.armyId ? armies.find((a) => a.id === p.armyId) : undefined;
            if (army) pickArmy(army);
            else pick(province);
            dragged.current = true;
          }
        }
      }}
      onClick={(e) => {
        if (e.target instanceof Element && !e.target.closest('[data-province]') && !dragged.current)
          onDeselect?.();
      }}
      onPointerCancel={() => {
        pan.current = null;
        setGrabbing(false);
      }}
    >
      <WebGLMapBackdrop
        provinces={provinces}
        camera={camera}
        width={bounds.width}
        height={bounds.height}
        scale={scale}
        season={game?.season}
      />
      <svg
        className="world-map"
        viewBox={`${camera.x - bounds.width / scale / 2} ${camera.y - bounds.height / scale / 2} ${bounds.width / scale} ${bounds.height / scale}`}
        role="group"
        aria-label="Mapa-múndi estratégico com províncias orgânicas"
      >
        <defs>
          <MiniatureDefs />
          <CartographicDefs />
          <pattern id="ocean-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0H0V80" fill="none" stroke="#a8c9cb" strokeWidth=".35" opacity=".13" />
          </pattern>
          <pattern
            id="occupation"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <path d="M0 0V5" stroke="#f3d598" strokeWidth="1.5" opacity=".3" />
          </pattern>
          <marker
            id="march-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10Z" fill="#e0c47c" />
          </marker>
        </defs>
        <g
          filter="url(#shoreline-glow)"
          pointerEvents="none"
          aria-hidden="true"
          data-shoreline="double"
        >
          {provinces
            .filter((p) => p.kind === 'LAND')
            .map((p) => (
              <path key={p.id} d={p.path} fill="white" />
            ))}
        </g>
        {!preview &&
          provinces
            .filter((p) => p.kind === 'LAND' && p.portLevel > 0)
            .flatMap((port) =>
              provinces
                .filter((sea) => sea.kind === 'SEA_ZONE' && sea.neighbors.includes(port.id))
                .map((sea) => (
                  <path
                    key={`${port.id}-${sea.id}`}
                    className="sea-current-route"
                    data-sea-route={sea.id}
                    d={`M${port.x} ${port.y} Q${(port.x + sea.x) / 2 + (sea.y - port.y) * 0.15} ${(port.y + sea.y) / 2 - (sea.x - port.x) * 0.15} ${sea.x} ${sea.y}`}
                    stroke={players.find((a) => a.id === controller(port))?.color ?? '#abc7c3'}
                    strokeWidth={0.8 / scale}
                    strokeDasharray={`${3 / scale} ${6 / scale}`}
                    fill="none"
                    pointerEvents="none"
                  />
                )),
            )}
        {[
          ...provinces.filter((p) => p.kind === 'SEA_ZONE'),
          ...provinces.filter((p) => p.kind === 'LAND'),
        ].map((p) => {
          const owner = players.find((a) => a.id === controller(p));
          const selected = p.id === selectedId;
          const destination = highlight(p);
          return (
            <g key={p.id}>
              {cartographic && <ProvinceRelief province={p} scale={scale} />}
              {p.kind === 'SEA_ZONE' && (
                <g
                  className="province-shape sea-compass-target"
                  data-province={p.id}
                  data-kind="SEA_ZONE"
                  tabIndex={preview ? -1 : 0}
                  role="button"
                  aria-label={`${p.name}, zona marítima`}
                  transform={`translate(${p.x} ${p.y}) scale(${0.72 / scale})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.button === 0 && !dragged.current && !preview) pick(p, e.altKey);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pick(p, e.altKey);
                  }}
                >
                  <SeaZoneCompassNode
                    value={
                      tradeNodes.find((n) => n.seaId === p.id)?.value ?? SEA_TRADE_VALUE[p.id] ?? 3
                    }
                    color={
                      players.find(
                        (a) => a.id === tradeNodes.find((n) => n.seaId === p.id)?.ownerId,
                      )?.color
                    }
                    contested={tradeNodes.find((n) => n.seaId === p.id)?.contested}
                    selected={selected}
                  />
                </g>
              )}
              {p.kind === 'LAND' && (
                <path
                  className={`province-shape ${mode === 'LOGISTICS' && game && viewerId && provinceLogistics(game, p, viewerId).danger ? 'logistics-danger' : ''} ${destination ? `destination-${destination}` : ''}`}
                  data-destination={destination ?? undefined}
                  d={p.path}
                  data-province={p.id}
                  data-kind={p.kind}
                  tabIndex={preview ? -1 : 0}
                  role="button"
                  aria-label={`${p.name}, ${owner?.nation ?? 'terra independente'}`}
                  fill={color(p)}
                  fillOpacity={cartographic ? 0.94 : 0.88}
                  filter={cartographic ? 'url(#province-relief)' : undefined}
                  data-fogged={fogActive && !visible.has(p.id) ? 'true' : undefined}
                  stroke={
                    destination === 'attack'
                      ? '#ef4444'
                      : destination === 'naval'
                        ? '#38bdf8'
                        : destination === 'friendly'
                          ? '#22c55e'
                          : selected
                            ? '#f3d291'
                            : '#b6bdab'
                  }
                  strokeOpacity={destination || selected ? 1 : 0.55}
                  strokeWidth={destination ? 3 / scale : selected ? 2 / scale : 0.6 / scale}
                  onPointerEnter={() => {
                    setHoveredId(p.id);
                  }}
                  onPointerLeave={() => {
                    setHoveredId('');
                  }}
                  onFocus={() => {
                    setHoveredId(p.id);
                  }}
                  onBlur={() => {
                    setHoveredId('');
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.button === 0 && !dragged.current && !preview) pick(p, e.altKey);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pick(p, e.altKey);
                  }}
                />
              )}
              {cartographic && <ProvinceShading province={p} winter={game?.season === 'WINTER'} />}
              {!preview && (
                <InfrastructureSymbols
                  province={p}
                  scale={scale}
                  isTurnReplayPlaying={isTurnReplayPlaying && !!replay}
                  expanded={
                    camera.zoom > 1.5 ||
                    selected ||
                    mode === 'ECONOMIC_SUPPLY' ||
                    mode === 'ECONOMIC'
                  }
                />
              )}
              {!preview &&
                p.straitNeighbors
                  .filter((id) => p.id < id)
                  .map((id) => {
                    const to = provinces.find((q) => q.id === id);
                    if (!to) return null;
                    const dx = to.x - p.x;
                    const wrap = Math.abs(dx) > 720 ? (dx > 0 ? -1440 : 1440) : 0;
                    return (
                      <g key={id} className="strait-link" pointerEvents="none">
                        <title>
                          Estreito: {p.name} ↔ {to.name}
                        </title>
                        <path
                          d={`M${p.x},${p.y}L${to.x + wrap},${to.y}${wrap ? `M${p.x - wrap},${p.y}L${to.x},${to.y}` : ''}`}
                          fill="none"
                          stroke="#ebca83"
                          strokeWidth={1.2 / scale}
                          strokeDasharray={`${5 / scale} ${4 / scale}`}
                        />
                      </g>
                    );
                  })}
              {destination === 'naval' &&
                (!cartographic || hoveredId === p.id || selected) &&
                p.kind === 'LAND' &&
                selectedArmy &&
                game &&
                !current?.neighbors.includes(p.id) && (
                  <text
                    className="charter-price"
                    x={p.x}
                    y={p.y + 29 / scale}
                    fontSize={10 / scale}
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    ⛵ {crossingOptions(game, selectedArmy, p, orders, true)[0]?.cost ?? 0} ouro
                  </text>
                )}
              {!preview &&
                p.strategicResource &&
                (!cartographic ||
                  camera.zoom > 2.2 ||
                  hoveredId === p.id ||
                  selected ||
                  mode === 'ECONOMIC_SUPPLY' ||
                  mode === 'ECONOMIC') && (
                  <g
                    className={`resource-badge ${mode === 'ECONOMIC_SUPPLY' || mode === 'ECONOMIC' ? 'emphasized' : ''}`}
                    pointerEvents="none"
                  >
                    <title>
                      {RESOURCES[p.strategicResource].name}: {RESOURCES[p.strategicResource].effect}
                    </title>
                    <circle
                      cx={p.x + 17 / scale}
                      cy={p.y - 22 / scale}
                      r={(mode === 'ECONOMIC_SUPPLY' || mode === 'ECONOMIC' ? 10.8 : 8) / scale}
                      fill="#172933"
                      stroke="#e0c47c"
                      strokeWidth={0.7 / scale}
                    />
                    <text
                      x={p.x + 17 / scale}
                      y={p.y - 18 / scale}
                      textAnchor="middle"
                      fontSize={
                        (mode === 'ECONOMIC_SUPPLY' || mode === 'ECONOMIC' ? 13.5 : 10) / scale
                      }
                    >
                      {RESOURCES[p.strategicResource].icon}
                    </text>
                  </g>
                )}
              {destination && (
                <text
                  className="destination-icon"
                  x={p.x}
                  y={p.y + 18 / scale}
                  textAnchor="middle"
                  fontSize={15 / scale}
                  pointerEvents="none"
                >
                  {destination === 'attack' ? '⚔️' : destination === 'naval' ? '⚓' : '👣'}
                </text>
              )}
              {p.kind === 'LAND' && !preview && (p.pacification < 50 || p.occupierId) && (
                <path d={p.path} fill="url(#occupation)" pointerEvents="none" />
              )}
              {p.kind === 'LAND' &&
                (preview ||
                  camera.zoom > (cartographic ? 2.2 : 1.2) ||
                  (cartographic && (selected || hoveredId === p.id || !!p.capitalOf)) ||
                  provinces.filter((p) => p.kind === 'LAND').length <= 16) && (
                  <text
                    className="province-label"
                    x={p.x}
                    y={p.y - 12 / scale}
                    fontSize={Math.max(4, Math.min(11, 10 / scale))}
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {p.name}
                  </text>
                )}
              {p.kind === 'SEA_ZONE' && (
                <text
                  className="sea-label"
                  x={p.x}
                  y={p.y + 35 / scale}
                  fontSize={9 / scale}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {p.name.toUpperCase()}
                </text>
              )}
              {p.kind === 'LAND' && game && mode === 'ECONOMIC' && (
                <text
                  className="lens-badge"
                  x={p.x}
                  y={p.y + 48 / scale}
                  fontSize={11 / scale}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  +{Math.round(provinceIncome(game, p))} 🪙
                </text>
              )}
              {p.kind === 'LAND' &&
                game &&
                viewerId &&
                mode === 'LOGISTICS' &&
                provinceLogistics(game, p, viewerId).troops > 0 && (
                  <text
                    className="lens-badge"
                    x={p.x}
                    y={p.y + 48 / scale}
                    fontSize={11 / scale}
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {provinceLogistics(game, p, viewerId).troops}/
                    {Math.floor(provinceLogistics(game, p, viewerId).limit)}
                  </text>
                )}
              {p.kind === 'LAND' && mode === 'UNREST' && (
                <text
                  className="lens-badge"
                  x={p.x}
                  y={p.y + 48 / scale}
                  fontSize={11 / scale}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {{ SOLAR: '☀️', REFORMED: '✝️', ANCESTRAL: '🌿', MERCHANT: '⚖️' }[p.religion]}{' '}
                  {RELIGIONS[p.religion].name} · {Math.round(p.pacification)}%
                </text>
              )}
              {mode === 'UNREST' && p.unrest >= 70 && p.kind === 'LAND' && (
                <text
                  className="unrest-warning"
                  x={p.x + 12 / scale}
                  y={p.y - 10 / scale}
                  fontSize={12 / scale}
                  pointerEvents="none"
                >
                  !
                </text>
              )}
              {mode === 'RELIGIOUS' && owner && owner.faith !== p.religion && p.kind === 'LAND' && (
                <text
                  x={p.x}
                  y={p.y + 22 / scale}
                  fill="#fff1c7"
                  fontSize={9 / scale}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  ◇
                </text>
              )}
            </g>
          );
        })}
        {fogActive &&
          provinces
            .filter((p) => !visible.has(p.id))
            .map((p) => (
              <path
                key={`fog-${p.id}`}
                className="fog-province"
                data-fog-province={p.id}
                d={p.path}
                fill="url(#fog-of-war-pattern)"
                pointerEvents="none"
              />
            ))}
        {!replay &&
          game?.lastReport?.battles.map((battle) => {
            const p = provinces.find((p) => p.id === battle.provinceId);
            return p &&
              (!fogActive ||
                visible.has(p.id) ||
                [battle.attackerId, battle.defenderId].includes(viewerId ?? '')) ? (
              <g
                key={battle.id}
                role="button"
                tabIndex={0}
                aria-label={`Rever batalha em ${p.name}`}
                data-battle-marker={battle.id}
                className="historical-battle-marker"
                transform={`translate(${p.x + 22 / scale} ${p.y - 24 / scale}) scale(${1 / scale})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onBattle?.(battle);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onBattle?.(battle);
                }}
              >
                <circle r="11" fill="#1b2024" stroke="#cbb274" />
                <text y="4" textAnchor="middle" fontSize="13">
                  ⚔️
                </text>
              </g>
            ) : null;
          })}
        {routes.map(({ army, path }) => {
          const from = provinces.find((p) => p.id === army.provinceId)!,
            to = provinces.find((p) => p.id === path[0]);
          return (
            <g key={army.id}>
              <path
                className={`planned-route ${army.id === selectedArmyId ? 'selected-route' : ''} ${army.ownerId !== viewerId ? 'intelligence-route' : ''}`}
                d={pathFor([army.provinceId, ...path])}
                fill="none"
                stroke={army.ownerId !== viewerId ? '#c084fc' : '#e0c47c'}
                strokeWidth={1.6 / scale}
                strokeDasharray={`${5 / scale} ${4 / scale}`}
                markerEnd="url(#march-arrow)"
                pointerEvents="none"
              />
              {army.ownerId === viewerId && to && (
                <g
                  role="button"
                  aria-label={`Cancelar movimento de ${army.name}`}
                  tabIndex={0}
                  className="route-cancel"
                  transform={`translate(${(from.x + to.x) / 2},${(from.y + to.y) / 2})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelOrder?.(army.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCancelOrder?.(army.id);
                  }}
                >
                  <circle r={8 / scale} />
                  <text textAnchor="middle" dy={3 / scale} fontSize={11 / scale}>
                    ✕
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {!preview &&
          armies
            .filter(
              (a) =>
                !cartographic ||
                a.ownerId !== 'NEUTRAL' ||
                camera.zoom > 2.2 ||
                a.provinceId === selectedId ||
                a.provinceId === hoveredId,
            )
            .map((a) => {
              const p = provinces.find((p) => p.id === a.provinceId);
              if (!p) return null;
              const local = armies.filter((b) => b.provinceId === p.id),
                index = local.findIndex((b) => b.id === a.id),
                offset = ((index - (local.length - 1) / 2) * 38) / scale;
              const owner = players.find((p) => p.id === a.ownerId),
                selected = a.id === selectedArmyId;
              return (
                <g
                  key={a.id}
                  className={`army-token ${selected ? 'selected' : ''} ${a.stranded ? 'stranded' : ''}`}
                  data-battalion={a.id}
                  data-province={p.id}
                  transform={`translate(${p.x + offset} ${p.y + 3 / scale}) scale(${0.7 / scale})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${a.name}, ${unitCount(a)} ${a.isFleet ? 'navios' : 'tropas'}, ${owner?.nation ?? 'milícia local'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.button === 0 && !dragged.current) {
                      if (e.altKey) onPing?.(p);
                      else pickArmy(a);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pickArmy(a);
                  }}
                >
                  {a.isFleet ? (
                    <FleetShipToken
                      army={a}
                      color={owner?.color ?? '#839d90'}
                      commander={game?.commanders.find((c) => c.assignedBattalionId === a.id)}
                      selected={selected}
                    />
                  ) : (
                    <ArmyCrestToken
                      army={a}
                      color={owner?.color ?? '#839d90'}
                      commander={game?.commanders.find((c) => c.assignedBattalionId === a.id)}
                      selected={selected}
                    />
                  )}
                </g>
              );
            })}
        {isTurnReplayPlaying && replay && (
          <g className="turn-replay" pointerEvents="none">
            {replay.report.movements.map((m, i) => {
              const from = provinces.find((p) => p.id === m.fromProvinceId),
                to = provinces.find((p) => p.id === m.toProvinceId);
              if (!from || !to) return null;
              const t = verticalRules(game)
                  ? Math.max(0, Math.min(1, (replay.progress * 6500 - 1500) / 2000))
                  : Math.min(1, replay.progress / 0.48),
                ease = t * t * (3 - 2 * t);
              return (
                <g
                  key={`${m.battalionId}-${i}`}
                  transform={`translate(${from.x + (to.x - from.x) * ease} ${from.y + (to.y - from.y) * ease}) scale(${1 / scale})`}
                  opacity={
                    verticalRules(game)
                      ? replay.progress * 6500 >= 1500 && replay.progress * 6500 <= 3500
                        ? 1
                        : 0
                      : replay.progress < 0.6
                        ? 1
                        : Math.max(0, 1 - (replay.progress - 0.6) * 5)
                  }
                >
                  <circle r="13" fill="#efcf83" fillOpacity=".3" stroke="#f9dea0" />
                  <text textAnchor="middle" y="4" fontSize="13" fill="#f3dfb5">
                    {m.isFleet ? '⛵' : '⚑'}
                  </text>
                </g>
              );
            })}
            {replay.progress > (verticalRules(game) ? 3500 / 6500 : 0.3) &&
              replay.report.battles.map((b) => {
                const p = provinces.find((p) => p.id === b.provinceId);
                if (!p) return null;
                const opacity = Math.min(1, (1 - replay.progress) * 4);
                return (
                  <g
                    key={b.id}
                    className="battle-burst"
                    transform={`translate(${p.x} ${p.y}) scale(${1 / scale})`}
                    opacity={opacity}
                  >
                    <circle
                      r="24"
                      fill="#d8794b"
                      fillOpacity=".25"
                      stroke="#e9b770"
                      strokeDasharray="3 4"
                    />
                    <text textAnchor="middle" y="5" fontSize="23" fill="#f6d0a0">
                      ⚔
                    </text>
                    <text
                      className="casualty-badge"
                      textAnchor="middle"
                      y={-24 - (replay.progress - 0.3) * 30}
                      fontSize="13"
                      fill="#ffd6bd"
                    >
                      −{b.attackerCasualties + b.defenderCasualties} tropas
                    </text>
                  </g>
                );
              })}
          </g>
        )}
        {pings.map((ping) => {
          const p = provinces.find((q) => q.id === ping.provinceId);
          return p ? (
            <g
              key={ping.id}
              className="map-ping"
              data-map-ping={ping.id}
              transform={`translate(${p.x} ${p.y}) scale(${1 / scale})`}
              pointerEvents="none"
            >
              <circle className="ping-wave" r="12" />
              <circle className="ping-wave delayed" r="12" />
              <circle r="5" fill="#f8dc81" />
              <text y="-30" textAnchor="middle" fontSize="12" fill="#ffe9a1">
                📍 {players.find((q) => q.id === ping.playerId)?.name}: {ping.note}
              </text>
            </g>
          ) : null;
        })}
      </svg>
      {!preview && game && selectedArmy && hoveredId && !grabbing && (
        <Suspense fallback={null}>
          <BattlePreviewTooltip
            game={game}
            army={selectedArmy}
            province={provinces.find((p) => p.id === hoveredId)!}
            x={pointer.x}
            y={pointer.y}
          />
        </Suspense>
      )}
      {!preview && (
        <div className="map-attribution">
          Natural Earth · domínio público · fronteiras de jogo simplificadas
        </div>
      )}
    </div>
  );
});
export default Atlas;
