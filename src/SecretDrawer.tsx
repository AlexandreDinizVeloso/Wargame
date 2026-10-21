import type { GameView } from '../shared/types';
import { objectiveProgress } from '../shared/strategy';
import { Meter, type Command } from './ui';
export default function SecretDrawer({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId)!;
  return (
    <div className="secret-ledger">
      <h2>🎯 Meu Objetivo Secreto</h2>
      <p>
        {me.selectedObjectiveId
          ? 'Cumpra todos os requisitos ao fim de uma rodada para vencer.'
          : 'Escolha uma carta na primeira rodada. Se não escolher, a primeira será adotada ao resolver.'}
      </p>
      {me.secretObjectives
        .filter((c) => !me.selectedObjectiveId || c.id === me.selectedObjectiveId)
        .map((c) => (
          <section className="secret-card" key={c.id}>
            <h3>{c.name}</h3>
            {c.rivalId && (
              <p>
                Rival: {game.players.find((p) => p.id === c.rivalId)?.nation} · capital original:{' '}
                {game.provinces.find((p) => p.id === c.capitalId)?.name}
              </p>
            )}
            {objectiveProgress(game, me, c).map((r) => (
              <Meter
                key={r.key}
                label={r.label}
                value={r.progress * 100}
                display={`${Math.floor(r.value * 10) / 10} / ${r.target}`}
              />
            ))}
            {game.turn === 1 && !me.ready && (
              <button
                className="primary"
                onClick={() => command({ type: 'CHOOSE_SECRET_OBJECTIVE', objectiveId: c.id })}
              >
                {me.selectedObjectiveId === c.id ? 'Carta escolhida' : 'Escolher esta carta'}
              </button>
            )}
          </section>
        ))}
    </div>
  );
}
