import { useEffect, useRef, type CSSProperties } from 'react';
import { SEASON_RULES } from '../shared/world';
import type { Season } from '../shared/types';

export const SEASON_TRANSITION_DURATION = 2500;

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
  callback.current = onComplete;
  useEffect(() => {
    const timer = setTimeout(() => callback.current(), SEASON_TRANSITION_DURATION);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', key, true);
    };
  }, [season, turn]);
  const rule = SEASON_RULES[season];
  return (
    <section
      className={`season-transition season-${season.toLowerCase()}`}
      data-season-transition={season}
      aria-live="polite"
      role="status"
    >
      <div className="season-transition-landscape" aria-hidden="true" />
      <div className="season-transition-copy">
        <small>AS GRANDES ESTAÇÕES · RODADA {turn}</small>
        <span className="season-transition-icon" aria-hidden="true">
          {rule.icon}
        </span>
        <h2>{rule.name}</h2>
        <h3>{rule.title}</h3>
        <p>{rule.effect}</p>
        <small>Três rodadas para preparar o próximo capítulo.</small>
      </div>
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
