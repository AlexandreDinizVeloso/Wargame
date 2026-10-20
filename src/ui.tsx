import { Crown, Handshake, Landmark, Sun, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GameCommand, Objective } from '../shared/types';
export type Command = (command: GameCommand) => void;
export const number = (value: number, digits = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value);
export const objectives: Record<Objective, LucideIcon> = {
  conquest: Swords,
  prosperity: Landmark,
  concord: Handshake,
  faith: Sun,
};
export function ObjectiveIcon({ objective, size = 16 }: { objective: Objective; size?: number }) {
  const Icon = objectives[objective];
  return <Icon size={size} />;
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
