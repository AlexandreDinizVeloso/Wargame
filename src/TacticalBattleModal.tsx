import { FloatingWindow } from './FloatingWindow';
import { useEffect, useState } from 'react';
import type { BattleReport, Composition, GameView } from '../shared/types';
import { TERRAIN_LABELS } from '../shared/map';
import { CoatOfArms } from './ui';
import { audio } from './audio';
export default function TacticalBattleModal({
  game,
  battle,
  onClose,
}: {
  game: GameView;
  battle: BattleReport;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const value = Math.min(1, (now - started) / 2500);
      setProgress(value);
      if (value < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timers = [0, 830, 1660].map((ms) => setTimeout(() => audio.playCombatSound(), ms));
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', escape, true);
    };
  }, [battle.id, onClose]);
  const province = game.provinces.find((p) => p.id === battle.provinceId),
    attacker = game.players.find((p) => p.id === battle.attackerId),
    defender = game.players.find((p) => p.id === battle.defenderId);
  const phase = Math.min(3, Math.floor(progress * 3) + 1);
  function side(attack: boolean) {
    const nation = attack ? attacker : defender,
      total = attack ? battle.attackerTroops : battle.defenderTroops,
      losses = attack ? battle.attackerCasualties : battle.defenderCasualties;
    const before = attack ? battle.attackerMoraleBefore : battle.defenderMoraleBefore,
      after = attack ? battle.attackerMoraleAfter : battle.defenderMoraleAfter;
    const composition = attack
      ? battle.attackerCompositionBefore
      : battle.defenderCompositionBefore;
    const rows: { label: string; icon: string; key: keyof Composition; modifier: number }[] =
      battle.naval
        ? [
            { label: 'Linha de fogo', icon: '⛵', key: 'warships', modifier: 1 },
            { label: 'Transportes', icon: '⚓', key: 'transports', modifier: 1 },
          ]
        : [
            {
              label: 'Vanguarda · Infantaria',
              icon: '🛡️',
              key: 'infantry',
              modifier: attack ? battle.infantryModifier : battle.terrainDefenseBonus,
            },
            {
              label: 'Flancos · Cavalaria',
              icon: '🐎',
              key: 'cavalry',
              modifier: attack ? battle.cavalryModifier : 1,
            },
            {
              label: 'Retaguarda · Artilharia',
              icon: '💣',
              key: 'artillery',
              modifier: attack ? battle.artilleryModifier : 1,
            },
          ];
    return (
      <section
        className={`battle-side ${attack ? 'attacker' : 'defender'}`}
        style={{ '--realm-color': nation?.color ?? '#afaa8c' } as React.CSSProperties}
      >
        <header>
          {nation && <CoatOfArms nationId={nation.nationId} size={36} />}
          <div>
            <small>{attack ? 'ATACANTE' : 'DEFENSOR'}</small>
            <h3>{nation?.nation ?? 'Guarda Independente'}</h3>
          </div>
        </header>
        <div className="battle-strength">
          <strong data-battle-troops={attack ? 'attacker' : 'defender'}>
            {total - Math.round(losses * progress)}
          </strong>
          <span>−{Math.round(losses * progress)} baixas</span>
        </div>
        <label>
          Moral <b>{Math.round(before + (after - before) * progress)}%</b>
          <progress max={110} value={before + (after - before) * progress} />
        </label>
        <div className="combat-lines">
          {rows.map((row) => (
            <div className={`combat-line line-${row.key}`} key={row.key}>
              <small>{row.label}</small>
              <div className="combat-miniatures">
                {Array.from(
                  { length: composition ? Math.min(8, composition[row.key]) : 1 },
                  (_, i) => (
                    <span key={i} style={{ animationDelay: `${i * 45}ms` }}>
                      {row.icon}
                    </span>
                  ),
                )}
                <b>{composition ? Math.round(composition[row.key]) : '?'}</b>
              </div>
              <small>
                {Math.round((row.modifier - 1) * 100)}% modificador{' '}
                {row.key === 'artillery'
                  ? ` · ${battle.neutralizedFortLevels} forte(s) neutralizado(s)`
                  : ''}
              </small>
            </div>
          ))}
        </div>
        {!composition && <small>Composição não registrada neste relatório antigo.</small>}
      </section>
    );
  }
  return (
    <FloatingWindow
      id="tactical-battle"
      title="Palco Tático de Batalha"
      role="dialog"
      anchor="center"
      width={940}
      height={650}
      maxWidth={1200}
      minWidth={380}
      minHeight={320}
      onClose={onClose}
      className="tactical-battle-window"
      active
    >
      <section
        className={`tactical-battle-stage framed-panel salvo-${phase} ${progress === 1 ? 'battle-complete' : ''}`}
        data-battle-stage={battle.id}
      >
        <header className="battle-stage-heading">
          <div>
            <small>
              RODADA {battle.turn} ·{' '}
              {battle.naval
                ? 'CONFRONTO NAVAL'
                : province
                  ? TERRAIN_LABELS[province.terrain]
                  : 'CAMPO DE BATALHA'}{' '}
              · FORTE {battle.fortLevel}
              {(battle.riverCrossingModifier ?? 1) < 1 && ' · 🌊 Travessia de Rio: −15%'}
            </small>
            <h2>⚔️ {province?.name ?? battle.provinceId}</h2>
          </div>
        </header>
        <div className="battle-field" data-salvo={phase}>
          {side(true)}
          <div className="battle-crossfire" aria-hidden="true">
            <i />
            <i />
            <i />
            <b>VS</b>
          </div>
          {side(false)}
        </div>
        <footer>
          <span>
            {progress < 1
              ? `Salva ${phase} / 3`
              : `Ataque ${Math.round(battle.attackPower)} × Defesa ${Math.round(battle.defensePower)} · Baixas ${battle.attackerCasualties}/${battle.defenderCasualties}`}
          </span>
          {progress === 1 && (
            <strong className="battle-verdict">
              {battle.stackwipe
                ? '💀 ANIQUILAÇÃO TOTAL (STACKWIPE)'
                : battle.retreatDestinationId
                  ? '🏳️ RECUO INIMIGO'
                  : battle.outcome === 'siege_blocked'
                    ? '🏰 MURALHAS RESISTIRAM'
                    : '🏆 VITÓRIA DECISIVA'}{' '}
              ·{' '}
              {game.players.find((p) => p.id === battle.winnerId)?.nation ?? 'Guarda Independente'}
            </strong>
          )}
        </footer>
      </section>
    </FloatingWindow>
  );
}
