import { useEffect, useRef, type CSSProperties } from 'react';
import { CASUS_LABELS, unitCount } from '../shared/rules';
import type { GameView, War } from '../shared/types';
import { CoatOfArms } from './ui';
import { audio } from './audio';
import './cinematics/campaign-cutscenes.css';

function CrossedBlades() {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d="M19 13 79 72 72 79 13 19 13 13Z" fill="currentColor" />
      <path d="m81 13-60 59 7 7 59-60v-6Z" fill="currentColor" />
      <path
        d="m62 78 18-18M20 60l18 18M77 78l10 10M13 88l10-10"
        stroke="currentColor"
        strokeWidth="5"
      />
      <circle cx="88" cy="89" r="4" fill="currentColor" />
      <circle cx="12" cy="89" r="4" fill="currentColor" />
    </svg>
  );
}

function HeraldicLaurel() {
  return (
    <svg className="campaign-war__laurel" viewBox="0 0 300 330" fill="none" aria-hidden="true">
      <path
        d="M145 302C29 279 5 139 49 62M155 302c116-23 140-163 96-240"
        stroke="currentColor"
        strokeWidth="2"
      />
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <g key={index} transform={`translate(150 178) rotate(${index * 13 - 31})`}>
          <path
            d="M-110 22q-27-13-24-40 24 7 24 40Zm4 12q24-21 15-44-22 16-15 44Z"
            fill="currentColor"
          />
          <path
            d="M110 22q27-13 24-40-24 7-24 40Zm-4 12q-24-21-15-44 22 16 15 44Z"
            fill="currentColor"
          />
        </g>
      ))}
      <path d="m114 301 36-16 36 16-36 15Z" fill="currentColor" />
    </svg>
  );
}

export default function WarCutsceneModal({
  game,
  war,
  onComplete,
}: {
  game: GameView;
  war: War;
  onComplete: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const callback = useRef(onComplete);
  const completed = useRef(false);
  callback.current = onComplete;
  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    callback.current();
  };
  useEffect(() => {
    completed.current = false;
    audio.play('war');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    button.current?.focus();
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
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [war.id]);
  const side = (leaderId: string, ids: string[], label: string) => {
    const leader = game.players.find((player) => player.id === leaderId);
    const troops = game.battalions
      .filter((army) => ids.includes(army.ownerId))
      .reduce((sum, army) => sum + unitCount(army), 0);
    const allies = game.players.filter(
      (player) => ids.includes(player.id) && player.id !== leaderId,
    );
    return (
      <article
        className={`war-cutscene-side campaign-war__side ${label === 'Atacante' ? 'attacker' : 'defender'}`}
        style={{ '--realm-color': leader?.color ?? '#bfa36c' } as CSSProperties}
      >
        <span className="campaign-war__side-label">{label}</span>
        <div className="campaign-war__standard">
          <div className="campaign-war__ribbon" />
          <HeraldicLaurel />
          <div className="campaign-war__shield">
            {leader && <CoatOfArms nationId={leader.nationId} size={200} />}
          </div>
        </div>
        <h3 className="campaign-war__nation">{leader?.nation ?? 'Nação desconhecida'}</h3>
        <span className="campaign-war__sovereign">{leader?.name}</span>
        <div className="campaign-war__forces">
          <div>
            <strong>{troops.toLocaleString('pt-BR')}</strong>
            <small>Tropas visíveis</small>
          </div>
          <span aria-hidden="true" />
          <div>
            <strong>{allies.length}</strong>
            <small>Aliados convocados</small>
          </div>
        </div>
        <p className="campaign-war__allies">
          {allies.map((ally) => ally.nation).join(' · ') ||
            'A Coroa marcha sob seu próprio estandarte.'}
        </p>
      </article>
    );
  };
  return (
    <section
      className="war-cutscene campaign-war"
      role="dialog"
      aria-modal="true"
      aria-labelledby="war-cutscene-title"
      data-war-cutscene={war.id}
    >
      <div className="campaign-war__engraving" aria-hidden="true">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path d="m-80 640 140-85 72 31 110-71 61 30 123-94 109 51 101-72 151 116 111-40 72 39 169-86 178 59M-80 696l192-76 79 43 142-82 91 68 141-58 121 74 132-25 119 39 91-44 103 57 139-37M-80 744l192-42 168 44 91-22 124 31 148-44 159 56 151-29 109 44 119-15 139 36" />
          <path d="M-40 440c235-166 327 194 540-70S889 244 1085 440s294 25 438-77M106-20c243 205-38 294 153 487s443 29 404 366M947-20c-224 202 109 292-31 497s119 262 89 466" />
        </svg>
      </div>
      <div className="campaign-war__fog campaign-war__fog--near" aria-hidden="true" />
      <div className="campaign-war__fog campaign-war__fog--far" aria-hidden="true" />
      <div className="campaign-war__embers" aria-hidden="true">
        {Array.from({ length: 22 }, (_, index) => (
          <i
            key={index}
            style={
              {
                '--ember-x': `${(index * 43 + 7) % 100}%`,
                '--ember-delay': `${-(index * 0.57)}s`,
                '--ember-duration': `${5 + (index % 6)}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="campaign-war__vignette" aria-hidden="true" />
      <div className="war-cutscene-content campaign-war__content">
        <header className="campaign-war__heading">
          <small className="war-cutscene-eyebrow">
            AS COROAS CONVOCAM SUAS HOSTES · RODADA {war.startedTurn}
          </small>
          <h2 id="war-cutscene-title">Guerra declarada</h2>
          <p className="war-cutscene-casus">
            {war.casusBelli === 'CONQUEST' ? 'Conquista Imperial' : CASUS_LABELS[war.casusBelli]}
          </p>
        </header>
        <div className="war-cutscene-heraldry campaign-war__heraldry">
          {side(war.attackerLeaderId, war.attackerIds, 'Atacante')}
          <div className="campaign-war__clash" aria-hidden="true">
            <span />
            <CrossedBlades />
            <span />
          </div>
          {side(war.defenderLeaderId, war.defenderIds, 'Defensor')}
        </div>
        <footer className="campaign-war__footer">
          <button
            ref={button}
            className="primary war-cutscene-acknowledge campaign-war__acknowledge"
            onClick={complete}
          >
            <CrossedBlades /> ÀS ARMAS! <span aria-hidden="true">↵</span>
          </button>
          <p>A comparação usa apenas as forças que a sua nação consegue observar.</p>
          <small>Esc para continuar</small>
        </footer>
      </div>
    </section>
  );
}
