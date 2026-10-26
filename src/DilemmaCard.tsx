import type { GameView } from '../shared/types';
import {
  COUNCIL_CATEGORIES,
  dilemmaBlock,
  dilemmaConsequences,
  dilemmaDefinition,
} from '../shared/dilemmas';
import { activeCouncilEffects, councilModifierLabels } from '../shared/councilEffects';
import { reservedResources } from '../shared/rules';
import { OrnatePanelFrame, type Command } from './ui';

export function CouncilEffectsPanel({ game, playerId }: { game: GameView; playerId: string }) {
  const me = game.players.find((p) => p.id === playerId),
    effects = activeCouncilEffects(me, game.turn);
  if (!effects.length) return null;
  return (
    <section className="council-effects-ledger" aria-label="Efeitos ativos do Conselho">
      <h3>⚜ Compromissos do Conselho</h3>
      {effects.map((effect) => (
        <article key={effect.id} data-council-effect={effect.id}>
          <strong>{effect.label}</strong>
          <small>
            {effect.expiresTurn - game.turn + 1} rodada(s) restante(s) · até a rodada{' '}
            {effect.expiresTurn}
            {effect.provinceId
              ? ` · ${game.provinces.find((p) => p.id === effect.provinceId)?.name ?? effect.provinceId}`
              : ''}
          </small>
          <ul>
            {councilModifierLabels(effect.modifiers).map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
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
  const reserved = reservedResources(
    { ...game, orders: { [playerId]: game.plannedOrders } },
    playerId,
  );
  const costs = { gold: reserved.gold, manpower: reserved.manpower, authority: reserved.influence };
  const region = game.provinces.find((p) => p.id === active.targetProvinceId);
  return (
    <section
      className="dilemma-card framed-panel"
      aria-label="Dilema Nacional"
      data-dilemma={active.id}
    >
      <OrnatePanelFrame variant="decree" seal="top-right" />
      <small>
        ⚜ CONSELHO · RODADA {active.turn} ·{' '}
        <span className="council-category">{COUNCIL_CATEGORIES[dilemma.category]}</span>
      </small>
      <h3>{dilemma.name}</h3>
      <p>{dilemma.description}</p>
      {active.context && (
        <small>
          {active.context}
          {region ? ` Região em foco: ${region.name}.` : ''}
        </small>
      )}
      <div>
        {dilemma.options.map((option, index) => {
          const reason = dilemmaBlock(me, option, costs);
          const payment = [
            option.gold < 0 ? `${-option.gold} 🪙 Ouro` : null,
            option.manpower < 0 ? `${-option.manpower} ⛺ Recrutas` : null,
            option.authority < 0 ? `${-option.authority} 👑 Autoridade` : null,
          ].filter(Boolean);
          return (
            <button
              key={option.effect}
              data-dilemma-option={option.effect}
              disabled={me.ready || !!reason}
              title={reason ?? option.text}
              onClick={() => command({ type: 'CHOOSE_DILEMMA', option: index as 0 | 1 })}
            >
              <strong>{option.label}</strong>
              <span>{option.text}</span>
              <b className="dilemma-costs">
                {payment.length
                  ? `Custo imediato: ${payment.join(' + ')}`
                  : 'Sem custo inicial · compromisso nas próximas rodadas'}
              </b>
              <ul className="dilemma-consequences">
                {dilemmaConsequences(option).map((consequence) => (
                  <li key={consequence}>{consequence}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <small>
        As consequências começam agora; a duração inclui esta rodada. Sem decisão, a opção A será
        aplicada. Custos pagos respeitam os recursos já reservados em ordens. Consulte os efeitos
        ativos em Minha Nação.
      </small>
    </section>
  );
}
