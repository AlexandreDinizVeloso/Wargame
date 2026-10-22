import type { TurnResolutionReport } from '../shared/types';
import { CINEMATIC_DURATION, resolutionPhase } from '../shared/cinematics';
export { CINEMATIC_DURATION } from '../shared/cinematics';
export default function TurnResolutionSequencer({
  report,
  progress,
  onSkip,
  onReplay,
}: {
  report: TurnResolutionReport;
  progress: number;
  onSkip: () => void;
  onReplay: () => void;
}) {
  const phase = resolutionPhase(progress * CINEMATIC_DURATION);
  const decree =
    report.diplomaticChanges.find((c) => /WAR|PEACE|ALLIANCE/.test(c.action))?.text ??
    report.events.find((e) => /ATO |Era d|Hegemonia/.test(e));
  const title =
    phase === 'decrees'
      ? 'Decretos, Diplomacia & Eras'
      : phase === 'march'
        ? 'Marcha Simultânea dos Exércitos'
        : 'Confrontos & Cercos';
  return (
    <section
      className="turn-sequencer framed-panel"
      aria-live="polite"
      aria-label={`Resolução da rodada ${report.turn}`}
      data-cinematic-phase={phase}
    >
      <small>CRÔNICA IMPERIAL · RODADA {report.turn}</small>
      <h2>
        {phase === 'decrees' ? '⚜' : phase === 'march' ? '⚑' : '⚔'} {title}
      </h2>
      <p>
        {phase === 'decrees'
          ? (decree ?? 'Os conselhos selam os decretos desta rodada.')
          : phase === 'march'
            ? `${report.movements.length} movimento(s) pelas terras e mares.`
            : `${report.battles.length} batalha(s) · ${report.sieges.length} cerco(s).`}
      </p>
      <progress max={1} value={progress} />
      <div>
        <button onClick={onSkip} aria-label="Encerrar animação">
          ⏭️ Pular Replay
        </button>
        <button onClick={onReplay}>🔁 Rever Rodada</button>
      </div>
    </section>
  );
}
