import { useEffect, useRef, useState } from 'react';
import { MAX_MASS_RECRUITMENT, planMassRecruitment } from '../shared/massRecruitment';
import { reservedResources } from '../shared/rules';
import type { GameView, RecruitmentComposition } from '../shared/types';
import { FloatingWindow } from './FloatingWindow';
import { goldNumber, manpowerNumber } from './resourceNumbers';
import type { Command } from './ui';

const UNITS: { id: keyof RecruitmentComposition; name: string; icon: string }[] = [
  { id: 'infantry', name: 'Infantarias', icon: '🛡️' },
  { id: 'cavalry', name: 'Cavalarias', icon: '🐎' },
  { id: 'artillery', name: 'Artilharias', icon: '💣' },
];
const total = (composition: RecruitmentComposition) =>
  composition.infantry + composition.cavalry + composition.artillery;
const compositionLabel = (composition: RecruitmentComposition) =>
  UNITS.filter((unit) => composition[unit.id] > 0)
    .map((unit) => `${composition[unit.id]} ${unit.icon}`)
    .join(' · ') || '—';

export default function QuickActionsPanel({
  game,
  playerId,
  command,
  onClose,
  active,
  onActivate,
}: {
  game: GameView;
  playerId: string;
  command: Command;
  onClose: () => void;
  active: boolean;
  onActivate: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);
  const [composition, setComposition] = useState<RecruitmentComposition>({
    infantry: 6,
    cavalry: 0,
    artillery: 0,
  });
  const me = game.players.find((player) => player.id === playerId)!;
  const plan = planMassRecruitment(game, playerId, composition);
  const reserved = reservedResources(
    { ...game, orders: { [playerId]: game.plannedOrders } },
    playerId,
  );
  const ready = game.phase !== 'planning' || me.ready;
  const allocated = total(plan.allocated),
    unfilled = total(plan.unfilled);
  const setQuantity = (unit: keyof RecruitmentComposition, value: string) => {
    const parsed = Number(value);
    setComposition((current) => ({
      ...current,
      [unit]: Math.max(
        0,
        Math.min(
          MAX_MASS_RECRUITMENT - (total(current) - current[unit]),
          Number.isFinite(parsed) ? Math.floor(parsed) : 0,
        ),
      ),
    }));
  };
  return (
    <FloatingWindow
      id="quick-actions"
      rootRef={root}
      title="⚡ Ações Rápidas"
      role="dialog"
      anchor="center"
      width={680}
      height={650}
      minWidth={340}
      minHeight={300}
      className="strategy-modal quick-actions-window"
      bodyClassName="quick-actions-body"
      active={active}
      onActivate={onActivate}
      onClose={onClose}
    >
      <section aria-label="Recrutamento em Massa" className="mass-recruitment-panel">
        <h3>⛺ Recrutamento em Massa</h3>
        <p>
          Escolha as tropas. O conselho distribui o recrutamento entre suas cidades com vagas,
          edifícios e recursos disponíveis.
        </p>
        <div className="quick-action-budget">
          <span>
            Ouro livre <strong>{goldNumber(Math.max(0, me.gold - reserved.gold))} 🪙</strong>
          </span>
          <span>
            Recrutas livres{' '}
            <strong>{manpowerNumber(Math.max(0, me.manpower - reserved.manpower))} ⛺</strong>
          </span>
        </div>
        <div className="mass-recruitment-inputs">
          {UNITS.map((unit) => (
            <label key={unit.id}>
              <span>
                {unit.icon} {unit.name}
              </span>
              <input
                type="number"
                aria-label={`${unit.name} para recrutar`}
                min={0}
                max={MAX_MASS_RECRUITMENT}
                step={1}
                value={composition[unit.id]}
                disabled={ready}
                onChange={(event) => setQuantity(unit.id, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="fine-print">
          Cidades com ordens preparadas são preservadas. Cavalaria e artilharia precisam da
          infraestrutura adequada. As tropas são entregues na resolução da rodada.
        </p>
        <div className="mass-recruitment-summary" aria-live="polite">
          <span>
            Solicitado <strong>{total(plan.requested)}</strong>
          </span>
          <span>
            Disponível agora <strong data-mass-recruitment-allocated>{allocated}</strong>
          </span>
          <span>
            Sem vaga ou recursos <strong>{unfilled}</strong>
          </span>
        </div>
        <div className="mass-recruitment-cost" data-mass-recruitment-cost>
          <strong>Custo reservado</strong>
          <span>
            {goldNumber(plan.cost.gold)} 🪙 · {manpowerNumber(plan.cost.manpower)} ⛺
          </span>
        </div>
        {unfilled > 0 && total(plan.requested) > 0 && (
          <p className="warning-box">
            O pedido será atendido parcialmente: {allocated} de {total(plan.requested)} tropas.{' '}
            {unfilled} ficam sem recrutamento nesta rodada.
          </p>
        )}
        {plan.byProvince.length > 0 ? (
          <table className="mass-recruitment-distribution">
            <caption>Distribuição automática entre cidades</caption>
            <thead>
              <tr>
                <th>Cidade</th>
                <th>Tropas</th>
                <th>Custo</th>
              </tr>
            </thead>
            <tbody>
              {plan.byProvince.map((row) => (
                <tr key={row.provinceId} data-mass-recruitment-city={row.provinceId}>
                  <td>
                    {game.provinces.find((province) => province.id === row.provinceId)?.name ??
                      row.provinceId}
                  </td>
                  <td>{compositionLabel(row.composition)}</td>
                  <td>
                    {goldNumber(row.cost.gold)} 🪙 · {manpowerNumber(row.cost.manpower)} ⛺
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">
            Nenhuma cidade consegue atender este pedido com os recursos livres.
          </p>
        )}
        {plan.reasons.length > 0 && (
          <details className="mass-recruitment-reasons">
            <summary>Limites de recrutamento</summary>
            <ul>
              {plan.reasons.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
        <button
          className="primary mass-recruitment-confirm"
          disabled={ready || allocated === 0}
          onClick={() => command({ type: 'MASS_RECRUIT', composition })}
        >
          {me.ready
            ? 'Reabra suas ordens para recrutar'
            : `Recrutar em Massa · ${allocated} tropas`}
        </button>
      </section>
    </FloatingWindow>
  );
}
