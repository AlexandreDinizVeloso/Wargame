import { useEffect, useRef } from 'react';
import { CASUS_LABELS, unitCount } from '../shared/rules';
import type { GameView, War } from '../shared/types';
import { CoatOfArms } from './ui';
import { audio } from './audio';

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
  callback.current = onComplete;
  useEffect(() => {
    audio.play('war');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    button.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        callback.current();
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
      <article className={`war-cutscene-side ${label === 'Atacante' ? 'attacker' : 'defender'}`}>
        <small>{label}</small>
        {leader && <CoatOfArms nationId={leader.nationId} size={142} />}
        <h3>{leader?.nation ?? 'Nação desconhecida'}</h3>
        <span>{leader?.name}</span>
        <strong>
          {troops} <small>Tropas totais visíveis</small>
        </strong>
        <p>
          Aliados convocados: <b>{allies.length}</b>
        </p>
        <small>
          {allies.map((ally) => ally.nation).join(' · ') ||
            'A Coroa marcha com suas próprias forças.'}
        </small>
      </article>
    );
  };
  return (
    <section
      className="war-cutscene"
      role="dialog"
      aria-modal="true"
      aria-labelledby="war-cutscene-title"
      data-war-cutscene={war.id}
    >
      <div className="war-cutscene-smoke" aria-hidden="true" />
      <div className="war-cutscene-content">
        <small className="war-cutscene-eyebrow">
          OS SELOS FORAM ROMPIDOS · RODADA {war.startedTurn}
        </small>
        <h2 id="war-cutscene-title">⚔️ GUERRA DECLARADA</h2>
        <p className="war-cutscene-casus">
          {war.casusBelli === 'CONQUEST' ? 'Conquista Imperial' : CASUS_LABELS[war.casusBelli]}
        </p>
        <div className="war-cutscene-heraldry">
          {side(war.attackerLeaderId, war.attackerIds, 'Atacante')}
          <span className="war-cutscene-impact" aria-hidden="true">
            ⚔
          </span>
          {side(war.defenderLeaderId, war.defenderIds, 'Defensor')}
        </div>
        <button ref={button} className="primary war-cutscene-acknowledge" onClick={onComplete}>
          ⚔️ ÀS ARMAS!
        </button>
      </div>
    </section>
  );
}
