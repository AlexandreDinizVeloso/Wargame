import { useEffect, useMemo, useState } from 'react';
import type { GameView } from '../shared/types';
import { SEASONS } from '../shared/strategy';
export default function MapTimeLapse({ game }: { game: GameView }) {
  const frames = useMemo(() => {
    const h = game.history.map((h) => ({
      turn: h.turn,
      control: h.control,
      battles: h.battles,
      events: h.events,
      season: h.world.season,
    }));
    if (!h.length || h.at(-1)!.turn < game.turn)
      h.push({
        turn: game.turn,
        control: game.provinces
          .filter((p) => p.kind === 'LAND')
          .map((p) => ({ provinceId: p.id, ownerId: p.ownerId, occupierId: p.occupierId })),
        battles: [],
        events: ['Posição atual da campanha'],
        season: game.season,
      });
    return h;
  }, [game]);
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [selected, setSelected] = useState('');
  const current = Math.min(index, frames.length - 1),
    frame = frames[current];
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () =>
        setIndex((i) => {
          if (i >= frames.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1000 / speed,
    );
    return () => clearInterval(t);
  }, [playing, speed, frames.length]);
  const lands = game.provinces.filter((p) => p.kind === 'LAND'),
    points = lands.flatMap((p) => p.rings.flat()),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    minX = Math.min(...xs) - 12,
    minY = Math.min(...ys) - 12,
    w = Math.max(...xs) - minX + 12,
    h = Math.max(...ys) - minY + 12;
  return (
    <section className="map-timelapse" aria-label="Time-Lapse do Mapa">
      <div className="timelapse-controls">
        <button
          aria-label={playing ? 'Pausar Time-Lapse' : 'Reproduzir Time-Lapse'}
          onClick={() => {
            if (!playing && current === frames.length - 1) setIndex(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button
          aria-label="Rodada anterior"
          disabled={current === 0}
          onClick={() => {
            setPlaying(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
        >
          ◀
        </button>
        <button
          aria-label="Próxima rodada"
          disabled={current === frames.length - 1}
          onClick={() => {
            setPlaying(false);
            setIndex((i) => Math.min(frames.length - 1, i + 1));
          }}
        >
          ▶
        </button>
        <label>
          Velocidade
          <select
            aria-label="Velocidade do Time-Lapse"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[1, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        <strong>
          Rodada {frame.turn} · {SEASONS[frame.season].icon} {SEASONS[frame.season].name}
        </strong>
      </div>
      <input
        aria-label="Rodada do Time-Lapse"
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={current}
        onChange={(e) => {
          setPlaying(false);
          setIndex(Number(e.target.value));
        }}
      />
      <div className="timelapse-layout">
        <svg
          role="img"
          aria-label={`História do mapa · rodada ${frame.turn}`}
          viewBox={`${minX} ${minY} ${w} ${h}`}
        >
          <defs>
            <pattern id="history-occupation" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0 0L5 5" stroke="#f6dfa0" strokeWidth="1" />
            </pattern>
          </defs>
          {lands.map((p) => {
            const c = frame.control.find((c) => c.provinceId === p.id),
              owner = game.players.find((a) => a.id === (c?.occupierId ?? c?.ownerId));
            return (
              <g key={p.id}>
                <path
                  data-history-province={p.id}
                  d={p.path}
                  fill={owner?.color ?? '#3c5a59'}
                  stroke="#bdd0bf"
                  strokeWidth=".5"
                  role="button"
                  tabIndex={0}
                  aria-label={p.name}
                  onClick={() => setSelected(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelected(p.id);
                  }}
                >
                  <title>
                    {p.name} · {owner?.nation ?? 'Independente'}
                  </title>
                </path>
                {c?.occupierId && (
                  <path d={p.path} fill="url(#history-occupation)" pointerEvents="none" />
                )}
                {frame.battles.some((b) => b.provinceId === p.id) && (
                  <text x={p.x} y={p.y} fontSize="16" textAnchor="middle" pointerEvents="none">
                    ⚔️
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <aside aria-live="polite">
          <h3>Rodada {frame.turn}</h3>
          {selected && (
            <p>
              {lands.find((p) => p.id === selected)?.name} ·{' '}
              {game.players.find(
                (a) =>
                  a.id ===
                  (frame.control.find((c) => c.provinceId === selected)?.occupierId ??
                    frame.control.find((c) => c.provinceId === selected)?.ownerId),
              )?.nation ?? 'Independente'}
            </p>
          )}
          {frame.events.length ? (
            frame.events.map((event, i) => <p key={i}>{event}</p>)
          ) : (
            <p>Nenhum evento registrado nesta rodada.</p>
          )}
        </aside>
      </div>
      <p className="fine-print">
        Fronteiras registradas ao fim de cada rodada. Saves antigos sem histórico não inventam
        posições passadas.
      </p>
    </section>
  );
}
