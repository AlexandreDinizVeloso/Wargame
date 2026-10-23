import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronRight, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { BattleReport, Composition } from '../../shared/types';
import { TERRAIN_LABELS } from '../../shared/map';
import { seasonAt } from '../../shared/world';
import { CoatOfArms } from '../ui';
import { audio } from '../audio';
import BattleTheatreCanvas from './BattleTheatreCanvas';
import {
  BATTLE_CINEMATIC_DURATION,
  BATTLE_PHASES,
  battleLossProgress,
  battlePhaseAt,
  battlePhaseCaption,
  battleVerdict,
  type BattleClock,
  type BattleSceneContext,
} from './battlePresentation';
import './battle-cinematic.css';

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const format = (value: number) => integer.format(Math.max(0, Math.round(value)));
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export interface BattleCinematicProps {
  game: BattleSceneContext;
  battle: BattleReport;
  playerId: string;
  onComplete: () => void;
  onSkip?: () => void;
  /** Zero based position in the report's visible battle queue. */
  index?: number;
  total?: number;
  autoAdvance?: boolean;
  preview?: boolean;
}

export default function BattleCinematic({
  game,
  battle,
  playerId,
  onComplete,
  onSkip,
  index = 0,
  total = 1,
  autoAdvance = true,
  preview = false,
}: BattleCinematicProps) {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [muted, setMuted] = useState(audio.muted);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const clock = useRef<BattleClock>({ elapsedMs: 0, playing: true });
  const root = useRef<HTMLElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onComplete, onSkip });
  callbacks.current = { onComplete, onSkip };
  const phase = battlePhaseAt(elapsed);
  const resolved = phase === 'result';
  const progress = clamp(elapsed / BATTLE_CINEMATIC_DURATION);
  const lossProgress = battleLossProgress(elapsed);
  const province = game.provinces.find((entry) => entry.id === battle.provinceId);
  const attacker = game.players.find((entry) => entry.id === battle.attackerId);
  const defender = game.players.find((entry) => entry.id === battle.defenderId);
  const result = battleVerdict(game, battle, playerId);
  const resultRef = useRef(result);
  resultRef.current = result;
  const headingId = `battle-cinematic-heading-${battle.id}`;
  const togglePause = useCallback(() => {
    if (clock.current.elapsedMs >= BATTLE_CINEMATIC_DURATION) return;
    clock.current.playing = !clock.current.playing;
    if (!clock.current.playing) audio.stopCinematicEffects();
    setPaused(!clock.current.playing);
  }, []);
  const complete = useCallback(() => callbacks.current.onComplete(), []);
  const skip = useCallback(() => {
    audio.stopCinematicEffects();
    (callbacks.current.onSkip ?? callbacks.current.onComplete)();
  }, []);
  const restart = () => setRun((value) => value + 1);

  useEffect(() => {
    if (resolved && !root.current?.contains(document.activeElement))
      root.current
        ?.querySelector<HTMLButtonElement>('.cc-primary-button')
        ?.focus({ preventScroll: true });
  }, [resolved]);

  useEffect(() => audio.subscribe(() => setMuted(audio.muted)), []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipButton.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        skip();
      } else if (
        event.code === 'Space' &&
        !(event.target instanceof Element && event.target.closest('button,input,select,textarea'))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        togglePause();
      } else if (event.key === 'Tab') {
        const controls = [
          ...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
        ];
        if (!controls.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !root.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [skip, togglePause]);

  useEffect(() => {
    clock.current = { elapsedMs: 0, playing: true };
    setElapsed(0);
    setPaused(false);
    audio.stopCinematicEffects();
    audio.setCinematicMood('battle');
    const compositionA = battle.attackerCompositionBefore;
    const compositionD = battle.defenderCompositionBefore;
    const hasArtillery = (compositionA?.artillery ?? 0) + (compositionD?.artillery ?? 0) > 0;
    const hasCavalry = (compositionA?.cavalry ?? 0) + (compositionD?.cavalry ?? 0) > 0;
    const hasInfantry = (compositionA?.infantry ?? 0) + (compositionD?.infantry ?? 0) > 0;
    const cues = battle.naval
      ? [
          { at: 400, play: () => audio.play('battle-ambience') },
          { at: 1_100, play: () => audio.play('sail') },
          { at: 2_150, play: () => audio.play('naval') },
          { at: 3_750, play: () => audio.play('cannon') },
          { at: 4_350, play: () => audio.play('impact') },
          { at: 5_450, play: () => audio.play('naval') },
          { at: 6_950, play: () => audio.play('impact') },
        ]
      : [
          { at: 350, play: () => audio.play('battle-ambience') },
          { at: 900, play: () => audio.play('march') },
          ...(hasArtillery
            ? [
                { at: 2_100, play: () => audio.play('cannon') },
                { at: 2_850, play: () => audio.play('impact') },
              ]
            : []),
          ...(hasInfantry || (!compositionA && !compositionD)
            ? [
                { at: 3_650, play: () => audio.play('musket') },
                { at: 4_150, play: () => audio.play('musket') },
              ]
            : []),
          { at: 5_100, play: () => audio.play(hasCavalry ? 'charge' : 'march') },
          { at: 6_950, play: () => audio.play('steel') },
          { at: 7_550, play: () => audio.play('impact') },
        ];
    cues.push({ at: 8_200, play: () => audio.setCinematicMood(resultRef.current.musicMood) });
    const fired = new Set<number>();
    let frame = 0,
      last = performance.now(),
      lastUi = 0,
      completed = false;
    const visibility = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', visibility);
    const tick = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      if (clock.current.playing && !document.hidden) {
        clock.current.elapsedMs = Math.min(
          BATTLE_CINEMATIC_DURATION,
          clock.current.elapsedMs + delta,
        );
        cues.forEach((cue, cueIndex) => {
          if (!fired.has(cueIndex) && clock.current.elapsedMs >= cue.at) {
            fired.add(cueIndex);
            // A busy tab must not dump several old salvos into the mixer at once.
            if (cue.at === 8_200 || clock.current.elapsedMs - cue.at < 500) cue.play();
          }
        });
      }
      if (now - lastUi >= 65 || clock.current.elapsedMs === BATTLE_CINEMATIC_DURATION) {
        setElapsed(clock.current.elapsedMs);
        lastUi = now;
      }
      if (clock.current.elapsedMs >= BATTLE_CINEMATIC_DURATION) {
        clock.current.playing = false;
        if (!completed && autoAdvance) {
          completed = true;
          callbacks.current.onComplete();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      clock.current.playing = false;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      audio.stopCinematicEffects();
      audio.setCinematicMood(null);
    };
  }, [battle.id, run, autoAdvance]);

  const side = (attacking: boolean) => {
    const nation = attacking ? attacker : defender;
    const before = attacking ? battle.attackerTroops : battle.defenderTroops;
    const casualties = attacking ? battle.attackerCasualties : battle.defenderCasualties;
    const moraleBefore = attacking ? battle.attackerMoraleBefore : battle.defenderMoraleBefore;
    const moraleAfter = attacking ? battle.attackerMoraleAfter : battle.defenderMoraleAfter;
    const composition = attacking
      ? battle.attackerCompositionBefore
      : battle.defenderCompositionBefore;
    const compositionLosses = attacking
      ? battle.attackerCompositionLosses
      : battle.defenderCompositionLosses;
    const morale = moraleBefore + (moraleAfter - moraleBefore) * lossProgress;
    const moraleCap = Math.max(110, moraleBefore, moraleAfter);
    const lossesShown = Math.round(casualties * lossProgress);
    const rows: [keyof Composition, string][] = battle.naval
      ? [
          ['warships', 'Guerra'],
          ['transports', 'Transportes'],
        ]
      : [
          ['infantry', 'Infantaria'],
          ['cavalry', 'Cavalaria'],
          ['artillery', 'Artilharia'],
        ];
    return (
      <aside
        className={`cc-realm cc-realm--${attacking ? 'attacker' : 'defender'}`}
        style={{ '--cc-realm': nation?.color ?? '#a9a48e' } as CSSProperties}
      >
        <header>
          <div className="cc-heraldry">
            {nation ? (
              <CoatOfArms nationId={nation.nationId} size={48} />
            ) : (
              <span className="cc-independent" aria-hidden="true">
                ✦
              </span>
            )}
          </div>
          <div>
            <small>{attacking ? 'FORÇAS ATACANTES' : 'FORÇAS DEFENSORAS'}</small>
            <h3>{nation?.nation ?? 'Guarnição independente'}</h3>
            <span>{nation?.name ?? 'Território independente'}</span>
          </div>
        </header>
        <div className="cc-strength">
          <strong data-cinematic-troops={attacking ? 'attacker' : 'defender'}>
            {format(before - lossesShown)}
          </strong>
          <span>
            {battle.naval ? 'embarcações' : 'tropas'}
            <b>−{format(lossesShown)} baixas</b>
          </span>
        </div>
        <div className="cc-morale">
          <div>
            <span>Moral</span>
            <b>{format(morale)}%</b>
          </div>
          <span
            role="meter"
            aria-label={`Moral ${attacking ? 'atacante' : 'defensora'}`}
            aria-valuemin={0}
            aria-valuemax={moraleCap}
            aria-valuenow={Math.round(morale)}
          >
            <i style={{ width: `${Math.min(100, Math.max(0, (morale / moraleCap) * 100))}%` }} />
          </span>
        </div>
        <div className="cc-composition">
          {composition ? (
            rows.map(([key, name]) => (
              <span key={key}>
                <b>{format(composition[key] - (compositionLosses?.[key] ?? 0) * lossProgress)}</b>
                {name}
              </span>
            ))
          ) : (
            <span>Composição não registrada neste relatório.</span>
          )}
        </div>
        {resolved && (
          <p className="cc-side-result">
            {format(before)} no início <i>→</i> <b>{format(before - casualties)} sobreviventes</b>
          </p>
        )}
      </aside>
    );
  };

  return (
    <section
      ref={root}
      className={`cc-battle-cinematic cc-phase--${phase} ${reducedMotion ? 'cc-reduced-motion' : ''} ${paused ? 'cc-is-paused' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-battle-cinematic={battle.id}
      data-battle-phase={phase}
      data-cinematic-paused={paused}
    >
      <BattleTheatreCanvas
        battle={battle}
        attackerColor={attacker?.color ?? '#a56c4d'}
        defenderColor={defender?.color ?? '#7a8f97'}
        terrain={province?.terrain ?? 'plains'}
        season={seasonAt(battle.turn)}
        clock={clock}
        reducedMotion={reducedMotion}
      />
      <div className="cc-film-shade" aria-hidden="true" />
      <div className="cc-letterbox cc-letterbox--top" aria-hidden="true" />
      <div className="cc-letterbox cc-letterbox--bottom" aria-hidden="true" />
      <header className="cc-film-header">
        <div className="cc-film-edition">
          <span className="cc-film-seal">C</span>
          <div>
            CONCÓRDIA<small>CRÔNICAS DE GUERRA</small>
          </div>
        </div>
        <div className="cc-film-location">
          <span>
            RODADA {battle.turn} <i />{' '}
            {battle.naval
              ? 'CONFRONTO NAVAL'
              : province
                ? TERRAIN_LABELS[province.terrain]
                : 'CAMPO DE BATALHA'}
          </span>
          <h2 id={headingId}>{province?.name ?? battle.provinceId}</h2>
        </div>
        <div className="cc-film-counter">
          <span>{preview ? 'PRÉVIA' : 'CONFRONTO'}</span>
          <b>
            {String(index + 1).padStart(2, '0')}
            <small> / {String(total).padStart(2, '0')}</small>
          </b>
        </div>
      </header>
      <div className="cc-field-context">
        <span>{battle.naval ? 'Mar aberto' : 'Campanha terrestre'}</span>
        {battle.fortLevel > 0 && <span>Forte nível {battle.fortLevel}</span>}
        {(battle.riverCrossingModifier ?? 1) < 1 && (
          <span>
            Travessia de rio: −{Math.round((1 - battle.riverCrossingModifier!) * 100)}% ataque
          </span>
        )}
        {battle.neutralizedFortLevels > 0 && (
          <span>{battle.neutralizedFortLevels} nível(is) de forte neutralizado(s)</span>
        )}
      </div>
      {side(true)}
      {side(false)}
      <div className="cc-phase-caption" aria-live="polite">
        {!resolved && (
          <>
            <span>{BATTLE_PHASES.find((entry) => entry.id === phase)?.label}</span>
            <p>{battlePhaseCaption(battle, phase)}</p>
          </>
        )}
        {paused && <b className="cc-paused-label">Cena pausada</b>}
      </div>
      {resolved && (
        <section className={`cc-verdict cc-verdict--${result.tone}`} aria-live="polite">
          <span className="cc-verdict-overline">O RELATÓRIO DO CAMPO</span>
          <h3>{result.title}</h3>
          <p className="cc-winner-name">{result.winnerName}</p>
          <div className="cc-verdict-rule" />
          <div className="cc-casualty-totals">
            <span>
              <small>BAIXAS ATACANTES</small>
              <b>{format(battle.attackerCasualties)}</b>
            </span>
            <i>·</i>
            <span>
              <small>BAIXAS DEFENSORAS</small>
              <b>{format(battle.defenderCasualties)}</b>
            </span>
          </div>
          <p className="cc-verdict-detail">{result.detail}</p>
          {(battle.capturedShips ?? 0) > 0 && (
            <p className="cc-verdict-detail">
              {format(battle.capturedShips!)} embarcação(ões) capturada(s).
            </p>
          )}
          <p className="cc-power-balance">
            Poder de ataque {format(battle.attackPower)} <span>×</span> defesa{' '}
            {format(battle.defensePower)}
          </p>
        </section>
      )}
      <footer className="cc-film-footer">
        <div className="cc-timeline" aria-label={`Cena: ${Math.round(progress * 100)}%`}>
          <i style={{ width: `${progress * 100}%` }} />
          {BATTLE_PHASES.map((entry) => (
            <b
              key={entry.id}
              className={elapsed >= entry.at ? 'cc-passed' : ''}
              style={{ left: `${(entry.at / BATTLE_CINEMATIC_DURATION) * 100}%` }}
              title={entry.label}
            />
          ))}
        </div>
        <div className="cc-film-controls">
          <small className="cc-film-description">
            {preview ? (
              'PRÉVIA · DADOS DE EXEMPLO'
            ) : (
              <>
                Reconstituição visual <i>·</i> resultados da rodada
              </>
            )}
          </small>
          <div className="cc-control-group">
            <button
              className="cc-icon-button"
              onClick={() => audio.setMuted(!audio.muted)}
              aria-label={muted ? 'Ativar áudio' : 'Silenciar áudio'}
              title={muted ? 'Ativar áudio' : 'Silenciar áudio'}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            {elapsed < BATTLE_CINEMATIC_DURATION && (
              <button
                className="cc-control-pause"
                onClick={togglePause}
                aria-label={paused ? 'Retomar cena' : 'Pausar cena'}
                title="Espaço"
              >
                {paused ? <Play size={15} /> : <Pause size={15} />}
                <span>{paused ? 'Retomar' : 'Pausar'}</span>
              </button>
            )}
            {resolved && (
              <button onClick={restart}>
                <RotateCcw size={15} />
                <span>Rever</span>
              </button>
            )}
            {resolved ? (
              <button className="cc-primary-button" onClick={complete}>
                {preview
                  ? 'Voltar à galeria'
                  : index + 1 < total
                    ? 'Próximo confronto'
                    : 'Voltar ao mapa'}
                <ChevronRight size={17} />
              </button>
            ) : (
              <button ref={skipButton} onClick={skip}>
                <SkipForward size={15} />
                <span>Pular</span>
                <kbd>Esc</kbd>
              </button>
            )}
          </div>
        </div>
      </footer>
    </section>
  );
}
