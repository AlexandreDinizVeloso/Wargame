import { integerValue } from '../shared/economy';
import { Crown } from 'lucide-react';
import type { GameCommand, NationId } from '../shared/types';
import { EMBLEMS, nationOf } from '../shared/rules';
export type Command = (command: GameCommand) => void;
export const number = (value: number, _digits = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(integerValue(value));
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

export type WaxSealPosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left' | 'none';
export type OrnatePanelVariant =
  | 'default'
  | 'topbar'
  | 'window'
  | 'lens'
  | 'outliner'
  | 'decree'
  | 'quickbar'
  | 'footer'
  | 'compact'
  | 'parchment';

export function WaxSealEmblem({
  className = '',
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={`wax-seal-emblem ${className}`}
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
    >
      {/* Parchment ribbon tails */}
      <path
        d="M15 34 L9 43 L15 40 L18 43 L20 35 Z"
        fill="#d8c396"
        stroke="#6e5326"
        strokeWidth="0.9"
      />
      <path
        d="M29 34 L35 43 L29 40 L26 43 L24 35 Z"
        fill="#c7b080"
        stroke="#6e5326"
        strokeWidth="0.9"
      />
      {/* Organic scalloped crimson wax outer blob */}
      <path
        d="M22 3 C25.5 2.6 28.4 4.8 31.5 5.8 C34.6 6.8 37.9 8.2 39.2 11.4 C40.5 14.6 39.6 18.4 40.2 22 C40.8 25.6 40.2 29.5 38.4 32.4 C36.6 35.3 33.2 36.8 30.1 38.2 C27 39.6 24.8 41.2 22 41 C19.2 41.2 17 39.6 13.9 38.2 C10.8 36.8 7.4 35.3 5.6 32.4 C3.8 29.5 3.2 25.6 3.8 22 C4.4 18.4 3.5 14.6 4.8 11.4 C6.1 8.2 9.4 6.8 12.5 5.8 C15.6 4.8 18.5 2.6 22 3 Z"
        fill="#7c1914"
        stroke="#3e0907"
        strokeWidth="1.2"
      />
      {/* Inner recessed wax rim */}
      <circle
        cx="22"
        cy="22"
        r="14.2"
        fill="#61110d"
        stroke="#b3392f"
        strokeWidth="1.3"
      />
      {/* Embossed gold-leaf stamp ring */}
      <circle
        cx="22"
        cy="22"
        r="11.6"
        fill="none"
        stroke="#e5c378"
        strokeWidth="0.95"
        strokeDasharray="2.2 1.4"
      />
      <circle
        cx="22"
        cy="22"
        r="9.6"
        fill="#520d0a"
        stroke="#d4ae5e"
        strokeWidth="0.8"
      />
      {/* Stamped imperial crown & compass star */}
      <path
        d="M15.5 25.5 L16.8 18.5 L19.8 21.5 L22 16.5 L24.2 21.5 L27.2 18.5 L28.5 25.5 Z"
        fill="#eac982"
        stroke="#3e0907"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M15.2 27.2 H28.8"
        stroke="#f3dca2"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Specular wax highlight */}
      <path
        d="M11 12 Q16 7.5 23 8.5"
        fill="none"
        stroke="rgba(255, 215, 195, 0.35)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OrnateCornerFiligree({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className={`ornate-corner-svg ${position}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {/* Parchment corner gusset */}
      <path
        d="M2 2 H38 L30 10 H12 V30 L4 38 V2 Z"
        fill="rgba(218, 182, 108, 0.14)"
      />
      {/* Outer & inner engraved brass/gold rails */}
      <path
        d="M2 42 V6 L6 2 H42"
        fill="none"
        stroke="#e6c67e"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      <path
        d="M6.5 36 V10.5 L10.5 6.5 H36"
        fill="none"
        stroke="#b89249"
        strokeWidth="1"
      />
      {/* Baroque scroll flourish */}
      <path
        d="M10.5 22 C10.5 15 15 10.5 22 10.5 C18.5 14 17 17.5 20.5 20.5 C17.5 17 14 18.5 10.5 22 Z"
        fill="rgba(236, 202, 128, 0.28)"
        stroke="#dfb96b"
        strokeWidth="0.95"
      />
      {/* Corner diamond boss & rivets */}
      <polygon
        points="8,4 12,8 8,12 4,8"
        fill="#f3d692"
        stroke="#5c4318"
        strokeWidth="0.8"
      />
      <circle cx="20" cy="4.2" r="1.3" fill="#eccb82" />
      <circle cx="4.2" cy="20" r="1.3" fill="#eccb82" />
      <circle cx="14.5" cy="14.5" r="1.4" fill="#d9b261" />
    </svg>
  );
}

export function OrnatePanelFrame({
  seal = 'none',
  variant = 'default',
}: {
  seal?: WaxSealPosition;
  variant?: OrnatePanelVariant;
}) {
  return (
    <div
      className={`ornate-panel-frame variant-${variant}`}
      data-ornate-frame={variant}
      data-wax-seal={seal}
      aria-hidden="true"
    >
      <svg
        className="ornate-panel-border-svg"
        viewBox="0 0 200 200"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="1.5"
          y="1.5"
          width="197"
          height="197"
          rx="3"
          fill="none"
          stroke="rgba(228, 192, 114, 0.52)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x="5"
          y="5"
          width="190"
          height="190"
          rx="2"
          fill="none"
          stroke="rgba(186, 148, 76, 0.28)"
          strokeWidth="0.9"
          strokeDasharray="8 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <OrnateCornerFiligree position="tl" />
      <OrnateCornerFiligree position="tr" />
      <OrnateCornerFiligree position="bl" />
      <OrnateCornerFiligree position="br" />
      {seal !== 'none' && <WaxSealEmblem className={`panel-wax-seal seal-${seal}`} size={26} />}
    </div>
  );
}

export function ImperialViewportFrame() {
  return (
    <div
      className="imperial-viewport-frame"
      data-ornate-frame="imperial-parchment-wax"
      aria-hidden="true"
    >
      <svg
        className="imperial-viewport-svg"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* Outer burnished gold & dark mahogany perimeter */}
        <rect
          x="2"
          y="2"
          width="1596"
          height="996"
          fill="none"
          stroke="rgba(230, 192, 112, 0.58)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Inner parchment deckle hairline */}
        <rect
          x="7"
          y="7"
          width="1586"
          height="986"
          fill="none"
          stroke="rgba(206, 168, 92, 0.32)"
          strokeWidth="1"
          strokeDasharray="14 4 3 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <i className="corner-filigree tl">
        <OrnateCornerFiligree position="tl" />
      </i>
      <i className="corner-filigree tr">
        <OrnateCornerFiligree position="tr" />
      </i>
      <i className="corner-filigree bl">
        <OrnateCornerFiligree position="bl" />
      </i>
      <i className="corner-filigree br">
        <OrnateCornerFiligree position="br" />
      </i>
      <div className="viewport-cardinal-crest top-crest">
        <span className="crest-scroll-wing left" />
        <WaxSealEmblem size={22} />
        <span className="crest-scroll-wing right" />
      </div>
      <div className="viewport-cardinal-crest bottom-crest">
        <span className="crest-scroll-wing left" />
        <WaxSealEmblem size={20} />
        <span className="crest-scroll-wing right" />
      </div>
    </div>
  );
}

