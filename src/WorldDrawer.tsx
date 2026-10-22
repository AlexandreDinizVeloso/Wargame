import { goldRules } from '../shared/factions';
import { MARITIME_CAP, seaTradeNodes } from '../shared/maritime';
import type { GameView } from '../shared/types';
import { EVENTS, hegemonicThreat, SEASONS } from '../shared/strategy';
import { CoatOfArms, Meter, type Command } from './ui';
export default function WorldDrawer({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const season = SEASONS[game.season];
  return (
    <div className="world-ledger">
      {game.matchConfig.scenarioId === 'IRON_CROWN_EUROPE' && (
        <section className="imperial-diet">
          <h3>👑 Dieta Imperial · Coroa Continental</h3>
          <p>
            Imperador:{' '}
            {game.players.find((p) => p.id === game.diet.emperorId)?.nation ?? 'Trono vago'} ·
            Autoridade {game.diet.imperialAuthority}%
          </p>
          <label>
            Seu voto imperial
            <select
              aria-label="Voto imperial"
              value={game.diet.votes[playerId] ?? playerId}
              disabled={game.phase !== 'planning'}
              onChange={(e) => command({ type: 'CAST_IMPERIAL_VOTE', candidateId: e.target.value })}
            >
              {game.players
                .filter((p) => game.diet.memberRealmIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nation}
                  </option>
                ))}
            </select>
          </label>
          <small>
            Eleição a cada quatro rodadas; cada reino tem um voto. A Coroa concede prestígio e, com
            75 de autoridade, renda adicional.
          </small>
        </section>
      )}
      <h2>{season.icon} Mundo & Coalizões</h2>
      <h3>
        {season.name} · {1550 + Math.floor((game.turn - 1) / 4)}
      </h3>
      <p>{season.effect}</p>
      {game.globalEvent ? (
        <section className="warning-box">
          <h3>{EVENTS[game.globalEvent.id].name}</h3>
          <p>
            {EVENTS[game.globalEvent.id].effect} · até a rodada {game.globalEvent.endsTurn}
          </p>
        </section>
      ) : (
        <p className="muted">
          Uma crise global é sorteada a cada quatro rodadas e dura duas rodadas.
        </p>
      )}
      <details className="sea-trade-ledger">
        <summary>⚓ Rotas marítimas e cidades independentes</summary>
        <p>
          Navio de guerra e transporte livres disputam renda de 3–6 ouro por mar, até{' '}
          {goldRules(game) ? 40 : MARITIME_CAP} por nação. Empates e bloqueios impedem o
          recebimento.
        </p>
        {seaTradeNodes(game).map((n) => (
          <p key={n.seaId}>
            <b>{n.name}</b> · {n.value} ouro ·{' '}
            {n.contested
              ? 'disputado'
              : (game.players.find((p) => p.id === n.ownerId)?.nation ?? 'livre')}
          </p>
        ))}
        <p>
          Cidades independentes ricas recebem até duas tropas a cada quatro rodadas, até 12; fortes
          nos níveis 2 e 4 de desenvolvimento. A evolução é suspensa sob cerco ou invasão.
        </p>
      </details>
      <h3>Ameaça e contenção</h3>
      <p>
        Expansão agressiva ≥{goldRules(game) ? 55 : 60} ou controle de 40% das terras permite formar
        uma coalizão. Paz reduz a ameaça em 8 por rodada.
      </p>
      {game.players.map((p) => {
        const c = game.coalitions.find((c) => c.targetId === p.id),
          member = c?.memberIds.includes(playerId);
        return (
          <section key={p.id} className="coalition-card">
            <CoatOfArms nationId={p.nationId} />
            <strong>{p.nation}</strong>
            <Meter label="Expansão agressiva" value={p.aggressiveExpansion} />
            <small>
              {c?.memberIds.map((id) => game.players.find((p) => p.id === id)?.nation).join(', ') ||
                'Sem coalizão'}
            </small>
            {p.id !== playerId && hegemonicThreat(game, p.id) && (
              <button
                disabled={game.phase !== 'planning' || !!c?.warId}
                onClick={() =>
                  command({
                    type: member ? 'DECLARE_COALITION_WAR' : 'JOIN_COALITION',
                    targetRealmId: p.id,
                  })
                }
              >
                {c?.warId
                  ? 'Contenção em andamento'
                  : member
                    ? '⚔️ Declarar Guerra de Contenção'
                    : '🤝 Formar / ingressar na coalizão'}
              </button>
            )}
          </section>
        );
      })}
      <p className="success-box">
        Coalizões em guerra: +20% moral e −25% manutenção para os membros.
      </p>
    </div>
  );
}
