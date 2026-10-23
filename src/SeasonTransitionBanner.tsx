import { useEffect, useRef, type CSSProperties } from 'react';
import { SEASON_RULES } from '../shared/world';
import type { Season } from '../shared/types';
import { audio } from './audio';
import './cinematics/campaign-cutscenes.css';

export const SEASON_TRANSITION_DURATION = 2500;

function SeasonSigil({ season }: { season: Season }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="51" strokeOpacity=".35" />
      <path
        d="m60 1 4 8-4 8-4-8Zm0 102 4 8-4 8-4-8ZM1 60l8-4 8 4-8 4Zm102 0 8-4 8 4-8 4Z"
        fill="currentColor"
        stroke="none"
      />
      {season === 'SPRING' ? (
        <g>
          <path d="M60 93V46M60 74C37 76 30 66 31 46c20-1 30 6 29 28Zm0-13c23 2 30-8 29-28-20-1-30 6-29 28Z" />
          <path d="M31 46 60 74m0-13 29-28M60 46c-16-10-15-24 0-33 15 9 16 23 0 33Z" />
        </g>
      ) : season === 'SUMMER' ? (
        <g>
          <circle cx="60" cy="60" r="22" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M60 20V30" transform={`rotate(${i * 30} 60 60)`} />
          ))}
          <circle cx="60" cy="60" r="16" strokeOpacity=".3" />
        </g>
      ) : season === 'AUTUMN' ? (
        <g>
          <path d="M60 94V35M60 81C42 80 34 72 36 59c15 0 23 8 24 22Zm0-20C42 60 34 52 36 39c15 0 23 8 24 22Zm0 10c18-1 26-9 24-22-15 0-23 8-24 22Zm0-20c18-1 26-9 24-22-15 0-23 8-24 22Zm0-16c-10-6-11-17 0-25 11 8 10 19 0 25Z" />
        </g>
      ) : (
        <g>
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              d="M60 60V22M48 31l12 12 12-12M51 48l9 9 9-9"
              transform={`rotate(${i * 60} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="5" />
        </g>
      )}
    </svg>
  );
}

function SeasonalLandscape({ season }: { season: Season }) {
  const id = `campaign-landscape-${season}`;
  return (
    <svg
      className="campaign-season__landscape"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1">
          <stop stopColor="var(--scene-sky-top)" />
          <stop offset="1" stopColor="var(--scene-sky-low)" />
        </linearGradient>
        <linearGradient id={`${id}-ground`} x2="0" y2="1">
          <stop stopColor="var(--scene-ground)" />
          <stop offset="1" stopColor="var(--scene-foreground)" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop stopColor="var(--scene-sun)" stopOpacity=".7" />
          <stop offset="1" stopColor="var(--scene-sun)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-river`} x2="1" y2="1">
          <stop stopColor="var(--scene-sun)" stopOpacity=".6" />
          <stop offset="1" stopColor="var(--scene-water)" stopOpacity=".1" />
        </linearGradient>
        <g id={`${id}-pine`}>
          <path d="m0 0-13 24h7l-14 18h11l-17 21h52L9 42h11L6 24h7Z" fill="var(--scene-tree)" />
          <path d="M-2 63h4v13h-4Z" fill="var(--scene-bark)" />
        </g>
        <g id={`${id}-village`} fill="var(--scene-building)">
          <path d="M0 42h22V18H0Zm29 0h18V24H29Zm26 0h25V12H55Z" />
          <path
            d="m-4 18 15-12 15 12Zm29 6 13-11 13 11Zm26-12L67 0l17 12Z"
            fill="var(--scene-roof)"
          />
          <path d="M8 33h6v9H8Zm29 0h4v9h-4Zm27-12h7v10h-7Z" fill="var(--scene-window)" />
        </g>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h1440v900H0z" />
      <circle cx="1080" cy="280" r="360" fill={`url(#${id}-sun)`} />
      <circle cx="1080" cy="280" r="46" fill="var(--scene-sun)" opacity=".48" />
      <g className="campaign-season__clouds" fill="var(--scene-mist)">
        <ellipse cx="210" cy="265" rx="300" ry="52" opacity=".16" />
        <ellipse cx="1210" cy="390" rx="350" ry="46" opacity=".18" />
        <ellipse cx="800" cy="340" rx="360" ry="26" opacity=".12" />
      </g>
      <path
        d="m-80 630 134-147 56 22 125-178 87 105 63-44 172 180 137-111 111 45 118-137 59 51 85-117 118 131 88-58 137 233Z"
        fill="var(--scene-mountain)"
      />
      <path
        d="m196 382 39-55 87 105-55-31-19-34-15 20Zm829-95 118 131-63-39-30-51-16 17-21-22Zm-971 196 56 22-38-11Z"
        fill="var(--scene-snow)"
        opacity=".65"
      />
      <path
        d="M-90 646c232-192 338 61 586-62s284 0 442-24 279-136 540 65v275H-90Z"
        fill="var(--scene-midground)"
      />
      <path
        d="M-80 768c197-186 320-123 563-72s419-155 657-85 290 83 380 10v279H-80Z"
        fill={`url(#${id}-ground)`}
      />
      <path
        d="M894 596c-104 14-220 52-117 84s155 37 51 88-70 86 90 132H600c-106-79 5-122 120-158s-123-45-87-77 158-58 261-69Z"
        fill={`url(#${id}-river)`}
      />
      <g opacity=".74">
        <use href={`#${id}-village`} x="292" y="618" transform="rotate(-3 330 640)" />
        <use href={`#${id}-village`} x="1170" y="650" transform="scale(.8) translate(270 160)" />
      </g>
      <g fill="var(--scene-building)">
        <path d="M1020 609v-69h16v-12h7v12h13v-12h7v12h15v69Zm-13 0v-84h8v-8h7v8h8v84Zm62 0v-84h8v-8h7v8h8v84Z" />
        <path d="M1048 591a7 7 0 0 1 14 0v18h-14Z" fill="var(--scene-foreground)" />
      </g>
      <g opacity=".8">
        {Array.from({ length: 16 }, (_, index) => (
          <use
            key={index}
            href={`#${id}-pine`}
            x={index < 8 ? 12 + index * 34 : 1160 + (index - 8) * 46}
            y={654 + ((index * 37) % 93)}
          />
        ))}
      </g>
      <g fill="var(--scene-foreground)">
        <path d="M-90 920V802c132-104 206 10 350 55s316-17 476 54Z" />
        <path d="M1510 900V765c-186-98-230 105-499 135Z" />
      </g>
      <g opacity=".55" stroke="var(--scene-reed)" strokeWidth="2" fill="none">
        {Array.from({ length: 18 }, (_, index) => (
          <path
            key={index}
            d={`M${30 + index * 24} 900q${-6 + (index % 4) * 4} -30 -10 -${38 + (index % 6) * 8}m10 ${38 + (index % 6) * 8}q5 -28 12 -38`}
          />
        ))}
      </g>
    </svg>
  );
}

export default function SeasonTransitionBanner({
  season,
  turn,
  onComplete,
}: {
  season: Season;
  turn: number;
  onComplete: () => void;
}) {
  const callback = useRef(onComplete);
  const button = useRef<HTMLButtonElement>(null);
  const completed = useRef(false);
  callback.current = onComplete;
  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    callback.current();
  };
  useEffect(() => {
    completed.current = false;
    audio.play('season');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    button.current?.focus();
    const timer = setTimeout(() => {
      if (!completed.current) {
        completed.current = true;
        callback.current();
      }
    }, SEASON_TRANSITION_DURATION);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!completed.current) {
          completed.current = true;
          callback.current();
        }
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        button.current?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [season, turn]);
  const rule = SEASON_RULES[season];
  return (
    <section
      className={`season-transition campaign-season season-${season.toLowerCase()}`}
      data-season-transition={season}
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-season-title"
    >
      <SeasonalLandscape season={season} />
      <div className="campaign-season__haze" aria-hidden="true" />
      <div className="campaign-season__particles" aria-hidden="true">
        {Array.from({ length: season === 'WINTER' ? 32 : 18 }, (_, index) => (
          <i
            key={index}
            style={
              {
                '--season-x': `${(index * 47 + 5) % 100}%`,
                '--season-delay': `${-(index * 0.63)}s`,
                '--season-duration': `${4 + (index % 5)}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="season-transition-copy campaign-season__copy">
        <small>
          AS GRANDES ESTAÇÕES <span aria-hidden="true">/</span> RODADAS {turn}–{turn + 2}
        </small>
        <div className="campaign-season__sigil">
          <SeasonSigil season={season} />
        </div>
        <h2 id="campaign-season-title">{rule.name}</h2>
        <h3>{rule.title}</h3>
        <p>{rule.effect}</p>
        <div className="campaign-season__chapter">
          <span />
          <i />
          <i />
          <i />
          <span />
        </div>
        <small>Três rodadas. Um novo capítulo.</small>
      </div>
      <button ref={button} className="campaign-season__skip" onClick={complete}>
        Continuar <kbd>Esc</kbd>
      </button>
      <div className="season-transition-timer" aria-hidden="true" />
    </section>
  );
}

export function SeasonAtmosphere({ season }: { season?: Season }) {
  if (!season) return null;
  const count = season === 'WINTER' ? 34 : season === 'AUTUMN' ? 22 : 16;
  return (
    <div
      className={`season-atmosphere season-${season.toLowerCase()}`}
      aria-hidden="true"
      data-season-atmosphere={season}
    >
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          style={
            {
              '--particle-x': `${(index * 47 + 9) % 103}%`,
              '--particle-delay': `${-(index * 0.73)}s`,
              '--particle-duration': `${6 + (index % 7)}s`,
              '--particle-drift': `${70 + (index % 5) * 29}px`,
              '--particle-size': `${season === 'WINTER' ? 2 + (index % 3) : 4 + (index % 5)}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
