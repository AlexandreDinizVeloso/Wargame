import { logisticsPosture } from '../shared/economy';
import { useEffect, useState } from 'react';
import type { Battalion, GameView, Province } from '../shared/types';
import { unitCount } from '../shared/rules';
import { unitStatus, availableConstruction } from '../shared/outliner';
import { typing } from './ui';
export default function OutlinerDock({
  game,
  playerId,
  onArmy,
  onProvince,
}: {
  game: GameView;
  playerId: string;
  onArmy: (a: Battalion) => void;
  onProvince: (p: Province) => void;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('concordia-outliner') !== 'false';
    } catch {
      return true;
    }
  });
  const own = game.battalions.filter((a) => a.ownerId === playerId),
    idle = own.filter((a) => unitStatus(game, a).id === 'IDLE');
  const [last, setLast] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem('concordia-outliner', String(open));
    } catch {}
  }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (
        e.key === 'Tab' &&
        !e.shiftKey &&
        idle.length &&
        !(
          e.target instanceof Element &&
          e.target.closest('button,a,[data-window],[role=dialog],select,input,textarea')
        )
      ) {
        e.preventDefault();
        const next = idle[(idle.findIndex((a) => a.id === last) + 1) % idle.length];
        setLast(next.id);
        onArmy(next);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [idle.map((a) => a.id).join('|'), last, onArmy]);
  const item = (a: Battalion) => {
    const status = unitStatus(game, a);
    return (
      <button
        key={a.id}
        className={`outliner-unit status-${status.id}`}
        data-outliner-unit={a.id}
        onClick={() => onArmy(a)}
      >
        <strong>{a.name}</strong>
        <span>
          {game.provinces.find((p) => p.id === a.provinceId)?.name} ·{' '}
          {a.isFleet
            ? `⚓ ${a.warships} / ⛵ ${a.transports}${a.embarkedArmyId ? ' · carga embarcada' : ''}`
            : `${unitCount(a)} tropas`}
        </span>
        <small>{status.label}</small>
        {!a.isFleet && (
          <small data-logistics-posture={logisticsPosture(game, a).id}>
            {logisticsPosture(game, a).label}
          </small>
        )}
        <meter
          min={0}
          max={a.moraleCap ?? 100}
          value={a.morale}
          aria-label={`Moral de ${a.name}`}
        />
      </button>
    );
  };
  return (
    <aside
      className={`outliner-dock framed-panel ${open ? 'open' : 'closed'}`}
      aria-label="Outliner militar e econômico"
      data-hud-surface
    >
      <button
        className="outliner-toggle"
        aria-label={open ? 'Recolher Outliner' : 'Abrir Outliner'}
        aria-expanded={open}
        title="O · mostrar/ocultar"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▶' : '◀'} <span>Conselho de campo</span>
      </button>
      {open && (
        <div className="outliner-body">
          <h3>⚔️ Batalhões</h3>
          {own.filter((a) => !a.isFleet).map(item)}
          <h3>⚓ Armada</h3>
          {own.filter((a) => a.isFleet).map(item)}
          <h3>🏛️ Construções Disponíveis</h3>
          {availableConstruction(game, playerId).map((p) => (
            <button key={p.id} data-outliner-city={p.id} onClick={() => onProvince(p)}>
              {p.name} · construir / melhorar
            </button>
          ))}
          <small>Tab no mapa: próxima formação sem ordens</small>
        </div>
      )}
    </aside>
  );
}
