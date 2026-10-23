import { planMassRecruitment } from '../shared/massRecruitment';
import type { GameState, PlayerOrder, RecruitmentComposition } from '../shared/types';
import { notify } from './notifications';
import { assert } from './state';

export function executeMassRecruitment(
  game: GameState,
  playerId: string,
  composition: RecruitmentComposition,
  submit: (game: GameState, playerId: string, order: PlayerOrder) => void,
) {
  const plan = planMassRecruitment(game, playerId, composition);
  assert(plan.orders.length > 0, plan.reasons.join(' ') || 'Nenhuma tropa disponível.');
  for (const order of plan.orders) submit(game, playerId, order);
  const count = Object.values(plan.allocated).reduce((sum, value) => sum + value, 0);
  const missing = Object.values(plan.unfilled).reduce((sum, value) => sum + value, 0);
  notify(game, {
    type: 'ECONOMY',
    severity: 'INFO',
    involvesPlayerIds: [playerId],
    focusProvinceId: plan.orders[0].provinceId,
    text:
      `⛺ Recrutamento em massa: ${count} tropas distribuídas entre ${plan.orders.length} cidades. ` +
      `Reservados ${plan.cost.gold} Ouro e ${plan.cost.manpower} recrutas.` +
      (missing ? ` ${missing} tropas sem vaga ou recursos nesta rodada.` : ''),
  });
}
