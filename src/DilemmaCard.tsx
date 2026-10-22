import type { GameView } from '../shared/types';
import { dilemmaDefinition, dilemmaBlock } from '../shared/dilemmas';
import type { Command } from './ui';
export default function DilemmaCard({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId),
    active = me?.activeDilemma;
  if (!me || !active) return null;
  const dilemma = dilemmaDefinition(active);
  if (!dilemma) return null;
  return (
    <section
      className="dilemma-card framed-panel"
      aria-label="Dilema Nacional"
      data-dilemma={active.id}
    >
      <small>⚜ DECISÃO DO CONSELHO · RODADA {active.turn}</small>
      <h3>{dilemma.name}</h3>
      <p>{dilemma.description}</p>
      <div>
        {dilemma.options.map((option, index) => (
          <button
            key={option.label}
            disabled={me.ready || !!dilemmaBlock(me, option)}
            title={dilemmaBlock(me, option) ?? option.text}
            onClick={() => command({ type: 'CHOOSE_DILEMMA', option: index as 0 | 1 })}
          >
            <strong>{option.label}</strong>
            <span>{option.text}</span>
            <b>
              {option.gold >= 0 ? '+' : ''}
              {option.gold} 🪙 · {option.manpower >= 0 ? '+' : ''}
              {option.manpower} ⛺ · {option.authority >= 0 ? '+' : ''}
              {option.authority} 👑
            </b>
          </button>
        ))}
      </div>
      <small>
        Sem escolha, a opção A será aplicada na resolução. Recrutas respeitam o teto da reserva;
        Autoridade comprometida será recuperada pelas próximas rodadas.
      </small>
    </section>
  );
}
