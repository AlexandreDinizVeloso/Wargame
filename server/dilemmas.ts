import { dilemmaFor, dilemmaDefinition, dilemmaBlock } from '../shared/dilemmas';
import { spendNationAuthority, syncNationAuthority, getNationAuthority } from '../shared/economy';
import type { GameState, TurnResolutionReport } from '../shared/types';
import { assert, playerOf } from './state';
import { notify } from './notifications';
export function issueDilemmas(g: GameState) {
  if (g.phase !== 'planning' || g.turn % 4 !== 0) return;
  for (const p of g.players)
    if (
      g.provinces.some((q) => q.ownerId === p.id) &&
      !p.activeDilemma &&
      p.lastDilemmaTurn !== g.turn
    )
      p.activeDilemma = dilemmaFor(g.seed, p.id, g.turn);
}
export function chooseDilemma(
  g: GameState,
  id: string,
  index: 0 | 1,
  automatic = false,
  report?: TurnResolutionReport,
) {
  const p = playerOf(g, id),
    active = p.activeDilemma;
  assert(active && active.turn === g.turn, 'Não há dilema ativo nesta rodada.');
  assert(automatic || !p.ready, 'Reabra suas ordens para escolher o dilema.');
  const definition = dilemmaDefinition(active);
  assert(definition, 'Dilema desconhecido.');
  const choice = definition.options[index];
  assert(!dilemmaBlock(p, choice), dilemmaBlock(p, choice) ?? 'Recursos insuficientes.');
  p.gold += choice.gold;
  p.manpower = Math.min(p.manpowerCap, p.manpower + choice.manpower);
  if (choice.authority >= 0) p.militaryXP += choice.authority;
  else if (!spendNationAuthority(p, -choice.authority)) p.prestige += choice.authority;
  syncNationAuthority(p);
  p.lastDilemmaTurn = g.turn;
  p.activeDilemma = null;
  const text = `${p.nation} — ${definition.name}: ${choice.label}${automatic ? ' (regência automática)' : ''}. Ouro ${choice.gold >= 0 ? '+' : ''}${choice.gold}; Recrutas ${choice.manpower >= 0 ? '+' : ''}${choice.manpower}; Autoridade ${choice.authority >= 0 ? '+' : ''}${choice.authority}.`;
  report?.events.push(text);
  notify(g, { type: 'ECONOMY', severity: 'INFO', involvesPlayerIds: [id], text });
}
export function resolveUnansweredDilemmas(g: GameState, report: TurnResolutionReport) {
  for (const p of g.players)
    if (p.activeDilemma) {
      const d = dilemmaDefinition(p.activeDilemma)!;
      const choice =
        p.bot && p.gold >= -d.options[1].gold && (p.manpower < 10 || getNationAuthority(p) < 25)
          ? 1
          : 0;
      chooseDilemma(g, p.id, choice, true, report);
    }
}
