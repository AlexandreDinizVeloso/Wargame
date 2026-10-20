import { Crown } from 'lucide-react';
import type { GameCommand, NationId } from '../shared/types';
import { EMBLEMS, nationOf } from '../shared/rules';
export type Command = (command: GameCommand) => void;
export const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value);
export function CoatOfArms({ nationId, size = 36 }: { nationId: NationId; size?: number }) {
  const n = nationOf(nationId);
  return (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 32 38"
      role="img"
      aria-label={`Brasão de ${n.name}`}
    >
      <path
        d="M2 2H30V22Q30 31 16 36Q2 31 2 22Z"
        fill={n.color}
        fillOpacity=".15"
        stroke={n.color}
      />
      <g
        transform="translate(5 6) scale(.92)"
        fill="none"
        stroke={n.color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={EMBLEMS[n.emblem]} />
      </g>
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-seal">
        <Crown size={25} strokeWidth={1.4} />
      </span>
      <div>
        <strong>CONCÓRDIA</strong>
        <small>ATLAS DE IMPÉRIOS</small>
      </div>
    </div>
  );
}
export function Meter({
  label,
  value,
  tone = 'gold',
  display,
}: {
  label: string;
  value: number;
  tone?: 'gold' | 'green' | 'red';
  display?: string;
}) {
  return (
    <div className={`meter ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{display ?? `${number(value)}%`}</strong>
      </div>
      <div className="meter-track">
        <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}
export function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input,textarea,select,[contenteditable=true]')
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
